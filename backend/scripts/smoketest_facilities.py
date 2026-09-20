"""End-to-end smoke test for rooms, labs and lab bookings.

Verifies:
    Rooms and labs need unique codes; a room in use by a lab can't be deleted.
    Booking rules: the period must fall on that weekday, breaks and holidays
      are refused, the past is refused, a lab can't be double-booked and a
      class can't be in two labs at once.
    Teachers book for themselves and cancel their own; the office can book for
      someone else (they're notified) and cancel anything.
    Availability shows free and taken slots per period, and cancelling frees
      the slot again.

Run:
    docker exec sms-backend python -m scripts.smoketest_facilities
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, time, timedelta

from sqlalchemy import func, select

from app.core.enums import HolidayType, UserRole
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import Section
from app.models.facility import Lab, LabBooking, Room
from app.models.holiday import Holiday
from app.models.notice import Notice, NoticeRecipient
from app.models.timetable import Period
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
PNUMS = (19, 20)


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


def setup(d: date, holiday_on: date):
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        teacher = db.execute(select(User).where(User.email == TEACHER[0])).scalar_one()
        teacher.password_hash = hash_password(TEACHER[1])
        sec = db.execute(select(Section).where(Section.school_id == admin.school_id).limit(1)).scalar_one()
        dow = d.isoweekday()
        p1 = Period(tenant_id=admin.tenant_id, school_id=admin.school_id, day_of_week=dow, period_number=PNUMS[0],
                    start_time=time(14, 0), end_time=time(14, 40))
        p2 = Period(tenant_id=admin.tenant_id, school_id=admin.school_id, day_of_week=dow, period_number=PNUMS[1],
                    start_time=time(14, 45), end_time=time(15, 25), is_break=True, label="Smoke break")
        db.add_all([p1, p2])
        db.add(Holiday(tenant_id=admin.tenant_id, school_id=admin.school_id, name="Smoke Lab Holiday",
                       type=HolidayType.school, start_date=holiday_on, end_date=holiday_on))
        db.commit()
        return dict(section_id=sec.id, period=p1.id, break_period=p2.id, teacher_id=teacher.id, dow=dow)
    finally:
        db.close()


def cleanup():
    db = SessionLocal()
    try:
        labs = select(Lab.id).where(Lab.code.like("SMK%"))
        db.execute(LabBooking.__table__.delete().where(LabBooking.lab_id.in_(labs)))
        db.execute(Lab.__table__.delete().where(Lab.code.like("SMK%")))
        db.execute(Room.__table__.delete().where(Room.code.like("SMK%")))
        db.execute(Period.__table__.delete().where(Period.period_number.in_(PNUMS)))
        db.execute(Holiday.__table__.delete().where(Holiday.name.like("Smoke Lab%")))
        db.execute(Notice.__table__.delete().where(Notice.title.like("%Lab booked%") | Notice.title.like("%Lab booking cancelled%")))
        db.commit()
    finally:
        db.close()


def notices_for(user_id, like):
    db = SessionLocal()
    try:
        return db.execute(
            select(func.count()).select_from(NoticeRecipient).join(Notice, NoticeRecipient.notice_id == Notice.id)
            .where(NoticeRecipient.user_id == user_id, Notice.title.like(like))
        ).scalar_one()
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def main():
    cleanup()
    # a date next week, and a holiday one week further on with the same weekday
    d = date.today() + timedelta(days=7)
    holiday_on = d + timedelta(days=7)
    ctx = setup(d, holiday_on)
    try:
        tok = login("school", *ADMIN)
        ttok = login("teacher", *TEACHER)

        section("Rooms and labs")
        code, room = request("POST", "/school/rooms", token=tok, body={
            "name": "Smoke Science Room", "code": "SMKR1", "kind": "lab", "capacity": 30, "building": "Block A"})
        assert code == 201, room
        code, err = request("POST", "/school/rooms", token=tok, body={"name": "Dup", "code": "SMKR1"})
        assert code == 400, err
        code, lab = request("POST", "/school/labs", token=tok, body={
            "name": "Smoke Physics Lab", "code": "SMKL1", "room_id": room["id"], "capacity": 24,
            "in_charge_user_id": ctx["teacher_id"], "equipment": "Smoke benches, 12 microscopes"})
        assert code == 201 and lab["room_name"] == "Smoke Science Room" and lab["in_charge_name"], lab
        code, lab2 = request("POST", "/school/labs", token=tok, body={"name": "Smoke Chem Lab", "code": "SMKL2"})
        assert code == 201, lab2
        code, err = request("DELETE", f"/school/rooms/{room['id']}", token=tok)
        assert code == 400 and "lab uses this room" in err["detail"], err
        code, err = request("POST", "/school/labs", token=tok, body={"name": "Dup", "code": "SMKL1"})
        assert code == 400, err
        print("  room + 2 labs created; unique codes and room-in-use enforced")

        section("Booking rules")
        base_body = {"lab_id": lab["id"], "booking_date": str(d), "period_id": ctx["period"],
                     "section_id": ctx["section_id"], "purpose": "Smoke practical"}
        code, err = request("POST", "/school/lab-bookings", token=ttok,
                            body={**base_body, "booking_date": str(d + timedelta(days=1))})
        assert code == 400 and "weekday" in err["detail"], err
        code, err = request("POST", "/school/lab-bookings", token=ttok, body={**base_body, "period_id": ctx["break_period"]})
        assert code == 400 and "break" in err["detail"], err
        code, err = request("POST", "/school/lab-bookings", token=ttok,
                            body={**base_body, "booking_date": str(date.today() - timedelta(days=7))})
        assert code == 400, err
        code, err = request("POST", "/school/lab-bookings", token=ttok, body={**base_body, "booking_date": str(holiday_on)})
        assert code == 400 and "holiday" in err["detail"], err
        code, b = request("POST", "/school/lab-bookings", token=ttok, body=base_body)
        assert code == 201 and b["teacher_name"] and b["status"] == "booked", b
        code, err = request("POST", "/school/lab-bookings", token=tok, body=base_body)
        assert code == 409 and "already booked" in err["detail"], err
        code, err = request("POST", "/school/lab-bookings", token=ttok, body={**base_body, "lab_id": lab2["id"]})
        assert code == 400 and "another lab" in err["detail"], err
        print("  weekday, break, past date, holiday, double-booking and class clash all refused")

        section("Availability")
        code, av = request("GET", f"/school/lab-availability?date={d}", token=ttok)
        row = next(p for p in av["periods"] if p["period_id"] == ctx["period"])
        taken = next(s for s in row["labs"] if s["lab_id"] == lab["id"])
        free = next(s for s in row["labs"] if s["lab_id"] == lab2["id"])
        assert not taken["free"] and taken["booked_by"] and free["free"], row
        assert not any(p["period_id"] == ctx["break_period"] for p in av["periods"]), "breaks aren't bookable"
        print(f"  {len(av['periods'])} bookable period(s); {lab['name']} shown as taken")

        section("Who can do what")
        code, err = request("POST", "/school/lab-bookings", token=ttok,
                            body={**base_body, "lab_id": lab2["id"], "section_id": None, "teacher_user_id": 1})
        assert code == 400 and "someone else" in err["detail"], err
        before = notices_for(ctx["teacher_id"], "%Lab booked%")
        code, b2 = request("POST", "/school/lab-bookings", token=tok, body={
            "lab_id": lab2["id"], "booking_date": str(d), "period_id": ctx["period"],
            "teacher_user_id": ctx["teacher_id"], "purpose": "Smoke office booked this"})
        assert code == 201 and notices_for(ctx["teacher_id"], "%Lab booked%") == before + 1, "teacher told"
        code, mine = request("GET", f"/school/lab-bookings?mine=true&from={d}&to={d}", token=ttok)
        assert len(mine) == 2, mine
        code, cancelled = request("POST", f"/school/lab-bookings/{b['id']}/cancel?reason=Smoke%20not%20needed", token=ttok)
        assert cancelled["status"] == "cancelled", cancelled
        code, av = request("GET", f"/school/lab-availability?date={d}", token=ttok)
        row = next(p for p in av["periods"] if p["period_id"] == ctx["period"])
        assert next(s for s in row["labs"] if s["lab_id"] == lab["id"])["free"], "cancelling frees the slot"
        code, again = request("POST", "/school/lab-bookings", token=ttok, body=base_body)
        assert code == 201, again
        code, err = request("DELETE", f"/school/labs/{lab['id']}", token=tok)
        assert code == 400 and "bookings" in err["detail"], err
        print("  office books for a teacher (notified), teacher cancels, slot frees, lab with bookings protected")

        print("\nALL ROOM / LAB / BOOKING CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
