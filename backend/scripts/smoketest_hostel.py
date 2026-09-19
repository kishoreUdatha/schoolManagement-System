"""End-to-end smoke test for the hostel.

Verifies:
    Admin sets up a hostel (teacher as warden) with rooms and auto-labelled beds.
    Allocation; room change closes the old bed; occupied bed can't be removed.
    Warden sees only their hostel and can't create hostels.
    Night roll call: absent → parent notice.
    Parent asks for home leave → warden approves → out → returned (notices);
      overlapping request blocked.
    Weekly menu; parent sees today's menu and their child's room.
    Parent complaint → warden resolves (resolution required) → parent notified.
    Monthly hostel fee generation (idempotent, one per student).

Run:
    docker exec sms-backend python -m scripts.smoketest_hostel
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.fee import FeeHead, StudentFee
from app.models.hostel import Hostel, HostelAllocation, HostelAttendance, HostelOuting
from app.models.notice import Notice
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
PARENT_PW = "ParentPass123!"
NAME = "Smoke Hostel"
HEAD_CODE = "SMKHOST"
STARTED: list = []  # notices created after this time are the test's own


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
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


def cleanup():
    db = SessionLocal()
    try:
        hostel_ids = list(db.execute(select(Hostel.id).where(Hostel.name.like(f"{NAME}%"))).scalars())
        db.execute(StudentFee.__table__.delete().where(StudentFee.fee_head_id.in_(select(FeeHead.id).where(FeeHead.code == HEAD_CODE))))
        db.execute(FeeHead.__table__.delete().where(FeeHead.code == HEAD_CODE))
        db.execute(HostelOuting.__table__.delete().where(HostelOuting.reason.like("Smoke%")))
        if STARTED:
            db.execute(Notice.__table__.delete().where(Notice.created_at >= STARTED[0], Notice.audience_student_id.is_not(None)))
        if hostel_ids:
            from app.models.hostel import HostelBed, HostelRoom

            bed_ids = select(HostelBed.id).join(HostelRoom).where(HostelRoom.hostel_id.in_(hostel_ids))
            db.execute(HostelAllocation.__table__.delete().where(HostelAllocation.bed_id.in_(bed_ids)))
            db.execute(HostelAttendance.__table__.delete().where(HostelAttendance.hostel_id.in_(hostel_ids)))
            db.execute(Hostel.__table__.delete().where(Hostel.id.in_(hostel_ids)))
        db.commit()
    finally:
        db.close()


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        teacher = db.execute(select(User).where(User.email == TEACHER[0])).scalar_one()
        teacher.password_hash = hash_password(TEACHER[1])
        student, parent = db.execute(
            select(Student, User)
            .join(ParentStudent, ParentStudent.student_id == Student.id)
            .join(User, ParentStudent.parent_user_id == User.id)
            .where(Student.school_id == admin.school_id, Student.is_active.is_(True))
            .limit(1)
        ).first()
        parent.password_hash = hash_password(PARENT_PW)
        head = FeeHead(tenant_id=admin.tenant_id, school_id=admin.school_id, name="Smoke hostel", code=HEAD_CODE)
        db.add(head)
        db.commit()
        return student.id, parent.email, teacher.id, head.id
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, (role, data)
    return data["access_token"]


def titles(token):
    code, data = request("GET", "/parent/me/notices", token=token)
    items = data if isinstance(data, list) else data.get("items", [])
    return [n.get("title") or "" for n in items]


def main():
    cleanup()
    STARTED.append(datetime.now(timezone.utc))
    sid, parent_email, teacher_id, head_id = setup()
    try:
        tok = login("school", *ADMIN)
        wtok = login("teacher", *TEACHER)
        ptok = login("parent", parent_email, PARENT_PW)
        today = datetime.now(ZoneInfo("Asia/Kolkata")).date()

        section("Setup")
        code, h = request("POST", "/school/hostels", token=tok, body={
            "name": NAME, "kind": "mixed", "warden_user_id": teacher_id, "monthly_fee": "6000", "curfew": "19:30"})
        assert code == 201 and h["warden_name"], h
        code, other = request("POST", "/school/hostels", token=tok, body={"name": f"{NAME} Annex", "kind": "girls"})
        code, rooms = request("POST", f"/school/hostels/{h['id']}/rooms", token=tok, body={"room_no": "g-01", "beds": 2})
        assert code == 201 and [b["label"] for b in rooms[0]["beds"]] == ["A", "B"] and rooms[0]["room_no"] == "G-01", rooms
        code, rooms = request("POST", f"/school/hostels/{h['id']}/rooms", token=tok, body={"room_no": "G-02", "beds": 1, "monthly_fee": "7500"})
        r1 = next(r for r in rooms if r["room_no"] == "G-01")
        r2 = next(r for r in rooms if r["room_no"] == "G-02")
        code, err = request("POST", "/school/hostels", token=wtok, body={"name": f"{NAME} X", "kind": "boys"})
        assert code == 403, err

        section("Allocation")
        code, a = request("POST", "/school/hostels/allocations", token=tok, body={
            "student_id": sid, "bed_id": r1["beds"][0]["id"], "start_date": (today - timedelta(days=20)).isoformat()})
        assert code == 201, a
        code, err = request("PATCH", f"/school/hostels/rooms/{r1['id']}", token=tok, body={"beds": 0})
        assert code == 422, err
        code, rr = request("PATCH", f"/school/hostels/rooms/{r1['id']}", token=tok, body={"beds": 1})
        assert code == 200, rr  # bed B was empty → removed
        code, a2 = request("POST", "/school/hostels/allocations", token=tok, body={
            "student_id": sid, "bed_id": r2["beds"][0]["id"], "start_date": (today - timedelta(days=2)).isoformat()})
        assert code == 201, a2
        code, res = request("GET", f"/school/hostels/{h['id']}/residents", token=wtok)
        assert [x["room_no"] for x in res] == ["G-02"], res
        code, mine = request("GET", "/school/hostels", token=wtok)
        assert [x["id"] for x in mine] == [h["id"]], "warden sees only their hostel"
        code, err = request("GET", f"/school/hostels/{other['id']}/residents", token=wtok)
        assert code == 403, err
        print("  moved G-01A → G-02A; warden scoped")

        section("Roll call")
        code, rc = request("POST", f"/school/hostels/{h['id']}/roll-call", token=wtok, body={
            "date": today.isoformat(), "session": "night", "marks": [{"student_id": sid, "status": "absent"}]})
        assert code == 200 and rc["marked"] == 1, rc
        assert any("absent" in t for t in titles(ptok)), "parent told about absence"

        section("Home leave")
        leave = datetime.now(timezone.utc) + timedelta(days=1)
        body = {"kind": "home_leave", "leave_at": leave.isoformat(), "return_by": (leave + timedelta(days=2)).isoformat(),
                "reason": "Smoke family function", "escort_name": "Father"}
        code, o = request("POST", f"/parent/me/children/{sid}/hostel/outings", token=ptok, body=body)
        assert code == 201 and o["status"] == "requested", o
        code, dup = request("POST", f"/parent/me/children/{sid}/hostel/outings", token=ptok, body=body)
        assert code == 409, dup
        code, o = request("POST", f"/school/hostels/outings/{o['id']}/decide", token=wtok, body={"approve": True})
        assert code == 200 and o["status"] == "approved", o
        code, o = request("POST", f"/school/hostels/outings/{o['id']}/out", token=wtok)
        code, o = request("POST", f"/school/hostels/outings/{o['id']}/returned", token=wtok)
        assert code == 200 and o["status"] == "returned", o
        assert any("back in the hostel" in t for t in titles(ptok))

        section("Menu + parent view")
        slots = [{"day_of_week": d, "meal": m, "items": f"Smoke {m} {d}"} for d in range(7) for m in ("breakfast", "dinner")]
        code, menu = request("PUT", f"/school/hostels/{h['id']}/menu", token=wtok, body={"slots": slots})
        assert code == 200 and len(menu) == 14, menu
        code, child = request("GET", f"/parent/me/children/{sid}/hostel", token=ptok)
        assert child["room_no"] == "G-02" and child["menu_today"]["breakfast"] == f"Smoke breakfast {today.weekday()}", child
        assert any(x["status"] == "absent" for x in child["attendance_last_7_days"])

        section("Complaint")
        code, c = request("POST", f"/parent/me/children/{sid}/hostel/complaints", token=ptok,
                          body={"category": "maintenance", "description": "Smoke: fan not working"})
        assert code == 201, c
        code, err = request("PATCH", f"/school/hostels/complaints/{c['id']}", token=wtok, body={"status": "resolved"})
        assert code == 400, err
        code, c = request("PATCH", f"/school/hostels/complaints/{c['id']}", token=wtok, body={"status": "resolved", "resolution": "Fan replaced"})
        assert code == 200 and c["resolved_at"], c
        assert any("resolved" in t for t in titles(ptok))

        section("Fees")
        period = today.strftime("%Y-%m")
        code, f = request("POST", "/school/hostels/fees/generate", token=tok, body={"fee_head_id": head_id, "period": period})
        assert code == 200 and f["created"] == 1 and Decimal(f["total_amount"]) == Decimal("7500"), f
        code, f2 = request("POST", "/school/hostels/fees/generate", token=tok, body={"fee_head_id": head_id, "period": period})
        assert f2["created"] == 0, f2
        code, err = request("POST", "/school/hostels/fees/generate", token=wtok, body={"fee_head_id": head_id, "period": period})
        assert code == 403, err
        print("  one fee at the G-02 rate; rerun idempotent; wardens can't bill")

        print("\nALL HOSTEL CHECKS PASSED")
    except AssertionError as e:
        print(f"\nFAILED: {e}")
        sys.exit(1)
    finally:
        cleanup()


if __name__ == "__main__":
    main()
