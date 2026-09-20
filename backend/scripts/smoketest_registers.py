"""End-to-end smoke test for locking attendance and the visitor master.

Verifies:
    A register can only be locked once something is marked and not for a future
    day; once locked the class teacher can't save, even inside the edit window;
    reopening needs a reason, is recorded, and lets the teacher save again;
    lock-day locks everything marked that day.
    Visitors: signing someone in creates (or reuses) their master record by
    phone, repeat visits are counted with a history, and a barred visitor is
    refused at the gate until the bar is lifted.

Run:
    docker exec sms-backend python -m scripts.smoketest_registers
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
from app.models.academic import Section
from app.models.attendance import StudentAttendance
from app.models.register import AttendanceSession, Visitor
from app.models.student import Student
from app.models.user import User
from app.models.visitor import Visit


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
PHONE = "9800055501"


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw.decode(errors="ignore")}


def section(t):
    print(f"\n=== {t} ===")


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        teacher = db.execute(select(User).where(User.email == TEACHER[0])).scalar_one()
        teacher.password_hash = hash_password(TEACHER[1])
        student = db.execute(
            select(Student).where(Student.school_id == admin.school_id, Student.is_active.is_(True)).limit(1)
        ).scalar_one()
        sec = db.get(Section, student.section_id)
        saved_ct = sec.class_teacher_user_id
        sec.class_teacher_user_id = teacher.id
        today = date.today()
        prior = db.execute(
            select(StudentAttendance).where(StudentAttendance.student_id == student.id, StudentAttendance.date == today)
        ).scalar_one_or_none()
        db.commit()
        return dict(section_id=sec.id, student_id=student.id, saved_ct=saved_ct,
                    prior=(prior.status, prior.remark) if prior else None)
    finally:
        db.close()


def cleanup(ctx=None):
    db = SessionLocal()
    try:
        db.execute(Visit.__table__.delete().where(Visit.phone == PHONE))
        db.execute(Visitor.__table__.delete().where(Visitor.phone == PHONE))
        if ctx:
            today = date.today()
            db.execute(AttendanceSession.__table__.delete().where(
                AttendanceSession.section_id == ctx["section_id"], AttendanceSession.date == today))
            sec = db.get(Section, ctx["section_id"])
            sec.class_teacher_user_id = ctx["saved_ct"]
            row = db.execute(
                select(StudentAttendance).where(StudentAttendance.student_id == ctx["student_id"],
                                                StudentAttendance.date == today)
            ).scalar_one_or_none()
            if ctx["prior"] is None and row:
                db.delete(row)
            elif ctx["prior"] and row:
                row.status, row.remark = ctx["prior"]
        db.commit()
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def main():
    ctx = setup()
    cleanup(None)
    sid, sec = ctx["student_id"], ctx["section_id"]
    today = date.today()
    try:
        tok = login("school", *ADMIN)
        ttok = login("teacher", *TEACHER)

        section("Locking a register")
        code, err = request("POST", "/school/attendance/registers/lock", token=tok,
                            body={"section_id": sec, "date": str(today + timedelta(days=3))})
        assert code == 400, err
        code, rows = request("GET", f"/school/attendance/registers?date={today}", token=tok)
        mine = next(r for r in rows if r["section_id"] == sec)
        assert mine["status"] == "open", mine
        if not mine["marked"]:
            code, res = request("POST", "/teacher/attendance/save", token=ttok, body={
                "section_id": sec, "date": str(today), "entries": [{"student_id": sid, "status": "present"}]})
            assert code == 200, res
        code, err = request("POST", "/school/attendance/registers/lock", token=ttok, body={"section_id": sec, "date": str(today)})
        assert code == 403, "a class teacher can't lock"
        code, locked = request("POST", "/school/attendance/registers/lock", token=tok, body={"section_id": sec, "date": str(today)})
        assert code == 200 and locked["status"] == "locked" and locked["locked_by_name"], locked
        assert locked["present"] + locked["absent"] >= 1, locked
        code, err = request("POST", "/school/attendance/registers/lock", token=tok, body={"section_id": sec, "date": str(today)})
        assert code == 400 and "already locked" in err["detail"], err
        print(f"  locked with {locked['present']} present / {locked['absent']} absent; teachers can't lock")

        section("Locked means locked")
        code, view = request("GET", f"/teacher/attendance?section_id={sec}&date={today}", token=ttok)
        assert view["is_locked"] and not view["is_editable"], view
        code, err = request("POST", "/teacher/attendance/save", token=ttok, body={
            "section_id": sec, "date": str(today), "entries": [{"student_id": sid, "status": "absent"}]})
        assert code == 400 and "locked" in err["detail"], err
        code, err = request("POST", "/school/attendance/registers/reopen", token=tok,
                            body={"section_id": sec, "date": str(today), "reason": "x"})
        assert code == 422, "a reason must be meaningful"
        code, open_ = request("POST", "/school/attendance/registers/reopen", token=tok,
                              body={"section_id": sec, "date": str(today), "reason": "Smoke wrong student marked"})
        assert open_["status"] == "open" and open_["reopen_reason"] == "Smoke wrong student marked" and open_["reopened_by_name"], open_
        code, res = request("POST", "/teacher/attendance/save", token=ttok, body={
            "section_id": sec, "date": str(today), "entries": [{"student_id": sid, "status": "present"}]})
        assert code == 200, res
        code, day = request("POST", f"/school/attendance/registers/lock-day?date={today}", token=tok)
        assert day["locked"] >= 1, day
        print("  saving refused while locked; reopened with a reason; lock-day locks the rest")

        section("Visitor master")
        code, v1 = request("POST", "/school/front-desk/visits", token=tok, body={
            "visitor_name": "Smoke Visitor", "phone": PHONE, "purpose": "meeting", "company": "Smoke Supplies",
            "id_type": "Aadhaar", "id_number": "123412341234"})
        assert code == 201, v1
        code, people = request("GET", f"/school/front-desk/visitors?search={PHONE}", token=tok)
        person = next(p for p in people if p["phone"] == PHONE)
        assert person["visits"] == 1 and person["company"] == "Smoke Supplies" and person["id_last4"] == "1234", person
        code, v2 = request("POST", "/school/front-desk/visits", token=tok, body={
            "visitor_name": "Smoke Visitor", "phone": PHONE, "purpose": "delivery"})
        assert code == 201, v2
        code, again = request("GET", f"/school/front-desk/visitors/{person['id']}", token=tok)
        assert again["visits"] == 2, again
        code, hist = request("GET", f"/school/front-desk/visitors/{person['id']}/visits", token=tok)
        assert len(hist) == 2 and {h["purpose"] for h in hist} == {"meeting", "delivery"}, hist
        code, err = request("POST", f"/school/front-desk/visitors/{person['id']}/block", token=tok, body={"blocked": True})
        assert code == 400, "blocking needs a reason"
        code, blocked = request("POST", f"/school/front-desk/visitors/{person['id']}/block", token=tok,
                                body={"blocked": True, "reason": "Smoke rude to staff"})
        assert blocked["is_blocked"] and blocked["blocked_by_name"], blocked
        code, err = request("POST", "/school/front-desk/visits", token=tok, body={
            "visitor_name": "Smoke Visitor", "phone": PHONE, "purpose": "meeting"})
        assert code == 400 and "not allowed on site" in err["detail"], err
        code, cleared = request("POST", f"/school/front-desk/visitors/{person['id']}/block", token=tok, body={"blocked": False})
        assert not cleared["is_blocked"], cleared
        code, v3 = request("POST", "/school/front-desk/visits", token=tok, body={
            "visitor_name": "Smoke Visitor", "phone": PHONE, "purpose": "meeting"})
        assert code == 201, "allowed again once the bar is lifted"
        print("  one record per phone, 3 visits with history, barred then allowed again")

        print("\nALL REGISTER / VISITOR CHECKS PASSED")
    finally:
        cleanup(ctx)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
