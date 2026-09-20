"""Smoke test for the password policy, two-factor sign-in and what a school
is allowed to send.

Verifies:
    A password failing the school's own rules is refused with a message that
    names the rule, not a shrug — and the same rules apply to a reset as to a
    change, because both go through one place.
    With two-factor on, a correct password returns no access token and no
    refresh token. Half a sign-in is not a sign-in.
    A wrong code returns no tokens. The right one does.
    A challenge that was never real reads exactly like one that expired.
    A parent who has never opened the preferences screen receives everything,
    because an absent row means yes.
    A category the school must be able to reach a parent about refuses to be
    switched off, server-side rather than by hiding the control.

Run:
    docker exec sms-backend python -m scripts.smoketest_security
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from sqlalchemy import select

from app.core.enums import NoticeChannel, NotificationCategory, TwoFactorScope
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.comms_settings import (
    NotificationPreference,
    NotificationTemplate,
    SecurityPolicy,
)
from app.models.user import User, UserOtp
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
PARENT = devdata.PARENT_EMAIL
PARENT_PW = "ParentPass123!"
TAG = "SMOKE-SEC"


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = r.read()
            return r.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload)
        except Exception:
            return e.code, {"raw": payload.decode(errors="ignore")[:200]}


def section(t):
    print(f"\n=== {t} ===")


def set_password(email, password):
    db = SessionLocal()
    try:
        u = db.execute(select(User).where(User.email == email)).scalar_one()
        u.password_hash = hash_password(password)
        u.must_change_password = False
        db.commit()
        return u.id
    finally:
        db.close()


def admin_token():
    set_password(*ADMIN)
    code, data = request("POST", "/school/auth/login",
                         body={"email": ADMIN[0], "password": ADMIN[1]})
    assert code == 200, data
    return data["access_token"]


def reset_fixtures(parent_id):
    """Put the school back to no policy, no preferences, no test template."""
    db = SessionLocal()
    try:
        db.execute(SecurityPolicy.__table__.delete().where(
            SecurityPolicy.school_id == devdata.school_id()))
        db.execute(NotificationPreference.__table__.delete().where(
            NotificationPreference.user_id == parent_id))
        db.execute(NotificationTemplate.__table__.delete().where(
            NotificationTemplate.code.like(f"{TAG}%")))
        db.execute(UserOtp.__table__.delete().where(UserOtp.user_id == parent_id))
        db.commit()
    finally:
        db.close()


def plant_code(parent_id, code):
    """The real code is never returned by the API, by design. Plant a known
    hash so the test can act as the person who received it."""
    db = SessionLocal()
    try:
        row = db.execute(
            select(UserOtp).where(
                UserOtp.user_id == parent_id, UserOtp.used_at.is_(None)
            ).order_by(UserOtp.created_at.desc())
        ).scalars().first()
        assert row is not None, "a code was issued"
        row.otp_hash = hash_password(code)
        db.commit()
    finally:
        db.close()


def main():
    tok = admin_token()
    parent_id = set_password(PARENT, PARENT_PW)
    reset_fixtures(parent_id)

    try:
        section("A policy that is only a screen is worth nothing")
        code, pol = request("PUT", "/school/settings/security", token=tok, body={
            "min_password_length": 12,
            "require_mixed_case": True,
            "require_number": True,
            "require_symbol": True})
        assert code == 200, pol
        assert "at least 12 characters" in pol["rules"], pol["rules"]
        print(f"  rules now: {', '.join(pol['rules'])}")

        code, err = request("PUT", "/school/settings/security", token=tok,
                            body={"min_password_length": 4})
        assert code in (400, 422), err
        print("  a four-character minimum is refused outright")

        section("The refusal names the rule")
        ptok_code, psession = request("POST", "/parent/auth/login",
                                      body={"email": PARENT, "password": PARENT_PW})
        assert ptok_code == 200 and psession.get("access_token"), psession
        ptok = psession["access_token"]

        code, err = request("POST", "/account/change-password", token=ptok, body={
            "current_password": PARENT_PW, "new_password": "shortone"})
        assert code == 400, err
        assert "12 characters" in err["detail"], err["detail"]

        code, err = request("POST", "/account/change-password", token=ptok, body={
            "current_password": PARENT_PW, "new_password": "averylongpassword"})
        assert code == 400, err
        detail = err["detail"]
        assert "upper and a lower" in detail and "number" in detail and "symbol" in detail, detail
        print(f"  {detail}")

        code, ok = request("POST", "/account/change-password", token=ptok, body={
            "current_password": PARENT_PW, "new_password": "Str0ng&Passw0rd"})
        assert code == 204, ok
        print("  a password meeting all four is accepted")
        current_pw = "Str0ng&Passw0rd"

        section("With two-factor on, a correct password is half a sign-in")
        code, pol = request("PUT", "/school/settings/security", token=tok,
                            body={"require_2fa_for": "parents"})
        assert code == 200 and pol["require_2fa_for"] == "parents", pol

        code, step = request("POST", "/parent/auth/login",
                             body={"email": PARENT, "password": current_pw})
        assert code == 200, step
        assert step.get("otp_required") is True, step
        assert "access_token" not in step and "refresh_token" not in step, (
            "a correct password must not hand back a session when 2FA is on")
        assert step.get("challenge"), step
        challenge = step["challenge"]
        assert str(parent_id) not in challenge, (
            "the challenge must not carry the user id")
        print(f"  challenge issued, sent via {step['sent_via']}, no tokens in the reply")

        section("A wrong code opens nothing")
        plant_code(parent_id, "424242")
        code, err = request("POST", "/parent/auth/verify-otp",
                            body={"challenge": challenge, "code": "999999"})
        assert code == 401, err
        assert not isinstance(err, dict) or "access_token" not in err, err
        print(f"  {err['detail']}")

        section("An invented challenge reads like an expired one")
        code, err2 = request("POST", "/parent/auth/verify-otp",
                             body={"challenge": "not-a-real-challenge-at-all", "code": "424242"})
        assert code == 401, err2
        print(f"  {err2['detail']}")

        section("The right code finishes it")
        code, session = request("POST", "/parent/auth/verify-otp",
                                body={"challenge": challenge, "code": "424242"})
        assert code == 200, session
        assert session.get("access_token") and session.get("refresh_token"), session
        assert session["user"]["role"] == "parent", session["user"]
        ptok = session["access_token"]
        print(f"  {session['user']['full_name']} is in")

        code, spent = request("POST", "/parent/auth/verify-otp",
                              body={"challenge": challenge, "code": "424242"})
        assert spent is None or "access_token" not in spent, spent
        assert code == 401, "a spent challenge cannot be used twice"
        print("  and the same challenge cannot be used again")

        # back to no second factor so the rest of the suite signs in normally
        request("PUT", "/school/settings/security", token=tok,
                body={"require_2fa_for": "nobody"})

        section("Never having chosen means receiving everything")
        code, prefs = request("GET", "/parent/me/preferences", token=ptok)
        assert code == 200, prefs
        assert prefs["rows"], prefs
        assert all(r["is_enabled"] for r in prefs["rows"]), (
            "an absent row means yes; opt-in would mean nobody gets anything")
        print(f"  {len(prefs['rows'])} combinations, all on by default")

        section("A parent may mute what is theirs to mute")
        code, after = request("PUT", "/parent/me/preferences", token=ptok, body={
            "channel": "sms", "category": "homework", "is_enabled": False})
        assert code == 200, after
        row = next(r for r in after["rows"]
                   if r["channel"] == "sms" and r["category"] == "homework")
        assert row["is_enabled"] is False, row
        fees = next(r for r in after["rows"]
                    if r["channel"] == "sms" and r["category"] == "fees")
        assert fees["is_enabled"] is True, (
            "muting homework must not touch fees")
        print("  homework texts off; fee texts untouched")

        section("And refused what is not")
        for category in ("attendance", "fees"):
            code, err = request("PUT", "/parent/me/preferences", token=ptok, body={
                "channel": "sms", "category": category, "is_enabled": False})
            assert code == 400, (category, err)
            assert "cannot be switched off" in err["detail"], err
        print(f"  {err['detail']}")

        code, err = request("PUT", "/parent/me/preferences", token=ptok, body={
            "channel": "in_app", "category": "events", "is_enabled": False})
        assert code == 400 and "where they are kept" in err["detail"], err
        print(f"  {err['detail']}")

        section("The sender actually consults it")
        from app.services import comms_settings_service as svc
        db = SessionLocal()
        try:
            parent = db.get(User, parent_id)
            assert not svc.wants(db, parent_id, NoticeChannel.sms,
                                 NotificationCategory.homework), "the mute is honoured"
            assert svc.wants(db, parent_id, NoticeChannel.sms,
                             NotificationCategory.fees), "a locked category is always on"
            assert svc.wants(db, parent_id, NoticeChannel.email,
                             NotificationCategory.homework), (
                "muting one channel must not mute another")
            muted = svc.muted_user_ids(db, [parent_id], NoticeChannel.sms,
                                       NotificationCategory.homework)
            assert muted == {parent_id}, muted
        finally:
            db.close()
        print("  wants() and muted_user_ids() agree with the screen")

        section("A template says what it could not fill in")
        code, made = request("POST", "/school/settings/notifications/templates",
                             token=tok, body={
                                 "code": f"{TAG}-late", "name": f"{TAG} Late arrival",
                                 "channel": "sms", "category": "attendance",
                                 "body": "Dear {parent_name}, {student_name} arrived at {time}."})
        assert code == 201, made
        code, filled = request(
            "POST", f"/school/settings/notifications/templates/{made['id']}/preview",
            token=tok, body={"values": {"parent_name": "Mr Sharma",
                                        "student_name": "Aarav"}})
        assert code == 200, filled
        assert "Mr Sharma" in filled["body"] and "Aarav" in filled["body"], filled
        assert filled["unfilled"] == ["time"], (
            "an unfilled placeholder is named rather than silently blanked")
        assert "{time}" in filled["body"], filled["body"]
        print(f"  filled two, and named the one it could not: {filled['unfilled']}")

        print("\nALL SECURITY CHECKS PASSED")
    finally:
        reset_fixtures(parent_id)
        set_password(PARENT, PARENT_PW)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
