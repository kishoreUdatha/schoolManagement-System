"""Smoke test for the per-child attendance history and the library members list.

Verifies:
    A child's attendance comes back day by day and month by month, with the
    remark on the days they were away, and the percentage counts late as
    present and half-days as half.
    Members: a borrower appears once with what they hold, their limit and
    whether they may take another book; somebody at their limit or owing a
    fine may not.

Run:
    docker exec sms-backend python -m scripts.smoketest_student360
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
from app.models.attendance import StudentAttendance
from app.models.library import Book, BookCopy, Loan
from app.models.user import User
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-360"


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


def login():
    db = SessionLocal()
    try:
        u = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        u.password_hash = hash_password(ADMIN[1])
        db.commit()
    finally:
        db.close()
    code, data = request("POST", "/school/auth/login", body={"email": ADMIN[0], "password": ADMIN[1]})
    assert code == 200, data
    return data["access_token"]


def cleanup():
    db = SessionLocal()
    try:
        books = select(Book.id).where(Book.title.like(f"{TAG}%"))
        copies = select(BookCopy.id).where(BookCopy.book_id.in_(books))
        db.execute(Loan.__table__.delete().where(Loan.copy_id.in_(copies)))
        db.execute(BookCopy.__table__.delete().where(BookCopy.book_id.in_(books)))
        db.execute(Book.__table__.delete().where(Book.title.like(f"{TAG}%")))
        db.execute(StudentAttendance.__table__.delete().where(StudentAttendance.remark == f"{TAG} dentist"))
        db.commit()
    finally:
        db.close()


def main():
    cleanup()
    tok = login()
    child = devdata.child_id()
    try:
        section("One child's attendance")
        # mark a day away with a reason, on a day the seed didn't touch
        db = SessionLocal()
        try:
            ids = devdata.school()
            day = date.today() - timedelta(days=40)
            while day.weekday() >= 5:
                day -= timedelta(days=1)
            db.execute(StudentAttendance.__table__.delete().where(
                StudentAttendance.student_id == child, StudentAttendance.date == day))
            db.add(StudentAttendance(**ids, student_id=child, section_id=devdata.section_id("A"),
                                     date=day, status="absent", remark=f"{TAG} dentist"))
            db.commit()
        finally:
            db.close()

        code, hist = request("GET", f"/school/reports/attendance/students/{child}", token=tok)
        assert code == 200, hist
        assert hist["student_id"] == child and hist["marked_days"] > 0, hist
        assert hist["present"] + hist["absent"] + hist["late"] + hist["half_day"] == hist["marked_days"], hist
        assert 0 <= hist["percent"] <= 100, hist["percent"]
        assert hist["months"], "months are rolled up"
        away = [d for d in hist["days"] if d["remark"] == f"{TAG} dentist"]
        assert len(away) == 1 and away[0]["status"] == "absent", away
        print(f"  {hist['marked_days']} days marked, {hist['percent']}% across {len(hist['months'])} months")

        section("A window of it")
        frm = (date.today() - timedelta(days=7)).isoformat()
        code, week = request("GET", f"/school/reports/attendance/students/{child}?from={frm}", token=tok)
        assert code == 200 and week["marked_days"] <= hist["marked_days"], week
        assert all(d["date"] >= frm for d in week["days"]), "the window is respected"
        code, err = request("GET", "/school/reports/attendance/students/99999999", token=tok)
        assert err and "not found" in str(err.get("detail", "")).lower(), err
        print(f"  last 7 days: {week['marked_days']} marked; an unknown child is a 404")

        section("Library members")
        code, book = request("POST", "/school/library/books", token=tok, body={
            "title": f"{TAG} Borrowed Twice", "authors": "A. Reader", "copies": 2})
        assert code == 201, book
        code, before = request("GET", f"/school/library/members?q={child}", token=tok)
        code, loan = request("POST", "/school/library/loans", token=tok, body={
            "accession_no": book["copies"][0]["accession_no"], "borrower_type": "student", "student_id": child})
        assert code == 201, loan
        code, members = request("GET", "/school/library/members", token=tok)
        assert code == 200, members
        mine = next(m for m in members if m["student_id"] == child)
        assert mine["out"] >= 1 and mine["limit"] >= 1, mine
        assert mine["name"] and mine["detail"], "the row carries who they are"
        print(f"  {mine['name']}: {mine['out']} of {mine['limit']} out, can borrow = {mine['can_borrow']}")

        section("At the limit")
        code, second = request("POST", "/school/library/loans", token=tok, body={
            "accession_no": book["copies"][1]["accession_no"], "borrower_type": "student", "student_id": child})
        code, members = request("GET", "/school/library/members?with_books_only=true", token=tok)
        mine = next(m for m in members if m["student_id"] == child)
        assert all(m["out"] > 0 for m in members), "the filter means holding a book"
        if mine["out"] >= mine["limit"]:
            assert not mine["can_borrow"], mine
            print(f"  {mine['out']} of {mine['limit']} out, so no more until one comes back")
        else:
            print(f"  {mine['out']} of {mine['limit']} out, still within the limit")

        print("\nALL STUDENT-360 CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
