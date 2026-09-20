"""Smoke test for platform administration: operator accounts, the support
queue, global announcements, settings and health.

Verifies:
    The last active platform administrator cannot be switched off. Locking
    every operator out leaves no way back except hand-written SQL against a
    live database, so the refusal lives in the service rather than in whoever
    happens to be clicking.
    A new operator account hands back its password once, and is flagged to
    choose their own on first sign-in.
    An internal note on a ticket is kept apart from the reply the school would
    see, by the service rather than by a component — a note hidden only in the
    frontend is one API call away from being read.
    An announcement is live only inside its own window, so a maintenance
    notice stops on its own rather than waiting to be withdrawn by hand.
    A setting round-trips, whatever shape its value is.
    Health reports what it actually checked, and says plainly which services
    nothing is monitoring.

Run:
    docker exec sms-backend python -m scripts.smoketest_platform
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.platform import (
    GlobalAnnouncement,
    PlatformSetting,
    SupportTicket,
    TicketReply,
)
from app.models.user import User

BASE = "http://localhost:8000/api/v1"
WHO = "admin@sms.local"
PASSWORD = "ChangeMe123!"
TAG = "SMOKE-PLATFORM"


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


def login():
    db = SessionLocal()
    try:
        u = db.execute(select(User).where(User.email == WHO)).scalar_one()
        u.password_hash = hash_password(PASSWORD)
        u.is_active = True
        db.commit()
    finally:
        db.close()
    code, data = request("POST", "/super-admin/auth/login",
                         body={"email": WHO, "password": PASSWORD})
    assert code == 200, data
    return data["access_token"]


def cleanup():
    """Take away only what this test made. The seeded super admin stays."""
    db = SessionLocal()
    try:
        tickets = select(SupportTicket.id).where(SupportTicket.subject.like(f"{TAG}%"))
        db.execute(TicketReply.__table__.delete().where(TicketReply.ticket_id.in_(tickets)))
        db.execute(SupportTicket.__table__.delete().where(
            SupportTicket.subject.like(f"{TAG}%")))
        db.execute(GlobalAnnouncement.__table__.delete().where(
            GlobalAnnouncement.title.like(f"{TAG}%")))
        db.execute(PlatformSetting.__table__.delete().where(
            PlatformSetting.key.like("smoke_%")))
        db.execute(User.__table__.delete().where(User.email.like("%.smoke-platform@dev.local")))
        db.commit()
    finally:
        db.close()


def main():
    cleanup()
    tok = login()
    try:
        section("The last operator cannot be switched off")
        code, users = request("GET", "/super-admin/platform-users", token=tok)
        assert code == 200, users
        active = [u for u in users if u["is_active"]]
        assert active, "somebody has to be able to sign in"
        if len(active) == 1:
            only = active[0]
            assert only["is_last_active"], only
            code, err = request("PATCH", f"/super-admin/platform-users/{only['id']}",
                                token=tok, body={"is_active": False})
            assert code == 400, (code, err)
            assert "last active" in err["detail"], err
            print(f"  refused: {err['detail'][:70]}…")
        else:
            print(f"  {len(active)} operators active; the guard is exercised below")

        section("A second operator, and the password shown once")
        code, made = request("POST", "/super-admin/platform-users", token=tok, body={
            "full_name": "Smoke Operator",
            "email": "second.smoke-platform@dev.local"})
        assert code == 201, made
        assert made["password"] and len(made["password"]) >= 8, made
        second_id = made["id"]

        code, users2 = request("GET", "/super-admin/platform-users", token=tok)
        mine = next(u for u in users2 if u["id"] == second_id)
        assert mine["must_change_password"] is True, (
            "a password somebody else typed has to be replaced")
        # Checking for the substring would trip on must_change_password, which
        # is a flag rather than a secret. The question is whether any row
        # carries a field actually holding one.
        assert all("password" not in k for u in users2 for k in u
                   if k != "must_change_password"), (
            "the listing says who exists, not what their password is")
        assert not mine["is_last_active"], "there are two now"
        print(f"  created; the listing carries no password back")

        section("With two, one can go — and then the other cannot")
        code, off = request("PATCH", f"/super-admin/platform-users/{second_id}",
                            token=tok, body={"is_active": False})
        assert code == 200 and off["is_active"] is False, off
        code, users3 = request("GET", "/super-admin/platform-users", token=tok)
        remaining = [u for u in users3 if u["is_active"]]
        assert len(remaining) == 1, remaining
        code, err = request("PATCH", f"/super-admin/platform-users/{remaining[0]['id']}",
                            token=tok, body={"is_active": False})
        assert code == 400, "the one left is protected"
        print("  switched one off, and the one left is now refused")

        section("A reset hands back a new password, once")
        code, reset = request(
            "POST", f"/super-admin/platform-users/{second_id}/reset-password", token=tok)
        assert code == 200 and reset["password"], reset
        assert reset["password"] != made["password"], "a reset is a new password"
        print("  new password issued, different from the first")

        section("An internal note is not a reply")
        code, ticket = request("POST", "/super-admin/tickets", token=tok, body={
            "subject": f"{TAG} cannot print report cards",
            "body": "Nothing happens when the button is pressed.",
            "priority": "high"})
        assert code == 201, ticket
        tid = ticket["id"]
        assert ticket["status"] == "open", ticket

        code, _ = request(f"POST", f"/super-admin/tickets/{tid}/replies", token=tok, body={
            "body": "Looking into it now.", "is_internal": False})
        code, _ = request("POST", f"/super-admin/tickets/{tid}/replies", token=tok, body={
            "body": "Their plan lapsed in March; chase billing first.",
            "is_internal": True})

        code, full = request("GET", f"/super-admin/tickets/{tid}", token=tok)
        assert code == 200, full
        assert len(full["replies"]) == 2, full["replies"]
        assert any(r["is_internal"] for r in full["replies"]), "an operator sees both"

        # The service, not the route, is what keeps them apart.
        from app.services import platform_service
        db = SessionLocal()
        try:
            outside = platform_service.get_ticket(db, tid, internal=False)
        finally:
            db.close()
        assert len(outside["replies"]) == 1, outside["replies"]
        assert not any(r["is_internal"] for r in outside["replies"]), outside["replies"]
        # str() rather than json.dumps(): this is the service's own dict, which
        # carries datetimes, and the point is whether the text survives
        # anywhere in it — not whether it serialises.
        assert "chase billing" not in str(outside), (
            "the note must not survive anywhere in a non-internal read")
        print("  operator sees two replies; a non-internal read sees one")

        section("A visible reply moves the ticket; a note does not")
        assert full["status"] == "waiting", (
            "answering the school puts the ball in their court")
        code, note_only = request("POST", "/super-admin/tickets", token=tok, body={
            "subject": f"{TAG} internal only", "body": "Checking something."})
        nid = note_only["id"]
        code, after = request("POST", f"/super-admin/tickets/{nid}/replies", token=tok,
                              body={"body": "Note to self.", "is_internal": True})
        assert after["status"] == "open", (
            "a note to ourselves is not an answer to anybody")
        print("  a reply set it waiting; an internal note left it open")

        section("An announcement is live only inside its window")
        today = date.today()
        code, past = request("POST", "/super-admin/announcements", token=tok, body={
            "title": f"{TAG} finished", "body": "Last month's maintenance.",
            "starts_on": str(today - timedelta(days=30)),
            "ends_on": str(today - timedelta(days=20))})
        assert code == 201, past
        assert past["live"] is False and past["finished"] is True, past

        code, future = request("POST", "/super-admin/announcements", token=tok, body={
            "title": f"{TAG} upcoming", "body": "Maintenance next week.",
            "starts_on": str(today + timedelta(days=7))})
        assert future["live"] is False and future["scheduled"] is True, future

        code, now_live = request("POST", "/super-admin/announcements", token=tok, body={
            "title": f"{TAG} running", "body": "We are aware of the issue.",
            "starts_on": str(today - timedelta(days=1)),
            "ends_on": str(today + timedelta(days=1))})
        assert now_live["live"] is True, now_live

        code, only_live = request("GET", "/super-admin/announcements?live_only=true", token=tok)
        titles = [a["title"] for a in only_live["announcements"]]
        assert f"{TAG} running" in titles, titles
        assert f"{TAG} finished" not in titles and f"{TAG} upcoming" not in titles, titles
        print(f"  three made, one live — the finished and the scheduled stay out")

        code, err = request("POST", "/super-admin/announcements", token=tok, body={
            # A real body, so the dates are what gets refused rather than
            # the length check firing first.
            "title": f"{TAG} backwards", "body": "ends before it starts",
            "starts_on": str(today), "ends_on": str(today - timedelta(days=1))})
        assert code == 400 and "before it starts" in err["detail"], err
        print(f"  and: {err['detail']}")

        section("Settings round-trip whatever shape they are")
        code, saved = request("PUT", "/super-admin/settings", token=tok, body={
            "key": "smoke_support_email", "value": "help@example.test"})
        assert code == 200, saved
        assert saved["value"] == {"value": "help@example.test"}, saved

        code, flag = request("PUT", "/super-admin/settings", token=tok, body={
            "key": "smoke_maintenance", "value": {"on": True, "until": "2026-10-01"}})
        assert flag["value"]["on"] is True, flag

        code, listed = request("GET", "/super-admin/settings", token=tok)
        keys = {s["key"] for s in listed}
        assert "smoke_support_email" in keys and "smoke_maintenance" in keys, keys
        # The known knobs appear even before anybody sets them.
        assert any(s["key"] == "support_email" and not s["set"] for s in listed), (
            "an unset setting is still offered, so nobody has to guess a spelling")
        print(f"  a string and an object both stored; unset knobs still listed")

        code, _ = request("DELETE", "/super-admin/settings/smoke_maintenance", token=tok)
        code, after_del = request("GET", "/super-admin/settings", token=tok)
        assert not any(s["key"] == "smoke_maintenance" for s in after_del), after_del
        print("  and one removed again")

        section("Health says what it checked")
        code, h = request("GET", "/super-admin/health", token=tok)
        assert code == 200, h
        names = {c["name"]: c for c in h["checks"]}
        assert names["Application"]["state"] == "up", names["Application"]
        assert names["Database"]["state"] == "up", names["Database"]
        assert names["Application"]["monitored"] and names["Database"]["monitored"]
        unmonitored = [c for c in h["checks"] if not c["monitored"]]
        assert unmonitored, "the services nobody probes are still listed"
        assert all(c["state"] in ("configured", "not_configured") for c in unmonitored), (
            "an unmonitored service must never be reported up")
        assert h["all_monitored_up"] is True, h
        print(f"  {len(h['checks']) - len(unmonitored)} checked and up, "
              f"{len(unmonitored)} listed as not monitored")

        section("None of it is reachable without being a platform admin")
        code, err = request("GET", "/super-admin/platform-users")
        assert code in (401, 403), (code, err)
        print("  an anonymous caller is refused")

        print("\nALL PLATFORM CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
