"""End-to-end smoke test for accounts.

Verifies:
    Fee receipts: every counter payment (incl. part payments) gets its own
      numbered FeeCollection, so collections can be reported by day and mode.
    Concessions: 25% on a head reduces fees generated afterwards (with a note);
      apply_to_pending reduces untouched fees already raised.
    Post-dated cheque: can't deposit before its date; clearing credits the fees
      oldest-first as cheque receipts; bounce needs a reason and can raise a charge.
    Expenses need a payee; other income gets receipt numbers; voids are excluded.
    Cash book totals fees + other income − expenses for the range.

Run:
    docker exec sms-backend python -m scripts.smoketest_accounts
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.enums import FeeStatus
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import Section
from app.models.accounts import Cheque, Concession, Expense, FeeCollection, OtherIncome
from app.models.fee import FeeHead, FeeStructure, StudentFee
from app.models.student import Student
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
ACCOUNTANT = ("accountant@sms.local", "AccountantPass123!")
HEAD_CODE, BOUNCE_CODE = "SMKACC", "SMKBNC"
P1, P2 = "2031-03", "2031-04"  # far-future periods so real fees aren't touched


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
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
        heads = select(FeeHead.id).where(FeeHead.code.in_((HEAD_CODE, BOUNCE_CODE)))
        db.execute(Cheque.__table__.delete().where(Cheque.bank_name == "Smoke Bank"))
        db.execute(Concession.__table__.delete().where(Concession.reason == "Smoke merit"))
        db.execute(StudentFee.__table__.delete().where(StudentFee.period.in_((P1, P2))))  # FeeCollections cascade
        db.execute(StudentFee.__table__.delete().where(StudentFee.fee_head_id.in_(heads)))
        db.execute(FeeStructure.__table__.delete().where(FeeStructure.fee_head_id.in_(heads)))
        db.execute(FeeHead.__table__.delete().where(FeeHead.code.in_((HEAD_CODE, BOUNCE_CODE))))
        db.execute(Expense.__table__.delete().where(Expense.description.like("Smoke%")))
        db.execute(OtherIncome.__table__.delete().where(OtherIncome.payer.like("Smoke%")))
        db.commit()
    finally:
        db.close()


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        acc = db.execute(select(User).where(User.email == ACCOUNTANT[0])).scalar_one()
        acc.password_hash = hash_password(ACCOUNTANT[1])
        student = db.execute(select(Student).where(Student.school_id == admin.school_id, Student.is_active.is_(True))).scalars().first()
        sec = db.get(Section, student.section_id)
        db.commit()
        return student.id, sec.class_id, student.academic_year_id
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, (role, data)
    return data["access_token"]


def my_fee(sid, period):
    db = SessionLocal()
    try:
        return db.execute(select(StudentFee).join(FeeHead, StudentFee.fee_head_id == FeeHead.id).where(
            StudentFee.student_id == sid, StudentFee.period == period, FeeHead.code == HEAD_CODE)).scalar_one()
    finally:
        db.close()


def main():
    cleanup()
    sid, class_id, year_id = setup()
    try:
        tok = login("school", *ADMIN)
        atok = login("accountant", *ACCOUNTANT)
        code, head = request("POST", "/school/fees/heads", token=tok, body={"name": "Smoke tuition", "code": HEAD_CODE, "is_recurring": True})
        assert code == 201, head
        code, bhead = request("POST", "/school/fees/heads", token=tok, body={"name": "Smoke bounce charge", "code": BOUNCE_CODE, "is_recurring": False})
        code, st = request("POST", "/school/fees/structures", token=tok, body={
            "academic_year_id": year_id, "class_id": class_id, "fee_head_id": head["id"], "amount": "4000", "due_day_of_month": 10})
        assert code == 201, st

        section("Concessions")
        code, g = request("POST", "/school/fees/generate", token=tok, body={"academic_year_id": year_id, "period": P1})
        assert code == 200, g
        assert my_fee(sid, P1).amount_due == Decimal("4000.00")
        code, c = request("POST", "/school/accounts/concessions", token=atok, body={
            "student_id": sid, "fee_head_id": head["id"], "kind": "percent", "value": "25", "reason": "Smoke merit",
            "valid_from": "2031-01-01", "apply_to_pending": True})
        assert code == 201 and c["applied_to_pending"] == 1, c
        assert my_fee(sid, P1).amount_due == Decimal("3000.00"), "existing untouched fee reduced"
        request("POST", "/school/fees/generate", token=tok, body={"academic_year_id": year_id, "period": P2})
        f2 = my_fee(sid, P2)
        assert f2.amount_due == Decimal("3000.00") and f2.notes.startswith("Concession"), (f2.amount_due, f2.notes)
        code, err = request("POST", "/school/accounts/concessions", token=atok, body={
            "student_id": sid, "kind": "percent", "value": "150", "reason": "Smoke merit", "valid_from": "2031-01-01"})
        assert code == 422, err
        print("  25% applied to the raised fee and to newly generated fees")

        section("Part payments → receipts")
        f1 = my_fee(sid, P1)
        for amt, mode in (("1000", "Cash"), ("500", "UPI")):
            code, r = request("POST", f"/school/fees/student-fees/{f1.id}/record-payment", token=atok,
                              body={"amount_paid": amt, "payment_mode": mode, "payment_ref": "Smoke"})
            assert code == 200, r
        today = date.today()
        code, cols = request("GET", f"/school/accounts/collections?student_id={sid}&from={today}&to={today}", token=atok)
        mine = [x for x in cols if x["period"] == P1]
        assert sorted((x["mode"], x["amount"]) for x in mine) == [("cash", "1000.00"), ("upi", "500.00")], mine
        assert len({x["receipt_no"] for x in mine}) == 2
        print(f"  receipts {[x['receipt_no'] for x in mine]}")

        section("Post-dated cheque")
        code, err = request("POST", "/school/accounts/cheques", token=atok, body={
            "student_id": sid, "fee_ids": [f1.id, f2.id], "amount": "9999", "cheque_no": "123456", "bank_name": "Smoke Bank", "cheque_date": "2031-03-05"})
        assert code == 400 and "more than" in err["detail"], err
        code, chq = request("POST", "/school/accounts/cheques", token=atok, body={
            "student_id": sid, "fee_ids": [f2.id, f1.id], "amount": "4500", "cheque_no": "123456", "bank_name": "Smoke Bank",
            "cheque_date": (today + timedelta(days=10)).isoformat()})
        assert code == 201 and chq["status"] == "received" and not chq["due_for_deposit"], chq
        code, err = request("POST", f"/school/accounts/cheques/{chq['id']}/action", token=atok, body={"action": "deposit"})
        assert code == 400 and "Post-dated" in err["detail"], err
        code, chq = request("POST", f"/school/accounts/cheques/{chq['id']}/action", token=atok, body={"action": "deposit", "on": (today + timedelta(days=10)).isoformat()})
        assert chq["status"] == "deposited", chq
        code, chq = request("POST", f"/school/accounts/cheques/{chq['id']}/action", token=atok, body={"action": "clear"})
        assert code == 200 and chq["status"] == "cleared", chq
        a, b = my_fee(sid, P1), my_fee(sid, P2)
        assert a.status.value == "paid" and a.amount_paid == Decimal("3000.00"), (a.status, a.amount_paid)
        assert b.status.value == "paid" and b.amount_paid == Decimal("3000.00"), (b.status, b.amount_paid)
        code, cols = request("GET", f"/school/accounts/collections?mode=cheque&student_id={sid}", token=atok)
        assert sorted(Decimal(x["amount"]) for x in cols if x["period"] in (P1, P2)) == [Decimal(1500), Decimal(3000)], cols
        print("  cheque cleared: P1 topped up 1500, P2 paid 3000")

        section("Bounce")
        # A fresh fee to pay by a cheque that will bounce.
        db = SessionLocal()
        sf = StudentFee(tenant_id=a.tenant_id, school_id=a.school_id, student_id=sid, fee_structure_id=None, source="smoke",
                        source_id=1, fee_head_id=head["id"], period=P1, amount_due=Decimal("800"), amount_paid=Decimal("0"),
                        due_date=date(2031, 3, 20), status=FeeStatus.pending)
        db.add(sf)
        db.commit()
        fee3 = sf.id
        db.close()
        code, chq2 = request("POST", "/school/accounts/cheques", token=atok, body={
            "student_id": sid, "fee_ids": [fee3], "amount": "800", "cheque_no": "654321", "bank_name": "Smoke Bank", "cheque_date": today.isoformat()})
        assert code == 201 and chq2["due_for_deposit"], chq2
        request("POST", f"/school/accounts/cheques/{chq2['id']}/action", token=atok, body={"action": "deposit"})
        code, err = request("POST", f"/school/accounts/cheques/{chq2['id']}/action", token=atok, body={"action": "bounce"})
        assert code == 400, err
        code, chq2 = request("POST", f"/school/accounts/cheques/{chq2['id']}/action", token=atok, body={
            "action": "bounce", "bounce_reason": "Insufficient funds", "bounce_charge": "300", "bounce_fee_head_id": bhead["id"]})
        assert code == 200 and chq2["status"] == "bounced", chq2
        db = SessionLocal()
        charge = db.execute(select(StudentFee).where(StudentFee.source == "cheque_bounce", StudentFee.source_id == chq2["id"])).scalar_one()
        assert charge.amount_due == Decimal("300.00")
        db.close()
        print("  bounced with a Rs. 300 charge raised")

        section("Expenses, income, cash book")
        code, cats = request("GET", "/school/accounts/expense-categories", token=atok)
        assert len(cats) >= 5, cats
        code, err = request("POST", "/school/accounts/expenses", token=atok, body={
            "spent_on": today.isoformat(), "category_id": cats[0]["id"], "amount": "1200", "mode": "cash", "description": "Smoke bulbs"})
        assert code == 400 and "who was paid" in err["detail"], err
        code, e1 = request("POST", "/school/accounts/expenses", token=atok, body={
            "spent_on": today.isoformat(), "category_id": cats[0]["id"], "payee": "Local electrician", "amount": "1200", "mode": "cash", "description": "Smoke bulbs"})
        assert code == 201, e1
        code, e2 = request("POST", "/school/accounts/expenses", token=atok, body={
            "spent_on": today.isoformat(), "category_id": cats[0]["id"], "payee": "Someone", "amount": "99999", "mode": "cash", "description": "Smoke typo"})
        request("POST", f"/school/accounts/expenses/{e2['id']}/void", token=atok, body={"reason": "Entered twice"})
        code, inc = request("POST", "/school/accounts/income", token=atok, body={
            "received_on": today.isoformat(), "source": "donation", "payer": "Smoke Alumni Assoc.", "amount": "5000", "mode": "bank_transfer"})
        assert code == 201 and inc["receipt_no"].startswith("OI"), inc
        code, book = request("GET", f"/school/accounts/cash-book?from={today}&to={today}", token=atok)
        assert code == 200, book
        assert Decimal(book["income"]["other"]["donation"]) >= 5000
        assert Decimal(book["income"]["fees"]["cash"]) >= 1000 and Decimal(book["income"]["fees"]["cheque"]) >= 4500
        assert "99999" not in json.dumps(book["expenses"]), "void expense excluded"
        assert Decimal(book["net"]) == Decimal(book["total_in"]) - Decimal(book["total_out"])
        print(f"  cash book today: in {book['total_in']}, out {book['total_out']}, net {book['net']}")

        print("\nALL ACCOUNTS CHECKS PASSED")
    except AssertionError as e:
        print(f"\nFAILED: {e}")
        sys.exit(1)
    finally:
        cleanup()


if __name__ == "__main__":
    main()
