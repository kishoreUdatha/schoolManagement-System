"""Smoke test for event registers, notice campaigns and the staff inbox.

Verifies:
    Consent and attendance are separate facts. A child whose parent said yes
    and who did not board is counted, which is the list a teacher checks at
    the coach door — and it cannot exist if one is derived from the other.
    A child not eligible for the event cannot be marked present on it.
    A scheduled notice is reported as scheduled, never as sent, and the
    campaign view says plainly that nothing sends on a timer here.
    Skipped stays apart from failed in every delivery figure, because skipped
    means no number on file and failed means the gateway refused.
    A staff inbox shows that user's own recipient rows and nobody else's, and
    marking one read cannot be done to somebody else's post.
    An administrator sees who is talking to whom, and no message bodies.

Run:
    docker exec sms-backend python -m scripts.smoketest_event_ops
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.event_ops import EventAttendance
from app.models.events import EventConsent, PtmSession, PtmSlot, SchoolEvent
from app.models.notice import Notice, NoticeRecipient
from app.models.user import User
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-EVOPS"


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


def login(role, email, password):
    db = SessionLocal()
    try:
        u = db.execute(select(User).where(User.email == email)).scalar_one()
        u.password_hash = hash_password(password)
        db.commit()
    finally:
        db.close()
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": password})
    assert code == 200, (email, data)
    return data["access_token"]


def cleanup():
    """Everything this test made carries the tag, so nothing of the seed's
    goes with it."""
    db = SessionLocal()
    try:
        events = select(SchoolEvent.id).where(SchoolEvent.title.like(f"{TAG}%"))
        db.execute(EventAttendance.__table__.delete().where(
            EventAttendance.event_id.in_(events)))
        db.execute(EventConsent.__table__.delete().where(
            EventConsent.event_id.in_(events)))
        db.execute(SchoolEvent.__table__.delete().where(
            SchoolEvent.title.like(f"{TAG}%")))

        notices = select(Notice.id).where(Notice.title.like(f"{TAG}%"))
        db.execute(NoticeRecipient.__table__.delete().where(
            NoticeRecipient.notice_id.in_(notices)))
        db.execute(Notice.__table__.delete().where(Notice.title.like(f"{TAG}%")))

        sessions = select(PtmSession.id).where(PtmSession.title.like(f"{TAG}%"))
        db.execute(PtmSlot.__table__.delete().where(PtmSlot.session_id.in_(sessions)))
        db.execute(PtmSession.__table__.delete().where(PtmSession.title.like(f"{TAG}%")))
        db.commit()
    finally:
        db.close()


def main():
    cleanup()
    tok = login("school", *ADMIN)
    ids = devdata.school()
    klass = devdata.klass()
    child = devdata.child_id()
    other = devdata.other_child_id()

    try:
        section("A trip that collects consent")
        day = date.today() + timedelta(days=7)
        code, event = request("POST", "/school/events", token=tok, body={
            "title": f"{TAG} zoo trip", "kind": "trip",
            "start_date": day.isoformat(), "end_date": day.isoformat(),
            "audience": "class_parents", "class_id": klass.id,
            "requires_consent": True,
            "consent_deadline": (day - timedelta(days=1)).isoformat(),
        })
        assert code == 201, event
        event_id = event["id"]
        code, published = request("POST", f"/school/events/{event_id}/publish", token=tok)
        assert code == 200, published

        code, reg = request("GET", f"/school/event-ops/events/{event_id}/register", token=tok)
        assert code == 200, reg
        assert reg["eligible"] >= 2, reg
        assert all(r["attended"] is None for r in reg["rows"]), (
            "nobody has been counted yet, which is not the same as absent")
        assert reg["unmarked"] == reg["eligible"], reg
        print(f"  {reg['eligible']} children eligible, none marked either way")

        section("Consent is a promise; attendance is what happened")
        # the parent says yes for their child
        ptok = login("parent", devdata.PARENT_EMAIL, "ParentPass123!")
        code, gave = request("POST", f"/parent/me/events/{event_id}/consent", token=ptok,
                             body={"student_id": child, "response": "yes"})
        assert code == 200, gave

        code, reg = request("GET", f"/school/event-ops/events/{event_id}/register", token=tok)
        mine = next(r for r in reg["rows"] if r["student_id"] == child)
        assert mine["consented"] is True and mine["attended"] is None, mine
        assert reg["consented"] == 1 and reg["attended"] == 0, reg
        assert reg["consented_absent"] == 0, (
            "not boarding and not yet counted are different things")
        print("  consent recorded; still nobody counted at the door")

        # the child does not board
        code, marked = request("POST", f"/school/event-ops/events/{event_id}/register",
                               token=tok, body={"entries": [
                                   {"student_id": child, "attended": False,
                                    "note": "did not arrive"}]})
        assert code == 200, marked
        mine = next(r for r in marked["rows"] if r["student_id"] == child)
        assert mine["consented"] is True and mine["attended"] is False, mine
        assert marked["consented_absent"] == 1, (
            "the child whose parent said yes and who is not here is the "
            "whole reason this register exists")
        assert mine["marked_by"] and mine["marked_at"], (
            "a register with no name on it is a rumour")
        print(f"  consented but absent: {marked['consented_absent']} — "
              f"marked by {mine['marked_by']}")

        section("A child who is not on the event cannot be marked present")
        db = SessionLocal()
        try:
            outsider = db.execute(
                select(SchoolEvent).where(SchoolEvent.id == event_id)
            ).scalar_one()
        finally:
            db.close()
        code, err = request("POST", f"/school/event-ops/events/{event_id}/register",
                            token=tok, body={"entries": [
                                {"student_id": 99999999, "attended": True}]})
        assert code == 400 and "not on this event" in err["detail"], err
        print(f"  refused: {err['detail']}")

        section("A scheduled notice is not a sent one")
        when = datetime.now(timezone.utc) + timedelta(days=2)
        code, scheduled = request("POST", "/school/notices", token=tok, body={
            "title": f"{TAG} sports day", "body": "Please come along.",
            "audience": "all_parents", "channels": ["in_app"],
            "scheduled_at": when.isoformat(),
        })
        assert code == 201, scheduled
        assert scheduled["status"] == "scheduled", scheduled

        code, camp = request("GET", "/school/event-ops/campaigns", token=tok)
        assert code == 200, camp
        row = next(r for r in camp["rows"] if r["notice_id"] == scheduled["id"])
        assert row["status"] == "scheduled" and row["sent_at"] is None, row
        assert row["recipients"] == 0, (
            "a scheduled notice has reached nobody, so it has no recipients")
        assert camp["scheduler_running"] is False, (
            "nothing in this deployment sends on a timer, and the screen has "
            "to be able to say so")
        print(f"  {camp['scheduled']} scheduled, {camp['sent']} sent, "
              f"scheduler_running={camp['scheduler_running']}")

        section("Sending it is what creates recipients")
        code, sent = request("POST", "/school/notices", token=tok, body={
            "title": f"{TAG} closure", "body": "School is closed on Friday.",
            "audience": "all_parents", "channels": ["in_app"],
        })
        assert code == 201, sent
        code, delivered = request("POST", f"/school/notices/{sent['id']}/send", token=tok)
        assert code == 200, delivered

        code, camp = request("GET", "/school/event-ops/campaigns", token=tok)
        row = next(r for r in camp["rows"] if r["notice_id"] == sent["id"])
        assert row["status"] == "sent" and row["recipients"] > 0, row
        for ch in row["delivery"]:
            parts = (ch["queued"] + ch["sent"] + ch["delivered"]
                     + ch["failed"] + ch["skipped"])
            assert parts == ch["total"], ch
            assert "skipped" in ch and "failed" in ch, (
                "skipped means no number on file; failed means we tried — "
                "a screen that merges them sends somebody to debug a gateway")
        print(f"  {row['recipients']} recipients, channels {[c['channel'] for c in row['delivery']]}")

        section("History says what reached whom")
        code, hist = request("GET", "/school/event-ops/history", token=tok)
        assert code == 200, hist
        ours = [r for r in hist["rows"] if r["notice_id"] == sent["id"]]
        assert ours, "the notice we just sent is in the history"
        assert all(r["to_name"] for r in ours), ours[0]
        assert all(r["channel"] and r["status"] for r in ours), ours[0]
        print(f"  {hist['count']} message(s) in the window, "
              f"{len(hist['by_status'])} status(es)")

        section("A staff inbox is that person's own post")
        code, staff_notice = request("POST", "/school/notices", token=tok, body={
            "title": f"{TAG} staff meeting", "body": "Briefing at four.",
            "audience": "all_teachers", "channels": ["in_app"],
        })
        assert code == 201, staff_notice
        request("POST", f"/school/notices/{staff_notice['id']}/send", token=tok)

        ttok = login("teacher", devdata.TEACHER_EMAIL, "TeacherPass123!")
        code, inbox = request("GET", "/staff/inbox", token=ttok)
        assert code == 200, inbox
        mine_ids = {i["notice_id"] for i in inbox}
        assert staff_notice["id"] in mine_ids, (
            "a notice to all teachers reaches a teacher's inbox")
        assert sent["id"] not in mine_ids, (
            "a notice to parents does not appear in a teacher's inbox")
        print(f"  {len(inbox)} item(s); the parents-only notice is not among them")

        code, counted = request("GET", "/staff/inbox/unread-count", token=ttok)
        assert code == 200 and counted["unread"] >= 1, counted
        item = next(i for i in inbox if i["notice_id"] == staff_notice["id"])
        code, _ = request("POST", f"/staff/inbox/{item['recipient_id']}/mark-read", token=ttok)
        assert code == 204, _
        code, after = request("GET", "/staff/inbox/unread-count", token=ttok)
        assert after["unread"] == counted["unread"] - 1, (counted, after)
        print(f"  unread fell from {counted['unread']} to {after['unread']}")

        section("You cannot mark somebody else's post read")
        db = SessionLocal()
        try:
            someone_else = db.execute(
                select(NoticeRecipient).where(NoticeRecipient.notice_id == sent["id"])
            ).scalars().first()
        finally:
            db.close()
        code, err = request("POST", f"/staff/inbox/{someone_else.id}/mark-read", token=ttok)
        assert code == 404, (code, err)
        print("  404 — it is not theirs to read")

        section("An administrator sees who is talking, not what they said")
        code, convos = request("GET", "/school/event-ops/conversations", token=tok)
        assert code == 200, convos
        assert convos["bodies_visible"] is False, convos
        blob = json.dumps(convos)
        assert "body" not in blob, (
            "an administrator is not a participant in a parent-teacher "
            "conversation, and a screen that shows every word changes what "
            "both of them write")
        for r in convos["rows"]:
            assert set(r) >= {"parent_name", "teacher_name", "messages"}, r
        print(f"  {convos['count']} conversation(s), "
              f"{convos['awaiting_teacher']} waiting on a teacher, no bodies")

        section("A teacher arranges a meeting for their own class only")
        code, scopes = request("GET", "/teacher/ptm/my-classes", token=ttok)
        assert code == 200, scopes
        if scopes:
            sec_id = scopes[0]["section_id"]
            code, made = request(
                "POST", f"/teacher/ptm/sessions?section_id={sec_id}", token=ttok, body={
                    "title": f"{TAG} parents evening", "meeting_date": day.isoformat(),
                    "start_time": "16:00:00", "end_time": "17:00:00", "slot_minutes": 10})
            assert code == 200, made
            assert made["section_id"] == sec_id, made
            print(f"  arranged for {scopes[0]['label']}, "
                  f"{made['slot_count']} slot(s) created")

            code, err = request(
                "POST", "/teacher/ptm/sessions?section_id=99999999", token=ttok, body={
                    "title": f"{TAG} not mine", "meeting_date": day.isoformat(),
                    "start_time": "16:00:00", "end_time": "17:00:00", "slot_minutes": 10})
            assert code == 403 and "class teacher" in err["detail"], err
            print(f"  refused elsewhere: {err['detail'][:64]}…")
        else:
            print("  (this teacher is nobody's class teacher, so there is "
                  "nothing they may arrange — which is the honest answer)")

        print("\nALL EVENT-OPS CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
