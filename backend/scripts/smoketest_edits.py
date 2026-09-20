"""Smoke test for the "fix it before it counts" edits.

Every one of these follows the same rule: a record can be corrected while it is
still a request or an intention, and stops being editable the moment it becomes
a fact — money collected, a visitor through the gate, a leave decided.

Covers: a fee charge, a concession, an expense voucher, a student leave
request, a transport assignment, a hostel bed move, a sick-room note, a
pre-registered visit with its host's answer, a library due date and hold, and
closing a conversation.

Run:
    docker exec sms-backend python -m scripts.smoketest_edits
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
from app.models.accounts import Concession, Expense, ExpenseCategory
from app.models.fee import FeeHead, FeeStructure, StudentFee
from app.models.hostel import Hostel, HostelAllocation, HostelBed, HostelRoom
from app.models.library import Book, BookCopy, Loan, Reservation
from app.models.cover import StudentLeave
from app.models.messaging import Conversation, Message
from app.models.transport import TransportAssignment, TransportRoute, TransportStop, Vehicle
from app.models.user import User
from app.models.visitor import Visit
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-EDIT"


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


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def reset_passwords():
    db = SessionLocal()
    try:
        for email, pw in (
            (ADMIN[0], ADMIN[1]),
            (devdata.TEACHER_EMAIL, "TeacherPass123!"),
            (devdata.PARENT_EMAIL, "ParentPass123!"),
        ):
            u = db.execute(select(User).where(User.email == email)).scalar_one()
            u.password_hash = hash_password(pw)
        db.commit()
    finally:
        db.close()


def cleanup():
    db = SessionLocal()
    try:
        ids = devdata.school()
        child = devdata.child_id()
        db.execute(StudentFee.__table__.delete().where(StudentFee.notes.like(f"{TAG}%")))
        heads = select(FeeHead.id).where(FeeHead.name.like(f"{TAG}%"))
        db.execute(StudentFee.__table__.delete().where(StudentFee.fee_head_id.in_(heads)))
        db.execute(FeeStructure.__table__.delete().where(FeeStructure.fee_head_id.in_(heads)))
        db.execute(FeeHead.__table__.delete().where(FeeHead.name.like(f"{TAG}%")))
        db.execute(Concession.__table__.delete().where(Concession.reason.like(f"{TAG}%")))
        db.execute(Expense.__table__.delete().where(Expense.description.like(f"{TAG}%")))
        db.execute(ExpenseCategory.__table__.delete().where(ExpenseCategory.name.like(f"{TAG}%")))
        books = select(Book.id).where(Book.title.like(f"{TAG}%"))
        copies = select(BookCopy.id).where(BookCopy.book_id.in_(books))
        db.execute(Reservation.__table__.delete().where(Reservation.book_id.in_(books)))
        db.execute(Loan.__table__.delete().where(Loan.copy_id.in_(copies)))
        db.execute(BookCopy.__table__.delete().where(BookCopy.book_id.in_(books)))
        db.execute(Book.__table__.delete().where(Book.title.like(f"{TAG}%")))
        db.execute(StudentLeave.__table__.delete().where(StudentLeave.reason.like(f"{TAG}%")))
        db.execute(Visit.__table__.delete().where(Visit.visitor_name.like(f"{TAG}%")))
        hostels = select(Hostel.id).where(Hostel.name.like(f"{TAG}%"))
        rooms = select(HostelRoom.id).where(HostelRoom.hostel_id.in_(hostels))
        beds = select(HostelBed.id).where(HostelBed.room_id.in_(rooms))
        db.execute(HostelAllocation.__table__.delete().where(HostelAllocation.bed_id.in_(beds)))
        db.execute(HostelBed.__table__.delete().where(HostelBed.room_id.in_(rooms)))
        db.execute(HostelRoom.__table__.delete().where(HostelRoom.hostel_id.in_(hostels)))
        db.execute(Hostel.__table__.delete().where(Hostel.name.like(f"{TAG}%")))
        routes = select(TransportRoute.id).where(TransportRoute.name.like(f"{TAG}%"))
        db.execute(TransportAssignment.__table__.delete().where(TransportAssignment.route_id.in_(routes)))
        db.execute(TransportStop.__table__.delete().where(TransportStop.route_id.in_(routes)))
        db.execute(TransportRoute.__table__.delete().where(TransportRoute.name.like(f"{TAG}%")))
        db.execute(Vehicle.__table__.delete().where(Vehicle.registration_no.like(f"{TAG}%")))
        convs = select(Conversation.id).where(Conversation.student_id == child)
        db.execute(Message.__table__.delete().where(Message.conversation_id.in_(convs)))
        db.execute(Conversation.__table__.delete().where(Conversation.student_id == child))
        db.commit()
    finally:
        db.close()


def main():
    cleanup()
    reset_passwords()
    tok = login("school", *ADMIN)
    ttok = login("teacher", devdata.TEACHER_EMAIL, "TeacherPass123!")
    ptok = login("parent", devdata.PARENT_EMAIL, "ParentPass123!")
    child = devdata.child_id()
    year = devdata.year_id()
    try:
        section("A fee charge, before and after money arrives")
        code, head = request("POST", "/school/fees/heads", token=tok, body={
            "name": f"{TAG} Trip", "code": f"{TAG[:6]}T1", "is_recurring": True})
        assert code == 201, head
        code, structure = request("POST", "/school/fees/structures", token=tok, body={
            "academic_year_id": year, "class_id": devdata.klass().id,
            "fee_head_id": head["id"], "amount": "500"})
        assert code == 201, structure
        period = f"{date.today():%Y-%m}"
        code, gen = request("POST", "/school/fees/generate", token=tok,
                            body={"academic_year_id": year, "period": period})
        assert code == 200, gen
        code, listing = request("GET", f"/school/fees/student-fees?student_id={child}", token=tok)
        charge = next(f for f in listing["items"] if f["fee_head_id"] == head["id"])
        code, fixed = request("PATCH", f"/school/fees/student-fees/{charge['id']}", token=tok,
                              body={"amount_due": "450", "notes": f"{TAG} revised quote"})
        assert code == 200 and float(fixed["amount_due"]) == 450.0, fixed
        code, paid = request("POST", f"/school/fees/student-fees/{charge['id']}/record-payment", token=tok,
                             body={"amount_paid": "100", "payment_mode": "cash"})
        assert code == 200, paid
        code, err = request("PATCH", f"/school/fees/student-fees/{charge['id']}", token=tok,
                            body={"amount_due": "300"})
        assert code == 400 and "already been collected" in err["detail"], err
        print("  corrected at 450, then refused once 100 was collected")

        section("A concession and a voucher")
        code, con = request("POST", "/school/accounts/concessions", token=tok, body={
            "student_id": child, "kind": "percent", "value": "10",
            "reason": f"{TAG} sibling", "valid_from": str(date.today())})
        assert code == 201, con
        code, con2 = request("PATCH", f"/school/accounts/concessions/{con['id']}", token=tok,
                             body={"value": "15", "notes": f"{TAG} raised after review"})
        assert code == 200 and float(con2["value"]) == 15.0, con2
        code, err = request("PATCH", f"/school/accounts/concessions/{con['id']}", token=tok,
                            body={"kind": "percent", "value": "120"})
        assert code == 400 and "exceed 100" in err["detail"], err
        code, ended = request("POST", f"/school/accounts/concessions/{con['id']}/end", token=tok)
        assert code == 200, ended
        code, err = request("PATCH", f"/school/accounts/concessions/{con['id']}", token=tok, body={"value": "5"})
        assert code == 400 and "has ended" in err["detail"], err

        code, cat = request("POST", "/school/accounts/expense-categories", token=tok,
                            body={"name": f"{TAG} Sundries"})
        assert code == 201, cat
        code, exp = request("POST", "/school/accounts/expenses", token=tok, body={
            "spent_on": str(date.today()), "category_id": cat["id"], "payee": "Corner Shop",
            "amount": "250", "mode": "cash", "description": f"{TAG} chalk and dusters"})
        assert code == 201, exp
        code, amended = request("PATCH", f"/school/accounts/expenses/{exp['id']}", token=tok,
                                body={"amount": "275", "reference": "BILL-91"})
        assert code == 200 and float(amended["amount"]) == 275.0, amended
        code, void = request("POST", f"/school/accounts/expenses/{exp['id']}/void", token=tok,
                             body={"reason": f"{TAG} duplicate"})
        assert code == 200, void
        code, err = request("PATCH", f"/school/accounts/expenses/{exp['id']}", token=tok, body={"amount": "10"})
        assert code == 400 and "void" in err["detail"], err
        print("  concession raised then frozen on ending; voucher amended then frozen on voiding")

        section("A leave request the school hasn't answered")
        start = date.today() + timedelta(days=5)
        code, leave = request("POST", f"/parent/me/children/{child}/leaves", token=ptok, body={
            "kind": "sick", "from_date": str(start), "to_date": str(start + timedelta(days=1)),
            "reason": f"{TAG} fever"})
        assert code == 201, leave
        code, moved = request("PATCH", f"/parent/me/children/{child}/leaves/{leave['id']}", token=ptok,
                              body={"to_date": str(start + timedelta(days=3)), "reason": f"{TAG} fever, still unwell"})
        assert code == 200 and moved["to_date"] == str(start + timedelta(days=3)), moved
        code, err = request("PATCH", f"/parent/me/children/{child}/leaves/{leave['id']}", token=ptok,
                            body={"to_date": str(start - timedelta(days=2))})
        assert code == 400 and "end before it starts" in err["detail"], err
        code, decided = request("POST", f"/school/student-leaves/{leave['id']}/decide", token=tok,
                                body={"approve": True})
        assert code == 200, decided
        code, err = request("PATCH", f"/parent/me/children/{child}/leaves/{leave['id']}", token=ptok,
                            body={"reason": f"{TAG} too late"})
        assert code == 400 and "already approved" in err["detail"], err
        print("  re-dated while pending, frozen once approved")

        section("A transport assignment")
        code, veh = request("POST", "/school/transport/vehicles", token=tok, body={
            "registration_no": f"{TAG}-01", "capacity": 40, "kind": "bus"})
        assert code == 201, veh
        code, route = request("POST", "/school/transport/routes", token=tok, body={
            "name": f"{TAG} Morning loop", "code": f"{TAG[:6]}R1", "vehicle_id": veh["id"],
            "stops": [{"name": f"{TAG} First stop", "pickup_time": "07:31"},
                      {"name": f"{TAG} Second stop", "pickup_time": "07:32"}]})
        assert code == 201, route
        stops = route["stops"]
        assert len(stops) == 2, route
        code, assigned = request("POST", "/school/transport/assignments", token=tok, body={
            "student_id": child, "route_id": route["id"], "stop_id": stops[0]["id"], "direction": "both"})
        assert code == 201, assigned
        code, changed = request("PATCH", f"/school/transport/assignments/{assigned['id']}", token=tok,
                                body={"stop_id": stops[1]["id"], "direction": "pickup"})
        assert code == 200 and changed["stop_id"] == stops[1]["id"] and changed["direction"] == "pickup", changed
        code, err = request("PATCH", f"/school/transport/assignments/{assigned['id']}", token=tok,
                            body={"stop_id": 999999})
        assert code == 400 and "isn't on this route" in err["detail"], err
        code, ended = request("POST", f"/school/transport/assignments/{assigned['id']}/end", token=tok, body={})
        assert code == 200, ended
        code, err = request("PATCH", f"/school/transport/assignments/{assigned['id']}", token=tok,
                            body={"direction": "both"})
        assert code == 400 and "has ended" in err["detail"], err
        print("  stop and direction corrected, refused once the assignment ended")

        section("Moving a boarder to another bed")
        code, hostel = request("POST", "/school/hostels", token=tok, body={
            "name": f"{TAG} House", "kind": "boys"})
        assert code == 201, hostel
        beds = []
        for room_no in ("101", "102"):
            code, rooms = request("POST", f"/school/hostels/{hostel['id']}/rooms", token=tok,
                                  body={"room_no": room_no, "beds": 1})
            assert code == 201, rooms
            room = next(r for r in rooms if r["room_no"] == room_no)
            beds.append(room["beds"][0]["id"])
        code, alloc = request("POST", "/school/hostels/allocations", token=tok, body={
            "student_id": child, "bed_id": beds[0],
            "start_date": str(date.today() - timedelta(days=10))})
        assert code == 201, alloc
        code, moved_bed = request("POST", f"/school/hostels/allocations/{alloc['id']}/transfer", token=tok,
                                  body={"bed_id": beds[1]})
        assert code == 201 and moved_bed["bed_id"] == beds[1], moved_bed
        code, err = request("POST", f"/school/hostels/allocations/{alloc['id']}/transfer", token=tok,
                            body={"bed_id": beds[0]})
        assert code == 400 and "already moved out" in err["detail"], err
        code, err = request("POST", f"/school/hostels/allocations/{moved_bed['id']}/transfer", token=tok,
                            body={"bed_id": beds[1]})
        assert code == 400 and "already in" in err["detail"], err
        print("  one move, two allocations, no night in nobody's bed")

        section("A sick-room note finished later")
        code, visit = request("POST", "/school/health/visits", token=tok, body={
            "student_id": child, "complaint": f"{TAG} headache", "notify_parent": False})
        assert code == 201, visit
        code, done = request("PATCH", f"/school/health/visits/{visit['id']}", token=tok, body={
            "treatment": "Rested with water", "outcome": "rested", "follow_up_on": str(date.today() + timedelta(days=2))})
        assert code == 200 and done["outcome"] == "rested" and done["treatment"], done
        print("  complaint first, treatment and outcome after")

        section("A visit, its host, and the gate")
        tomorrow = datetime.now(timezone.utc) + timedelta(days=1)
        code, visit = request("POST", "/school/front-desk/visits", token=tok, body={
            "visitor_name": f"{TAG} Vendor", "phone": "9800000123", "purpose": "vendor",
            "host_user_id": devdata.user_id(devdata.TEACHER_EMAIL), "expected_at": tomorrow.isoformat()})
        assert code == 201 and visit["status"] == "expected", visit
        code, edited = request("PATCH", f"/school/front-desk/visits/{visit['id']}", token=tok,
                               body={"people_count": 2, "vehicle_no": "ka01ab1234"})
        assert code == 200 and edited["people_count"] == 2 and edited["vehicle_no"] == "KA01AB1234", edited
        code, ok = request("POST", f"/school/front-desk/visits/{visit['id']}/host-decision", token=ttok,
                           body={"approved": True})
        assert code == 200 and ok["host_approved_at"], ok
        code, err = request("POST", f"/school/front-desk/visits/{visit['id']}/host-decision", token=ttok,
                            body={"approved": False})
        assert code == 400 and "say why" in err["detail"].lower(), err
        code, declined = request("POST", f"/school/front-desk/visits/{visit['id']}/host-decision", token=ttok,
                                 body={"approved": False, "reason": f"{TAG} in class all day"})
        assert declined["status"] == "denied" and declined["host_declined_reason"], declined
        code, err = request("PATCH", f"/school/front-desk/visits/{visit['id']}", token=tok, body={"people_count": 3})
        assert code == 400 and "no longer be changed" in err["detail"], err
        print("  edited while expected; host approved, then declined with a reason")

        section("A library due date and a hold")
        code, book = request("POST", "/school/library/books", token=tok, body={
            "title": f"{TAG} Long Project Book", "authors": "B. Slow", "copies": 1})
        assert code == 201, book
        code, loan = request("POST", "/school/library/loans", token=tok, body={
            "accession_no": book["copies"][0]["accession_no"], "borrower_type": "student", "student_id": child})
        assert code == 201, loan
        later = date.today() + timedelta(days=45)
        code, extended = request("PATCH", f"/school/library/loans/{loan['id']}", token=tok,
                                 body={"due_on": str(later), "note": f"{TAG} project runs past the holidays"})
        assert code == 200 and extended["due_on"] == str(later), extended
        code, err = request("PATCH", f"/school/library/loans/{loan['id']}", token=tok,
                            body={"due_on": str(date.today() - timedelta(days=100))})
        assert code == 400 and "due before it was issued" in err["detail"], err
        print(f"  due date overridden to {later} with the reason on the loan")

        section("Closing a conversation")
        code, contacts = request("GET", f"/parent/me/children/{child}/teacher-contacts", token=ptok)
        assert code == 200 and contacts, contacts
        iyer = devdata.user_id(devdata.TEACHER_EMAIL)
        contacts = [c for c in contacts if c["teacher_user_id"] == iyer] or contacts
        code, sent = request("POST", "/parent/me/conversations", token=ptok, body={
            "student_id": child, "teacher_user_id": contacts[0]["teacher_user_id"], "body": f"{TAG} a question"})
        assert code == 201, sent
        code, convs = request("GET", "/teacher/conversations", token=ttok)
        conv = next(c for c in convs if c["student_id"] == child)
        assert not conv["is_closed"], conv
        code, closed = request("PATCH", f"/teacher/conversations/{conv['id']}", token=ttok, body={"closed": True})
        assert code == 200 and closed["is_closed"], closed
        code, active = request("GET", "/teacher/conversations", token=ttok)
        assert all(c["id"] != conv["id"] for c in active), "closed threads leave the active list"
        code, all_ = request("GET", "/teacher/conversations?include_closed=true", token=ttok)
        assert any(c["id"] == conv["id"] for c in all_), all_
        code, replied = request("POST", "/parent/me/conversations", token=ptok, body={
            "student_id": child, "teacher_user_id": contacts[0]["teacher_user_id"], "body": f"{TAG} one more thing"})
        assert code == 201, replied
        code, active = request("GET", "/teacher/conversations", token=ttok)
        assert any(c["id"] == conv["id"] for c in active), "a new message brings it back"
        print("  put away, then reopened by the parent writing again")

        print("\nALL EDIT CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
