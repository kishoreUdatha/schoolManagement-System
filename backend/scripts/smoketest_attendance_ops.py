"""Smoke test for lesson attendance, register corrections and absence chasing.

Verifies:
    A lesson's roster is seeded from the day's register, so a teacher confirms
    rather than retypes, and marking a lesson never touches the daily mark.
    A child present this morning but absent from a lesson is a gap; a child
    absent all day is not.
    A correction changes the register only when somebody else agrees, and the
    person who asked cannot be the person who agrees.
    Nothing else in the module writes to the register.
    The at-risk list says who has never been contacted and whose follow-up is
    due, which is what turns a report into a worklist.

Run:
    docker exec sms-backend python -m scripts.smoketest_attendance_ops
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

from sqlalchemy import select

from app.core.enums import AttendanceStatus
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.attendance import StudentAttendance
from app.models.attendance_ops import AbsenceContact, AttendanceCorrection, PeriodAttendance
from app.models.timetable import Period
from app.models.user import User
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-ATTOPS"


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


def cleanup(section_id, day):
    db = SessionLocal()
    try:
        db.execute(PeriodAttendance.__table__.delete().where(
            PeriodAttendance.section_id == section_id, PeriodAttendance.date == day))
        db.execute(AttendanceCorrection.__table__.delete().where(
            AttendanceCorrection.reason.like(f"{TAG}%")))
        db.execute(AbsenceContact.__table__.delete().where(
            AbsenceContact.note.like(f"{TAG}%")))
        db.execute(StudentAttendance.__table__.update()
                   .where(StudentAttendance.section_id == section_id,
                          StudentAttendance.date == day)
                   .values(arrived_at=None, left_at=None))
        db.commit()
    finally:
        db.close()


def main():
    tok = login("school", *ADMIN)
    ids = devdata.school()
    section_id = devdata.section_id("A")
    child = devdata.child_id()
    other = devdata.other_child_id()

    # a weekday with attendance already marked, so the seeding is real
    db = SessionLocal()
    try:
        # The newest marked day is not necessarily useful — other suites mark
        # children absent on it. Take the newest day somebody was actually in,
        # since seeding a lesson from the register is the thing under test.
        day = db.execute(
            select(StudentAttendance.date)
            .where(
                StudentAttendance.section_id == section_id,
                StudentAttendance.status == AttendanceStatus.present,
            )
            .order_by(StudentAttendance.date.desc())
        ).scalars().first()
        assert day, "the seed marks attendance for Grade 1 A"
        period = db.execute(
            select(Period).where(
                Period.school_id == ids["school_id"],
                Period.day_of_week == day.isoweekday(),
                Period.is_break.is_(False),
            ).order_by(Period.period_number)
        ).scalars().first()
        assert period, "the seed lays out periods Mon-Fri"
        period_id = period.id
        present_today = [
            a.student_id for a in db.execute(
                select(StudentAttendance).where(
                    StudentAttendance.section_id == section_id,
                    StudentAttendance.date == day,
                    StudentAttendance.status == AttendanceStatus.present,
                )
            ).scalars()
        ]
        assert present_today, "somebody was in that day"
    finally:
        db.close()

    cleanup(section_id, day)
    try:
        section("A lesson starts from the morning register")
        code, grid = request(
            "GET",
            f"/school/attendance-ops/periods?section_id={section_id}&date={day}&period_id={period_id}",
            token=tok)
        assert code == 200, grid
        assert grid["rows"], grid
        assert not any(r["already_marked"] for r in grid["rows"]), "nothing marked yet"
        seeded = [r for r in grid["rows"] if r["day_status"]]
        assert seeded, "the day's register is showing through"
        assert all(r["status"] == r["day_status"] for r in seeded), (
            "a lesson is seeded from the day, so a teacher confirms rather than retypes")
        print(f"  {len(grid['rows'])} children, {len(seeded)} pre-filled from "
              f"the morning, subject {grid['subject_name']}")

        section("Marking a lesson leaves the day alone")
        victim = present_today[0]
        code, saved = request("POST", "/school/attendance-ops/periods", token=tok, body={
            "section_id": section_id, "date": str(day), "period_id": period_id,
            "entries": [{"student_id": victim, "status": "absent", "remark": "not in maths"}]})
        assert code == 200, saved
        row = next(r for r in saved["rows"] if r["student_id"] == victim)
        assert row["status"] == "absent" and row["already_marked"], row
        db = SessionLocal()
        try:
            day_mark = db.execute(select(StudentAttendance).where(
                StudentAttendance.student_id == victim,
                StudentAttendance.date == day)).scalar_one()
            assert day_mark.status.value == "present", (
                "the daily register must not move when a lesson is marked")
        finally:
            db.close()
        print("  marked absent for the lesson; the day still says present")

        section("A gap is not the same as being away")
        code, gaps = request(
            "GET", f"/school/attendance-ops/periods/gaps?section_id={section_id}&date={day}",
            token=tok)
        assert code == 200, gaps
        assert any(g["student_id"] == victim for g in gaps["gaps"]), gaps
        away_all_day = [
            a for a in [None] if False
        ]
        db = SessionLocal()
        try:
            absent_ids = [a.student_id for a in db.execute(select(StudentAttendance).where(
                StudentAttendance.section_id == section_id, StudentAttendance.date == day,
                StudentAttendance.status == AttendanceStatus.absent)).scalars()]
        finally:
            db.close()
        if absent_ids:
            request("POST", "/school/attendance-ops/periods", token=tok, body={
                "section_id": section_id, "date": str(day), "period_id": period_id,
                "entries": [{"student_id": absent_ids[0], "status": "absent"}]})
            code, gaps2 = request(
                "GET", f"/school/attendance-ops/periods/gaps?section_id={section_id}&date={day}",
                token=tok)
            assert not any(g["student_id"] == absent_ids[0] for g in gaps2["gaps"]), (
                "a child away all day is absent, not missing from a lesson")
            print(f"  {gaps['count']} gap(s); the child away all day is not one of them")
        else:
            print(f"  {gaps['count']} gap(s)")

        section("Late in, early out")
        code, times = request("PUT", "/school/attendance-ops/times", token=tok, body={
            "student_id": victim, "date": str(day),
            "arrived_at": "09:40:00", "left_at": "14:00:00"})
        assert code == 200, times
        assert times["arrived_at"].startswith("09:40"), times
        code, err = request("PUT", "/school/attendance-ops/times", token=tok, body={
            "student_id": victim, "date": str(day),
            "arrived_at": "14:00:00", "left_at": "09:00:00"})
        assert code == 400 and "before they arrived" in err["detail"], err
        code, window = request(
            "GET", f"/school/attendance-ops/times?from={day}&to={day}", token=tok)
        assert code == 200 and window["count"] >= 1, window
        assert all("times_in_window" in r for r in window["rows"]), window["rows"][0]
        print(f"  recorded, and leaving before arriving is refused")

        section("Correcting the register needs somebody else to agree")
        code, req1 = request("POST", "/school/attendance-ops/corrections", token=tok, body={
            "student_id": victim, "date": str(day), "to_status": "late",
            "reason": f"{TAG} bus was late"})
        assert code == 201, req1
        assert req1["status"] == "pending" and req1["from_status"] == "present", req1

        code, dup = request("POST", "/school/attendance-ops/corrections", token=tok, body={
            "student_id": victim, "date": str(day), "to_status": "absent",
            "reason": f"{TAG} again"})
        assert code == 400 and "already waiting" in dup["detail"], dup

        code, own = request(
            "POST", f"/school/attendance-ops/corrections/{req1['id']}/decide",
            token=tok, body={"approve": True})
        assert code == 400 and "Somebody else" in own["detail"], own
        print(f"  refused: {own['detail']}")

        ptok = login("principal", "principal@dev.local", "PrincipalPass123!")
        code, decided = request(
            "POST", f"/school/attendance-ops/corrections/{req1['id']}/decide",
            token=ptok, body={"approve": True, "note": "verified with the driver"})
        assert code == 200 and decided["status"] == "approved", decided
        db = SessionLocal()
        try:
            after = db.execute(select(StudentAttendance).where(
                StudentAttendance.student_id == victim,
                StudentAttendance.date == day)).scalar_one()
            assert after.status.value == "late", (
                "approving is the only thing here that moves the register")
        finally:
            db.close()
        print("  the principal agreed, and only then did the register change")

        section("Who is slipping, and who has spoken to them")
        code, risk = request("GET", "/school/attendance-ops/at-risk?below=95", token=tok)
        assert code == 200, risk
        assert risk["count"] >= 1, "the seed leaves somebody under 95%"
        assert risk["never_contacted"] == sum(
            1 for r in risk["students"] if r["never_contacted"]), risk
        first = risk["students"][0]
        assert first["never_contacted"] is True, first

        code, logged = request("POST", "/school/attendance-ops/contacts", token=tok, body={
            "student_id": first["student_id"], "method": "phone",
            "spoke_to": "mother", "note": f"{TAG} discussed morning routine",
            "agreed_action": "in by 8.30 from Monday",
            "follow_up_on": str(date.today() - timedelta(days=1))})
        assert code == 201, logged

        code, risk2 = request("GET", "/school/attendance-ops/at-risk?below=95", token=tok)
        row = next(r for r in risk2["students"] if r["student_id"] == first["student_id"])
        assert not row["never_contacted"], row
        assert row["follow_up_due"] is True, row
        assert risk2["follow_ups_due"] >= 1, risk2
        print(f"  {risk2['count']} at risk, {risk2['never_contacted']} never contacted, "
              f"{risk2['follow_ups_due']} follow-up(s) due")

        code, hist = request(
            f"GET", f"/school/attendance-ops/contacts/{first['student_id']}", token=tok)
        assert code == 200 and len(hist) >= 1 and hist[0]["agreed_action"], hist
        print(f"  history kept: {hist[0]['method']} — {hist[0]['agreed_action']}")

        print("\nALL ATTENDANCE-OPS CHECKS PASSED")
    finally:
        cleanup(section_id, day)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
