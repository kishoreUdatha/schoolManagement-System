"""End-to-end smoke test for the library.

Verifies:
    Catalogue with auto-numbered copies; search by title / accession no.
    Issue by accession no.; borrowing limit; reference books stay in.
    Reservation queue; renewal blocked while someone waits; returned copy goes
      on hold for the first reserver and only they can borrow it.
    Late return fine (per day), auto-billed into the student's fees.
    Lost copy charged at its price; staff fine collected at the counter.
    Parent and staff self-service views; dashboard counters.

Run:
    docker exec sms-backend python -m scripts.smoketest_library
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.fee import FeeHead, StudentFee
from app.models.library import Book, BookCopy, LibrarySettings, Loan, Reservation
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
PARENT_PW = "ParentPass123!"
MARK = "Smoke Lib"
HEAD_CODE = "SMKLIB"
SETTING_FIELDS = ("loan_days_student", "loan_days_staff", "max_books_student", "max_books_staff",
                  "max_renewals", "fine_per_day", "max_fine_per_loan", "hold_days", "fine_fee_head_id")


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
        book_ids = select(Book.id).where(Book.title.like(f"{MARK}%"))
        copy_ids = select(BookCopy.id).where(BookCopy.book_id.in_(book_ids))
        loan_ids = [i for (i,) in db.execute(select(Loan.id).where(Loan.copy_id.in_(copy_ids))).all()]
        if loan_ids:
            db.execute(StudentFee.__table__.delete().where(StudentFee.source == "library", StudentFee.source_id.in_(loan_ids)))
            db.execute(Loan.__table__.delete().where(Loan.id.in_(loan_ids)))
        db.execute(Reservation.__table__.delete().where(Reservation.book_id.in_(book_ids)))
        db.execute(Book.__table__.delete().where(Book.title.like(f"{MARK}%")))
        db.execute(LibrarySettings.__table__.update().where(
            LibrarySettings.fine_fee_head_id.in_(select(FeeHead.id).where(FeeHead.code == HEAD_CODE))
        ).values(fine_fee_head_id=None))
        db.execute(FeeHead.__table__.delete().where(FeeHead.code == HEAD_CODE))
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
        head = FeeHead(tenant_id=admin.tenant_id, school_id=admin.school_id, name="Smoke library fine", code=HEAD_CODE)
        db.add(head)
        db.commit()
        return student.id, parent.email, teacher.id, head.id
    finally:
        db.close()


def backdate_due(loan_id, days_ago):
    db = SessionLocal()
    try:
        l = db.get(Loan, loan_id)
        l.issued_on = date.today() - timedelta(days=days_ago + 10)
        l.due_on = date.today() - timedelta(days=days_ago)
        db.commit()
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def main():
    section("RESET")
    cleanup()
    sid, parent_email, teacher_id, head_id = setup()
    tok = login("school", *ADMIN)
    ttok = login("teacher", *TEACHER)
    ptok = login("parent", parent_email, PARENT_PW)
    code, original = request("GET", "/school/library/settings", token=tok)
    try:
        run(tok, ttok, ptok, sid, teacher_id, head_id)
    finally:
        request("PATCH", "/school/library/settings", token=tok, body={k: original[k] for k in SETTING_FIELDS if k != "fine_fee_head_id"} | {"fine_fee_head_id": original["fine_fee_head_id"]})
        cleanup()


def run(tok, ttok, ptok, sid, teacher_id, head_id):
    student = {"borrower_type": "student", "student_id": sid}
    staff = {"borrower_type": "staff", "user_id": teacher_id}

    section("Settings + catalogue")
    code, cfg = request("PATCH", "/school/library/settings", token=tok,
                        body={"max_books_student": 1, "fine_per_day": "5", "max_renewals": 1, "fine_fee_head_id": head_id, "max_fine_per_loan": None})
    assert code == 200 and cfg["fine_fee_head_id"] == head_id, cfg
    code, novel = request("POST", "/school/library/books", token=tok,
                          body={"title": f"{MARK} Wings of Fire", "authors": "A. P. J. Abdul Kalam", "category": "Biography", "copies": 1, "price": "400"})
    assert code == 201 and novel["total_copies"] == 1 and novel["available_copies"] == 1, novel
    acc = novel["copies"][0]["accession_no"]
    code, ref = request("POST", "/school/library/books", token=tok,
                        body={"title": f"{MARK} Oxford Atlas", "is_reference": True, "copies": 1})
    code, second = request("POST", "/school/library/books", token=tok, body={"title": f"{MARK} Malgudi Days", "copies": 1})
    code, ebook = request("POST", "/school/library/books", token=tok,
                          body={"title": f"{MARK} NCERT Maths e-book", "digital_url": "https://ncert.nic.in/textbook.php"})
    assert code == 201 and ebook["total_copies"] == 0
    code, hits = request("GET", f"/school/library/books?q={acc}", token=tok)
    assert [b["id"] for b in hits] == [novel["id"]], hits
    print(f"  catalogue ok; {novel['title']} copy {acc}")

    section("Issue rules")
    code, err = request("POST", "/school/library/loans", token=tok, body={**student, "accession_no": ref["copies"][0]["accession_no"]})
    assert code == 400 and "Reference" in err["detail"], err
    code, loan = request("POST", "/school/library/loans", token=tok, body={**student, "accession_no": acc.lower()})
    assert code == 201 and loan["title"].endswith("Wings of Fire"), loan
    code, err = request("POST", "/school/library/loans", token=tok, body={**student, "accession_no": second["copies"][0]["accession_no"]})
    assert code == 400 and "limit" in err["detail"], err
    code, err = request("POST", "/school/library/loans", token=tok, body={**staff, "accession_no": acc})
    assert code == 400 and "issued" in err["detail"], err

    section("Reservation + renewal")
    code, res = request("POST", "/school/library/reservations", token=tok, body={**staff, "book_id": novel["id"]})
    assert code == 201 and res["status"] == "waiting" and res["queue_position"] == 1, res
    code, err = request("POST", f"/school/library/loans/{loan['id']}/renew", token=tok)
    assert code == 400 and "waiting" in err["detail"], err

    section("Late return → fine → billed")
    backdate_due(loan["id"], 3)
    code, ret = request("POST", f"/school/library/loans/{loan['id']}/return", token=tok, body={})
    assert code == 200 and Decimal(ret["fine_amount"]) == 15 and ret["fine_status"] == "billed", ret
    code, fees = request("GET", f"/parent/me/children/{sid}/fees", token=ptok)
    assert any(f["fee_head_code"] == HEAD_CODE and Decimal(f["amount_due"]) == 15 for f in fees), fees
    print("  3 days late → ₹15 added to the student's fees")

    section("Hold for reserver")
    code, reservations = request("GET", "/school/library/reservations", token=tok)
    mine = next(r for r in reservations if r["id"] == res["id"])
    assert mine["status"] == "ready" and mine["held_accession_no"] == acc, mine
    code, err = request("POST", "/school/library/loans", token=tok, body={**student, "accession_no": acc})
    assert code == 400 and "hold" in err["detail"], err
    code, tloan = request("POST", "/school/library/loans", token=tok, body={**staff, "accession_no": acc})
    assert code == 201, tloan
    code, reservations = request("GET", "/school/library/reservations", token=tok)
    assert not any(r["id"] == res["id"] for r in reservations), "fulfilled reservation leaves the active list"

    section("Lost copy")
    code, lost = request("POST", f"/school/library/loans/{tloan['id']}/lost", token=tok, body={"note": "Left on bus"})
    assert code == 200 and Decimal(lost["fine_amount"]) == 400 and lost["fine_status"] == "pending", lost
    code, err = request("POST", f"/school/library/loans/{tloan['id']}/fine", token=tok, body={"action": "bill"})
    assert code == 400, "staff fines can't go to student fees"
    code, paid = request("POST", f"/school/library/loans/{tloan['id']}/fine", token=tok, body={"action": "paid", "note": "Cash"})
    assert code == 200 and paid["fine_status"] == "paid", paid
    code, detail = request("GET", f"/school/library/books/{novel['id']}", token=tok)
    assert detail["copies"][0]["status"] == "lost" and detail["total_copies"] == 0, detail

    section("Self-service + dashboard")
    code, child = request("GET", f"/parent/me/children/{sid}/library", token=ptok)
    assert any(l["id"] == loan["id"] and l["returned_on"] for l in child), child
    code, mine = request("GET", "/staff/library", token=ttok)
    assert any(l["id"] == tloan["id"] and l["lost_on"] for l in mine), mine
    code, dash = request("GET", "/school/library/dashboard", token=tok)
    assert code == 200 and dash["titles"] >= 4, dash
    print(f"  dashboard: {dash['titles']} titles, {dash['on_loan']} on loan, {dash['overdue']} overdue")

    print("\nALL LIBRARY CHECKS PASSED")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"\nFAILED: {e}")
        sys.exit(1)
