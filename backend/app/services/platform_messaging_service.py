"""The platform's own WhatsApp and SMS: settings, sending a new school
admin their sign-in details, and the record of what went out.

When the super admin creates a tenant, the school admin's username and
temporary password go to their mobile (and the organization's contact mobile)
on WhatsApp and by SMS, through the platform's accounts, since the new school
has nothing connected yet. "Resend sign-in details" sets a fresh temporary
password and sends it the same way. Either way the admin must choose their
own password at first sign-in, and the log keeps who was messaged and how it
went, never the password.

Sending never undoes the tenant: a channel that isn't set up is "skipped",
one the provider refuses is "failed" with the reason, and the super admin
still sees the password on screen.
"""
from __future__ import annotations

import logging
import secrets
from typing import Optional

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core import crypto
from app.core.enums import UserRole
from app.core.security import hash_password
from app.models.platform_messaging import PlatformMessageLog, PlatformMessagingChannel
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.platform_messaging import ChannelIn
from app.services.whatsapp_service import mock_available, normalize_phone

log = logging.getLogger("platform_messaging")

META_API = "https://graph.facebook.com/v20.0"
TWILIO_API = "https://api.twilio.com/2010-04-01"
MSG91_FLOW = "https://control.msg91.com/api/v5/flow"
CHANNELS = ("whatsapp", "sms")
PROVIDERS = {"whatsapp": ("meta", "twilio", "mock"), "sms": ("msg91", "twilio", "mock")}
LABEL = {"whatsapp": "WhatsApp", "sms": "SMS"}
BRAND = "BrightCampus"


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


class SendError(Exception):
    pass


# ---------- settings ----------


def _get(db: Session, channel: str) -> Optional[PlatformMessagingChannel]:
    return db.execute(select(PlatformMessagingChannel).where(PlatformMessagingChannel.channel == channel)).scalar_one_or_none()


def _read(channel: str, c: Optional[PlatformMessagingChannel]) -> dict:
    if not c:
        return {"channel": channel, "configured": False}
    return {
        "channel": channel, "configured": True, "provider": c.provider, "sender": c.sender,
        "account_id": c.account_id, "has_token": bool(c.token_enc), "template": c.template,
        "language": c.language, "default_country_code": c.default_country_code,
        "is_enabled": c.is_enabled, "last_error": c.last_error,
    }


def sign_in_url() -> str:
    return settings.web_app_url.rstrip("/") + "/"


def login_text(name: str, org: str, username: str, password: str) -> str:
    return (
        f"Welcome to {BRAND}, {name}! {org} is ready. Sign in at {sign_in_url()} "
        f"with username {username} and temporary password {password} . "
        "You will be asked to choose your own password."
    )


def overview(db: Session) -> dict:
    return {
        "whatsapp": _read("whatsapp", _get(db, "whatsapp")),
        "sms": _read("sms", _get(db, "sms")),
        "mock_available": mock_available(),
        "web_app_url": sign_in_url(),
        "sample": login_text("Priya", "Green Valley School", "admin@greenvalley.edu", "Xy7#pQ2mLk9a"),
    }


def save(db: Session, channel: str, data: ChannelIn) -> dict:
    if channel not in CHANNELS:
        raise _400("Unknown channel")
    if data.provider not in PROVIDERS[channel]:
        raise _400(f"{LABEL[channel]} can't use {data.provider}")
    if data.provider == "mock" and not mock_available():
        raise _400("The test provider is only available in development")
    c = _get(db, channel)
    has_token = bool(data.token) or bool(c and c.token_enc and c.provider == data.provider)
    if data.provider != "mock":
        if not has_token:
            raise _400({"meta": "Enter the permanent access token", "twilio": "Enter the Twilio auth token", "msg91": "Enter the MSG91 auth key"}[data.provider])
        if data.provider in ("meta", "twilio") and not (data.account_id or "").strip():
            raise _400("Enter the phone number id" if data.provider == "meta" else "Enter the Twilio account SID")
        if data.provider != "twilio" or channel == "whatsapp":
            if not (data.template or "").strip():
                raise _400("Enter the approved template" if channel == "whatsapp" else "Enter the DLT flow template id")
    if not c:
        c = PlatformMessagingChannel(channel=channel)
        db.add(c)
    c.provider = data.provider
    c.sender = data.sender.strip()
    c.account_id = (data.account_id or "").strip() or None
    if data.token:
        c.token_enc = crypto.encrypt(data.token.strip())
    elif data.provider == "mock":
        c.token_enc = None
    c.template = (data.template or "").strip() or None
    c.language = data.language
    c.default_country_code = data.default_country_code
    c.is_enabled = data.is_enabled
    c.last_error = None
    db.commit()
    return overview(db)


def remove(db: Session, channel: str) -> dict:
    c = _get(db, channel)
    if c:
        db.delete(c)
        db.commit()
    return overview(db)


# ---------- sending ----------


def _json(r: httpx.Response) -> dict:
    try:
        d = r.json()
        return d if isinstance(d, dict) else {}
    except ValueError:
        return {}


def _whatsapp(c: PlatformMessagingChannel, to: str, params: list[str]) -> str:
    if c.provider == "meta":
        body = {
            "messaging_product": "whatsapp", "to": to.lstrip("+"), "type": "template",
            "template": {"name": c.template, "language": {"code": c.language},
                         "components": [{"type": "body", "parameters": [{"type": "text", "text": p} for p in params]}]},
        }
        try:
            r = httpx.post(f"{META_API}/{c.account_id}/messages", json=body, timeout=15,
                           headers={"Authorization": f"Bearer {crypto.decrypt(c.token_enc)}"})
        except httpx.HTTPError as exc:
            raise SendError(f"Couldn't reach WhatsApp: {exc.__class__.__name__}") from exc
        d = _json(r)
        if r.status_code >= 400:
            raise SendError(f"WhatsApp refused it: {(d.get('error') or {}).get('message') or r.text[:200]}")
        try:
            return d["messages"][0]["id"]
        except (KeyError, IndexError, TypeError) as exc:
            raise SendError("WhatsApp gave no message id") from exc
    if c.provider == "twilio":
        import json

        form = {
            "From": f"whatsapp:{normalize_phone(c.sender, c.default_country_code)}", "To": f"whatsapp:{to}",
            "ContentSid": c.template, "ContentVariables": json.dumps({str(i + 1): p for i, p in enumerate(params)}),
        }
        return _twilio_post(c, form)
    if c.provider == "mock" and mock_available():
        return "mock-" + secrets.token_hex(8)
    raise SendError("WhatsApp is not set up")


def _twilio_post(c: PlatformMessagingChannel, form: dict) -> str:
    try:
        r = httpx.post(f"{TWILIO_API}/Accounts/{c.account_id}/Messages.json", data=form, timeout=15,
                       auth=(c.account_id, crypto.decrypt(c.token_enc)))
    except httpx.HTTPError as exc:
        raise SendError(f"Couldn't reach Twilio: {exc.__class__.__name__}") from exc
    d = _json(r)
    if r.status_code >= 400:
        raise SendError(f"Twilio refused it: {d.get('message') or r.text[:200]}")
    if not d.get("sid"):
        raise SendError("Twilio gave no message id")
    return d["sid"]


def _sms(c: PlatformMessagingChannel, to: str, params: list[str], text: str) -> str:
    if c.provider == "msg91":
        rec = {"mobiles": to.lstrip("+"), **{f"var{i + 1}": p for i, p in enumerate(params)}}
        try:
            r = httpx.post(MSG91_FLOW, json={"template_id": c.template, "short_url": "0", "recipients": [rec]}, timeout=15,
                           headers={"authkey": crypto.decrypt(c.token_enc), "accept": "application/json"})
        except httpx.HTTPError as exc:
            raise SendError(f"Couldn't reach MSG91: {exc.__class__.__name__}") from exc
        d = _json(r)
        if r.status_code >= 400 or d.get("type") == "error":
            raise SendError(f"MSG91 refused it: {d.get('message') or r.text[:200]}")
        return str(d.get("message") or d.get("request_id") or "msg91")
    if c.provider == "twilio":
        return _twilio_post(c, {"From": c.sender, "To": to, "Body": text})
    if c.provider == "mock" and mock_available():
        return "mock-" + secrets.token_hex(8)
    raise SendError("SMS is not set up")


def _send(db: Session, channel: str, to_raw: str, params: list[str], text: str, *,
          purpose: str, tenant_id: Optional[int], user_id: Optional[int]) -> dict:
    c = _get(db, channel)
    cc = c.default_country_code if c else "91"
    to = normalize_phone(to_raw, cc)
    result = {"channel": channel, "to": to or to_raw, "status": "sent", "error": None}
    msg_id = None
    if not to:
        result.update(status="failed", error="Not a valid mobile number")
    elif not c or not c.is_enabled:
        result.update(status="skipped", error=f"The platform's {LABEL[channel]} isn't set up")
    else:
        try:
            msg_id = _whatsapp(c, to, params) if channel == "whatsapp" else _sms(c, to, params, text)
            c.last_error = None
        except (SendError, ValueError) as exc:
            result.update(status="failed", error=str(exc)[:500])
            c.last_error = str(exc)[:500]
            log.warning("platform %s to %s failed: %s", channel, to, exc)
    db.add(PlatformMessageLog(tenant_id=tenant_id, user_id=user_id, purpose=purpose, channel=channel,
                              to_number=result["to"][:20], status=result["status"],
                              provider_message_id=msg_id, error=result["error"]))
    return result


def recipients(user: User, tenant: Tenant) -> list[str]:
    """The admin's mobile, then the organization's contact mobile, once each."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in (user.phone, tenant.contact_mobile):
        key = normalize_phone(raw) or (raw or "").strip()
        if raw and raw.strip() and key not in seen:
            seen.add(key)
            out.append(raw.strip())
    return out


def send_login(db: Session, tenant: Tenant, user: User, password: str) -> list[dict]:
    """Username and password to each mobile on WhatsApp and by SMS."""
    params = [user.full_name, tenant.name, user.email or "", password, sign_in_url()]
    text = login_text(user.full_name, tenant.name, user.email or "", password)
    results = [
        _send(db, ch, to, params, text, purpose="login", tenant_id=tenant.id, user_id=user.id)
        for to in recipients(user, tenant)
        for ch in CHANNELS
    ]
    db.commit()
    return results


def _generate_password(length: int = 12) -> str:
    import string

    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def resend_login(db: Session, tenant_id: int) -> dict:
    """A fresh temporary password for the tenant's first school admin, sent again."""
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    user = db.execute(
        select(User).where(User.tenant_id == tenant_id, User.role == UserRole.school_admin).order_by(User.id).limit(1)
    ).scalar_one_or_none()
    if not user:
        raise _400("This organization has no school admin")
    password = _generate_password()
    user.password_hash = hash_password(password)
    user.must_change_password = True
    db.commit()
    return {"email": user.email, "temporary_password": password, "sent": send_login(db, tenant, user, password)}


def send_test(db: Session, channel: str, to_raw: str) -> dict:
    if channel not in CHANNELS:
        raise _400("Unknown channel")
    params = ["Test", "Your organization", "admin@example.com", "(sample password)", sign_in_url()]
    text = f"{BRAND}: this is a test message from the platform. Sign-in details for new schools will arrive like this."
    r = _send(db, channel, to_raw, params, text, purpose="test", tenant_id=None, user_id=None)
    db.commit()
    return r


def logs(db: Session, tenant_id: Optional[int] = None, limit: int = 100) -> list[dict]:
    q = (select(PlatformMessageLog, Tenant.name).outerjoin(Tenant, Tenant.id == PlatformMessageLog.tenant_id)
         .order_by(PlatformMessageLog.id.desc()).limit(limit))
    if tenant_id is not None:
        q = q.where(PlatformMessageLog.tenant_id == tenant_id)
    return [
        {"id": m.id, "tenant_id": m.tenant_id, "tenant_name": name, "purpose": m.purpose, "channel": m.channel,
         "to_number": m.to_number, "status": m.status, "error": m.error, "created_at": m.created_at}
        for m, name in db.execute(q).all()
    ]
