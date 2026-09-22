"""Per-school WhatsApp: the school's own connection, its approved templates,
sending, and delivery reports.

How a message goes out
    Notices (and automatic alerts, via app.core.notify) put a WhatsApp
    recipient row in the queue (status "queued"). A background loop
    (main._whatsapp_loop) calls dispatch_queued(), which sends each one through
    the school's provider using the template mapped to the notice's category,
    and records "sent" or "failed" (or "skipped" with the reason: not
    connected, no template, no mobile number, plan quota used up). The
    provider then reports delivery back to the school's webhook, which moves
    the row to "delivered", marks it read, or records the failure.

Providers
    meta    WhatsApp Cloud API (graph.facebook.com), with the school's phone
            number id and permanent token; webhooks signed with its app secret.
    twilio  Twilio's WhatsApp sender, with the school's account SID and auth
            token; template = the approved Content SID (HX…).
    mock    Development only: nothing leaves the server, messages are
            recorded as delivered, so the whole flow can be tried out.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.core import crypto
from app.core.enums import NoticeChannel, RecipientStatus
from app.models.notice import Notice, NoticeRecipient
from app.models.user import User
from app.models.whatsapp import SchoolWhatsappConfig, SchoolWhatsappTemplate
from app.schemas.whatsapp import TemplateIn, WhatsappConfigIn

log = logging.getLogger("whatsapp")

META_API = "https://graph.facebook.com/v20.0"
TWILIO_API = "https://api.twilio.com/2010-04-01"
CATEGORIES = ("attendance", "fees", "exams", "homework", "events", "general")
BATCH = 200


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def mock_available() -> bool:
    """The test provider, like the simulated payment checkout: never offered
    outside development."""
    return settings.env.lower() in ("development", "dev", "local", "test")


# ---------- the school's connection ----------


def get_config(db: Session, school_id: int) -> Optional[SchoolWhatsappConfig]:
    return db.execute(
        select(SchoolWhatsappConfig).where(SchoolWhatsappConfig.school_id == school_id)
    ).scalar_one_or_none()


def live_config(db: Session, school_id: int) -> Optional[SchoolWhatsappConfig]:
    """The school's connection if it is switched on and usable."""
    cfg = get_config(db, school_id)
    if not cfg or not cfg.is_enabled:
        return None
    if cfg.provider == "mock" and not mock_available():
        return None
    return cfg


def webhook_path(cfg_provider: Optional[str], school_id: int) -> str:
    kind = "twilio" if cfg_provider == "twilio" else "meta"
    return f"/api/v1/public/whatsapp/{kind}/{school_id}"


def config_to_read(school_id: int, cfg: Optional[SchoolWhatsappConfig]) -> dict:
    return {
        "configured": cfg is not None,
        "provider": cfg.provider if cfg else None,
        "sender_number": cfg.sender_number if cfg else None,
        "phone_number_id": cfg.phone_number_id if cfg else None,
        "business_account_id": cfg.business_account_id if cfg else None,
        "account_sid": cfg.account_sid if cfg else None,
        "has_token": bool(cfg and cfg.token_enc),
        "has_app_secret": bool(cfg and cfg.app_secret_enc),
        "verify_token": cfg.verify_token if cfg else None,
        "default_country_code": cfg.default_country_code if cfg else "91",
        "auto_categories": list(cfg.auto_categories or []) if cfg else [],
        "is_enabled": bool(cfg and cfg.is_enabled),
        "last_error": cfg.last_error if cfg else None,
        "webhook_url_path": webhook_path(cfg.provider if cfg else None, school_id),
        "mock_available": mock_available(),
        "status_callbacks": bool(cfg and (cfg.provider == "meta" or (cfg.provider == "twilio" and settings.public_api_base_url))),
    }


def save_config(db: Session, tenant_id: int, school_id: int, data: WhatsappConfigIn) -> SchoolWhatsappConfig:
    if data.provider == "mock" and not mock_available():
        raise _400("The test provider is only available in development")
    cfg = get_config(db, school_id)
    fresh = cfg is None
    if fresh:
        cfg = SchoolWhatsappConfig(tenant_id=tenant_id, school_id=school_id, provider=data.provider,
                                   verify_token=secrets.token_urlsafe(24))
        db.add(cfg)
    switching = not fresh and cfg.provider != data.provider
    cfg.provider = data.provider
    cfg.sender_number = data.sender_number.strip()
    cfg.default_country_code = data.default_country_code
    cfg.auto_categories = sorted(set(data.auto_categories))
    cfg.is_enabled = data.is_enabled
    if switching:
        # Another provider's keys are no use to this one.
        cfg.token_enc = cfg.app_secret_enc = None
        cfg.phone_number_id = cfg.business_account_id = cfg.account_sid = None
    if data.provider == "meta":
        cfg.phone_number_id = (data.phone_number_id or "").strip() or None
        cfg.business_account_id = (data.business_account_id or "").strip() or None
        cfg.account_sid = None
        if not cfg.phone_number_id:
            raise _400("Enter the phone number ID from Meta's WhatsApp setup")
    elif data.provider == "twilio":
        cfg.account_sid = (data.account_sid or "").strip() or None
        cfg.phone_number_id = cfg.business_account_id = None
        if not cfg.account_sid or not cfg.account_sid.startswith("AC"):
            raise _400("Enter the Twilio account SID (it starts with AC)")
    if data.token:
        cfg.token_enc = crypto.encrypt(data.token.strip())
    if data.app_secret:
        cfg.app_secret_enc = crypto.encrypt(data.app_secret.strip())
    if data.provider in ("meta", "twilio") and not cfg.token_enc:
        raise _400("Enter the access token" if data.provider == "meta" else "Enter the Twilio auth token")
    cfg.last_error = None
    db.commit()
    db.refresh(cfg)
    return cfg


def delete_config(db: Session, school_id: int) -> None:
    cfg = get_config(db, school_id)
    if cfg:
        db.delete(cfg)
        db.commit()


# ---------- templates ----------


def list_templates(db: Session, school_id: int) -> list[SchoolWhatsappTemplate]:
    return list(db.execute(
        select(SchoolWhatsappTemplate).where(SchoolWhatsappTemplate.school_id == school_id)
        .order_by(SchoolWhatsappTemplate.purpose)
    ).scalars())


def save_templates(db: Session, tenant_id: int, school_id: int, rows: list[TemplateIn]) -> list[SchoolWhatsappTemplate]:
    """Replace the school's template map with these rows (one per purpose)."""
    seen = set()
    for r in rows:
        if r.purpose in seen:
            raise _400(f"Two templates for {r.purpose}; keep one")
        seen.add(r.purpose)
    existing = {t.purpose: t for t in list_templates(db, school_id)}
    for purpose, t in existing.items():
        if purpose not in seen:
            db.delete(t)
    for r in rows:
        t = existing.get(r.purpose) or SchoolWhatsappTemplate(tenant_id=tenant_id, school_id=school_id, purpose=r.purpose)
        t.template_name, t.language = r.template_name.strip(), r.language.strip()
        db.add(t)
    db.commit()
    return list_templates(db, school_id)


def _template(db: Session, school_id: int, purpose: str) -> Optional[SchoolWhatsappTemplate]:
    return db.execute(
        select(SchoolWhatsappTemplate).where(SchoolWhatsappTemplate.school_id == school_id,
                                             SchoolWhatsappTemplate.purpose == purpose)
    ).scalar_one_or_none()


def template_for(db: Session, school_id: int, category: str) -> Optional[SchoolWhatsappTemplate]:
    """The notice's own category's template, else the general one."""
    return _template(db, school_id, category) or _template(db, school_id, "general")


# ---------- numbers ----------


def normalize_phone(raw: Optional[str], default_cc: str = "91") -> Optional[str]:
    """E.164 digits with a leading + (+919876543210), or None if it can't be one."""
    if not raw:
        return None
    s = raw.strip()
    plus = s.startswith("+")
    digits = re.sub(r"\D", "", s)
    if s.startswith("00"):
        digits, plus = digits[2:], True
    if not plus:
        digits = digits.lstrip("0")
        if len(digits) <= 10:
            digits = default_cc + digits
    if not 8 <= len(digits) <= 15:
        return None
    return "+" + digits


# ---------- sending ----------


class SendError(Exception):
    pass


def _clip(text: str, n: int) -> str:
    """Template parameters can't hold newlines or very long text."""
    t = re.sub(r"\s+", " ", text or "").strip()
    return t if len(t) <= n else t[: n - 1] + "…"


def _send_meta(cfg: SchoolWhatsappConfig, to: str, tpl: SchoolWhatsappTemplate, params: list[str]) -> str:
    body = {
        "messaging_product": "whatsapp",
        "to": to.lstrip("+"),
        "type": "template",
        "template": {
            "name": tpl.template_name,
            "language": {"code": tpl.language},
            "components": [{"type": "body", "parameters": [{"type": "text", "text": p} for p in params]}] if params else [],
        },
    }
    try:
        r = httpx.post(f"{META_API}/{cfg.phone_number_id}/messages", json=body, timeout=15,
                       headers={"Authorization": f"Bearer {crypto.decrypt(cfg.token_enc)}"})
    except httpx.HTTPError as exc:
        raise SendError(f"Couldn't reach WhatsApp: {exc.__class__.__name__}") from exc
    data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code >= 400:
        err = (data.get("error") or {}) if isinstance(data, dict) else {}
        raise SendError(f"WhatsApp refused it: {err.get('message') or r.text[:200]}")
    try:
        return data["messages"][0]["id"]
    except (KeyError, IndexError, TypeError) as exc:
        raise SendError("WhatsApp gave no message id") from exc


def _send_twilio(cfg: SchoolWhatsappConfig, to: str, tpl: SchoolWhatsappTemplate, params: list[str], school_id: int) -> str:
    form = {
        "From": f"whatsapp:{normalize_phone(cfg.sender_number, cfg.default_country_code)}",
        "To": f"whatsapp:{to}",
        "ContentSid": tpl.template_name,
        "ContentVariables": json.dumps({str(i + 1): p for i, p in enumerate(params)}),
    }
    if settings.public_api_base_url:
        form["StatusCallback"] = settings.public_api_base_url.rstrip("/") + webhook_path("twilio", school_id)
    try:
        r = httpx.post(f"{TWILIO_API}/Accounts/{cfg.account_sid}/Messages.json", data=form, timeout=15,
                       auth=(cfg.account_sid, crypto.decrypt(cfg.token_enc)))
    except httpx.HTTPError as exc:
        raise SendError(f"Couldn't reach Twilio: {exc.__class__.__name__}") from exc
    data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code >= 400:
        raise SendError(f"Twilio refused it: {data.get('message') or r.text[:200]}")
    if not data.get("sid"):
        raise SendError("Twilio gave no message id")
    return data["sid"]


def send_template(cfg: SchoolWhatsappConfig, to: str, tpl: SchoolWhatsappTemplate, params: list[str]) -> str:
    """Send one template message; the provider's message id, or SendError."""
    if cfg.provider == "meta":
        return _send_meta(cfg, to, tpl, params)
    if cfg.provider == "twilio":
        return _send_twilio(cfg, to, tpl, params, cfg.school_id)
    if cfg.provider == "mock" and mock_available():
        return "mock-" + secrets.token_hex(8)
    raise SendError("WhatsApp is not connected")


def _params_for(purpose: str, title: str, body: str) -> list[str]:
    return [_clip(body, 500)] if purpose == "otp" else [_clip(title, 120), _clip(body, 900)]


def send_test(db: Session, school_id: int, to_raw: str, purpose: str) -> dict:
    cfg = get_config(db, school_id)
    if not cfg:
        raise _400("Connect WhatsApp first")
    to = normalize_phone(to_raw, cfg.default_country_code)
    if not to:
        raise _400("That doesn't look like a mobile number")
    tpl = _template(db, school_id, purpose) if purpose == "otp" else template_for(db, school_id, purpose)
    if not tpl:
        raise _400(f"Add an approved template for “{purpose}” first")
    params = ["123456"] if purpose == "otp" else ["Test message", "WhatsApp is connected to the school ERP."]
    try:
        mid = send_template(cfg, to, tpl, params)
    except SendError as exc:
        cfg.last_error = str(exc)[:500]
        db.commit()
        return {"ok": False, "to": to, "provider_message_id": None, "detail": str(exc)}
    cfg.last_error = None
    db.commit()
    return {"ok": True, "to": to, "provider_message_id": mid,
            "detail": "Sent. It should arrive on that phone shortly." if cfg.provider != "mock" else "Recorded by the test provider (nothing was sent)."}


# ---------- quota ----------


def _quota_left(db: Session, tenant_id: int) -> Optional[int]:
    """Messages the plan still allows in the rolling 30 days; None = no limit set."""
    from app.services import usage_service

    usage = usage_service.get_tenant_usage(db, tenant_id)
    limit = usage.whatsapp_sent.limit
    if not limit:
        return None
    return max(limit - usage.whatsapp_sent.used, 0)


# ---------- the queue ----------


def queue_for_notice(db: Session, n: Notice, user_ids: list[int]) -> int:
    """Add WhatsApp rows for these people to a notice (they are sent by the
    dispatcher). Caller commits. Returns how many were queued."""
    for uid in dict.fromkeys(user_ids):
        db.add(NoticeRecipient(tenant_id=n.tenant_id, school_id=n.school_id, notice_id=n.id, user_id=uid,
                               channel=NoticeChannel.whatsapp, status=RecipientStatus.queued))
    return len(set(user_ids))


def dispatch_queued(db: Session, limit: int = BATCH) -> dict:
    """Send what is waiting, school by school. Safe to run from several
    workers: each row is claimed with SKIP LOCKED."""
    rows = list(db.execute(
        select(NoticeRecipient)
        .where(NoticeRecipient.channel == NoticeChannel.whatsapp, NoticeRecipient.status == RecipientStatus.queued)
        .order_by(NoticeRecipient.id)
        .limit(limit)
        .with_for_update(skip_locked=True)
    ).scalars())
    if not rows:
        db.commit()
        return {"sent": 0, "failed": 0, "skipped": 0}
    from app.services import usage_service

    counts = {"sent": 0, "failed": 0, "skipped": 0}
    cfgs: dict[int, Optional[SchoolWhatsappConfig]] = {}
    quota: dict[int, Optional[int]] = {}
    notices: dict[int, Notice] = {}
    now = datetime.now(timezone.utc)

    def skip(rec: NoticeRecipient, why: str) -> None:
        rec.status, rec.error = RecipientStatus.skipped, why[:500]
        counts["skipped"] += 1

    for rec in rows:
        if rec.school_id not in cfgs:
            cfgs[rec.school_id] = live_config(db, rec.school_id)
        cfg = cfgs[rec.school_id]
        if cfg is None:
            skip(rec, "WhatsApp is not connected for this school")
            continue
        n = notices.get(rec.notice_id) or db.get(Notice, rec.notice_id)
        notices[rec.notice_id] = n
        category = n.category.value if hasattr(n.category, "value") else str(n.category or "general")
        tpl = template_for(db, rec.school_id, category)
        if tpl is None:
            skip(rec, f"No approved WhatsApp template for {category} messages")
            continue
        user = db.get(User, rec.user_id)
        to = normalize_phone(user.phone if user else None, cfg.default_country_code)
        if not to:
            skip(rec, "No mobile number on this account")
            continue
        if rec.tenant_id not in quota:
            quota[rec.tenant_id] = _quota_left(db, rec.tenant_id)
        if quota[rec.tenant_id] is not None and quota[rec.tenant_id] <= 0:
            skip(rec, "The plan's WhatsApp allowance for the last 30 days is used up")
            continue
        rec.to_phone = to
        try:
            rec.provider_message_id = send_template(cfg, to, tpl, _params_for(tpl.purpose, n.title, n.body))
        except SendError as exc:
            rec.status, rec.error = RecipientStatus.failed, str(exc)[:500]
            counts["failed"] += 1
            continue
        rec.status, rec.sent_at, rec.error = RecipientStatus.sent, now, None
        if cfg.provider == "mock":
            rec.status = RecipientStatus.delivered
        counts["sent"] += 1
        if quota[rec.tenant_id] is not None:
            quota[rec.tenant_id] -= 1
        # Billing counts what was actually handed to the provider.
        usage_service.increment_usage_counter(db, rec.tenant_id, "whatsapp", n=1)
    db.commit()
    return counts


# ---------- codes (sign-in, password reset) ----------


def send_code(db: Session, user: User, code: str) -> bool:
    """Send a one-time code straight away through the school's "otp"
    template. False when the school has no WhatsApp, no such template, or
    the person has no mobile number. Codes are never written to notices."""
    if not user.school_id:
        return False
    cfg = live_config(db, user.school_id)
    if not cfg:
        return False
    tpl = _template(db, user.school_id, "otp")
    to = normalize_phone(user.phone, cfg.default_country_code)
    if not tpl or not to:
        return False
    try:
        send_template(cfg, to, tpl, [code])
    except SendError as exc:
        log.warning("WhatsApp code for user %s not sent: %s", user.id, exc)
        return False
    from app.services import usage_service

    usage_service.increment_usage_counter(db, user.tenant_id, "whatsapp", n=1)
    db.commit()
    return True


# ---------- delivery reports ----------

_META_STATUS = {"sent": RecipientStatus.sent, "delivered": RecipientStatus.delivered,
                "read": RecipientStatus.delivered, "failed": RecipientStatus.failed}
_TWILIO_STATUS = {"queued": None, "accepted": None, "sending": None, "sent": RecipientStatus.sent,
                  "delivered": RecipientStatus.delivered, "read": RecipientStatus.delivered,
                  "undelivered": RecipientStatus.failed, "failed": RecipientStatus.failed}
_ORDER = {RecipientStatus.queued: 0, RecipientStatus.sent: 1, RecipientStatus.delivered: 2}


def _apply_status(db: Session, school_id: int, message_id: str, new: Optional[RecipientStatus],
                  read: bool, error: Optional[str]) -> bool:
    rec = db.execute(
        select(NoticeRecipient).where(NoticeRecipient.school_id == school_id,
                                      NoticeRecipient.provider_message_id == message_id)
    ).scalar_one_or_none()
    if not rec:
        return False
    if new == RecipientStatus.failed:
        rec.status, rec.error = RecipientStatus.failed, (error or "Not delivered")[:500]
    elif new is not None and _ORDER.get(new, 0) > _ORDER.get(rec.status, -1):
        # Reports can arrive out of order; never move backwards.
        rec.status = new
    if read and not rec.read_at:
        rec.read_at = datetime.now(timezone.utc)
    return True


def meta_verify(db: Session, school_id: int, mode: str, token: str, challenge: str) -> str:
    cfg = get_config(db, school_id)
    if mode == "subscribe" and cfg and cfg.verify_token and hmac.compare_digest(token or "", cfg.verify_token):
        return challenge
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed")


def meta_webhook(db: Session, school_id: int, raw: bytes, signature: Optional[str]) -> dict:
    cfg = get_config(db, school_id)
    if not cfg or cfg.provider != "meta" or not cfg.app_secret_enc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not set up")
    expected = "sha256=" + hmac.new(crypto.decrypt(cfg.app_secret_enc).encode(), raw, hashlib.sha256).hexdigest()
    if not signature or not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bad signature")
    payload = json.loads(raw or b"{}")
    updated = 0
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            for st in (change.get("value") or {}).get("statuses", []):
                s = st.get("status")
                err = "; ".join(e.get("title") or e.get("message") or "" for e in st.get("errors", []) if isinstance(e, dict)) or None
                if _apply_status(db, school_id, st.get("id", ""), _META_STATUS.get(s), s == "read", err):
                    updated += 1
    db.commit()
    return {"updated": updated}


def _twilio_signature(auth_token: str, url: str, params: dict) -> str:
    data = url + "".join(k + params[k] for k in sorted(params))
    return base64.b64encode(hmac.new(auth_token.encode(), data.encode(), hashlib.sha1).digest()).decode()


def twilio_webhook(db: Session, school_id: int, params: dict, signature: Optional[str]) -> dict:
    cfg = get_config(db, school_id)
    if not cfg or cfg.provider != "twilio" or not cfg.token_enc or not settings.public_api_base_url:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not set up")
    url = settings.public_api_base_url.rstrip("/") + webhook_path("twilio", school_id)
    expected = _twilio_signature(crypto.decrypt(cfg.token_enc), url, params)
    if not signature or not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bad signature")
    s = (params.get("MessageStatus") or "").lower()
    err = params.get("ErrorMessage") or (f"Error {params['ErrorCode']}" if params.get("ErrorCode") else None)
    ok = _apply_status(db, school_id, params.get("MessageSid", ""), _TWILIO_STATUS.get(s), s == "read", err)
    db.commit()
    return {"updated": int(ok)}


# ---------- what was sent ----------


def deliveries(db: Session, school_id: int, limit: int = 100) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=30)
    counts = dict(db.execute(
        select(NoticeRecipient.status, func.count())
        .where(NoticeRecipient.school_id == school_id, NoticeRecipient.channel == NoticeChannel.whatsapp,
               NoticeRecipient.created_at >= since)
        .group_by(NoticeRecipient.status)
    ).all())
    read = db.execute(
        select(func.count()).where(NoticeRecipient.school_id == school_id, NoticeRecipient.channel == NoticeChannel.whatsapp,
                                   NoticeRecipient.created_at >= since, NoticeRecipient.read_at.is_not(None))
    ).scalar_one()
    rows = db.execute(
        select(NoticeRecipient, Notice, User)
        .join(Notice, Notice.id == NoticeRecipient.notice_id)
        .join(User, User.id == NoticeRecipient.user_id, isouter=True)
        .where(NoticeRecipient.school_id == school_id, NoticeRecipient.channel == NoticeChannel.whatsapp)
        .order_by(NoticeRecipient.id.desc()).limit(limit)
    ).all()
    summary = {s.value: int(counts.get(s, 0)) for s in RecipientStatus}
    summary["read"] = int(read)
    return {
        "last_30_days": summary,
        "rows": [
            {"id": r.id, "notice_id": n.id, "notice_title": n.title,
             "category": n.category.value if hasattr(n.category, "value") else str(n.category),
             "recipient_name": u.full_name if u else None, "to_phone": r.to_phone, "status": r.status.value,
             "error": r.error, "sent_at": r.sent_at, "read_at": r.read_at, "created_at": r.created_at}
            for r, n, u in rows
        ],
    }


def platform_overview(db: Session) -> list[dict]:
    """For the super admin: every school's payment and WhatsApp connection."""
    from app.models.online_payment import SchoolPaymentGateway
    from app.models.tenant import School, Tenant

    since = date.today() - timedelta(days=30)
    sent = dict(db.execute(
        select(NoticeRecipient.school_id, func.count())
        .where(NoticeRecipient.channel == NoticeChannel.whatsapp,
               NoticeRecipient.status.in_((RecipientStatus.sent, RecipientStatus.delivered)),
               func.date(NoticeRecipient.created_at) >= since)
        .group_by(NoticeRecipient.school_id)
    ).all())
    out = []
    for school, tenant in db.execute(
        select(School, Tenant).join(Tenant, Tenant.id == School.tenant_id).order_by(Tenant.name, School.name)
    ).all():
        gw = db.execute(select(SchoolPaymentGateway).where(SchoolPaymentGateway.school_id == school.id)).scalar_one_or_none()
        wa = get_config(db, school.id)
        out.append({
            "tenant_id": tenant.id, "tenant_name": tenant.name, "school_id": school.id, "school_name": school.name,
            "payments": {"connected": gw is not None, "enabled": bool(gw and gw.is_enabled), "provider": gw.provider if gw else None,
                         "mode": ("live" if gw.key_id.startswith("rzp_live_") else "test") if gw else None},
            "whatsapp": {"connected": wa is not None, "enabled": bool(wa and wa.is_enabled), "provider": wa.provider if wa else None,
                         "sender_number": wa.sender_number if wa else None, "last_error": wa.last_error if wa else None,
                         "sent_30d": int(sent.get(school.id, 0))},
        })
    return out
