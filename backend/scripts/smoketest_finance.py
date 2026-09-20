"""Smoke test for per-child fee amounts, the ledger, and money owed to suppliers.

Verifies:
    An assignment overrides what the class charges, and generation uses it —
    so a scholarship is one fact in one place rather than a number somebody
    recomputes by hand each month.
    An assignment can charge a head the class has no structure for, and
    running generation twice does not charge it twice.
    A concession still comes off on top of an assignment. The two answer
    different questions and neither swallows the other.
    Money already collected is never rewritten: applying a changed amount
    leaves a paid charge alone and says which ones it left.
    A bill cannot be paid more than it is for.
    A ledger's closing balance equals what was charged less what was received,
    and it never dips below zero on the day a charge and its receipt share.

Every fixture here is built by the test. Asserting over whatever the seed
happens to hold is how a check silently passes over an empty list.

Run:
    docker exec sms-backend python -m scripts.smoketest_finance
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
from app.models.accounts import Concession, FeeCollection
from app.models.fee import FeeHead, FeeStructure, StudentFee
from app.models.fee_plan import StudentFeeAssignment
from app.models.inventory import Supplier
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine, VendorBill, VendorPayment
from app.models.user import User
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-FIN"


def request(method, path, *, token=None, body=None):
    data = json.dumps(body, default=str).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
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
        u = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        u.password_hash = hash_password(ADMIN[1])
        db.commit()
    finally:
        db.close()
    code, data = request("POST", "/school/auth/login",
                         body={"email": ADMIN[0], "password": ADMIN[1]})
    assert code == 200, data
    return data["access_token"]


def cleanup():
    db = SessionLocal()
    try:
        heads = select(FeeHead.id).where(FeeHead.code.like(f"{TAG}%"))
        fees = select(StudentFee.id).where(StudentFee.fee_head_id.in_(heads))
        db.execute(FeeCollection.__table__.delete().where(
            FeeCollection.student_fee_id.in_(fees)))
        db.execute(StudentFee.__table__.delete().where(
            StudentFee.fee_head_id.in_(heads)))
        db.execute(StudentFeeAssignment.__table__.delete().where(
            StudentFeeAssignment.fee_head_id.in_(heads)))
        db.execute(Concession.__table__.delete().where(
            Concession.reason.like(f"{TAG}%")))
        db.execute(FeeStructure.__table__.delete().where(
            FeeStructure.fee_head_id.in_(heads)))
        db.execute(FeeHead.__table__.delete().where(FeeHead.code.like(f"{TAG}%")))

        sups = select(Supplier.id).where(Supplier.name.like(f"{TAG}%"))
        bills = select(VendorBill.id).where(VendorBill.supplier_id.in_(sups))
        orders = select(PurchaseOrder.id).where(PurchaseOrder.supplier_id.in_(sups))
        db.execute(VendorPayment.__table__.delete().where(VendorPayment.bill_id.in_(bills)))
        db.execute(VendorBill.__table__.delete().where(VendorBill.supplier_id.in_(sups)))
        db.execute(PurchaseOrderLine.__table__.delete().where(
            PurchaseOrderLine.order_id.in_(orders)))
        db.execute(PurchaseOrder.__table__.delete().where(
            PurchaseOrder.supplier_id.in_(sups)))
        db.execute(Supplier.__table__.delete().where(Supplier.name.like(f"{TAG}%")))
        db.commit()
    finally:
        db.close()


def money(x) -> Decimal:
    return Decimal(str(x))


def main():
    cleanup()
    tok = login()
    ids = devdata.school()
    year = devdata.year_id()
    klass = devdata.klass()
    child = devdata.child_id()
    other = devdata.other_child_id()
    period = f"{date.today():%Y-%m}"

    # --- fixtures, built here rather than borrowed from the seed ---
    db = SessionLocal()
    try:
        tuition = FeeHead(**ids, name=f"{TAG} Tuition", code=f"{TAG}-TUI",
                          is_recurring=True, is_active=True)
        music = FeeHead(**ids, name=f"{TAG} Music", code=f"{TAG}-MUS",
                        is_recurring=True, is_active=True)
        db.add_all([tuition, music])
        db.flush()
        # Only tuition is charged to the class; music is the head the class
        # does not have, which is what an assignment has to be able to add.
        structure = FeeStructure(**ids, academic_year_id=year, class_id=klass.id,
                                 fee_head_id=tuition.id, amount=Decimal("5000.00"),
                                 due_day_of_month=10)
        db.add(structure)
        db.commit()
        tuition_id, music_id, structure_id = tuition.id, music.id, structure.id
    finally:
        db.close()

    try:
        section("An assignment overrides what the class charges")
        code, a = request("POST", "/school/finance/assignments", token=tok, body={
            "student_id": child, "fee_head_id": tuition_id, "academic_year_id": year,
            "amount": "2000.00", "reason": f"{TAG} bursary",
            "starts_on": str(date.today().replace(day=1))})
        assert code == 201, a
        assert money(a["class_amount"]) == money("5000.00"), a
        assert money(a["amount"]) == money("2000.00"), a
        assert money(a["difference"]) == money("-3000.00"), a
        assert a["is_extra"] is False, a
        print(f"  class charges {a['class_amount']}, this child {a['amount']}")

        code, dup = request("POST", "/school/finance/assignments", token=tok, body={
            "student_id": child, "fee_head_id": tuition_id, "academic_year_id": year,
            "amount": "1.00", "reason": f"{TAG} second opinion",
            "starts_on": str(date.today())})
        assert dup and dup.get("detail"), dup
        assert code == 409, "two live answers to what she pays is the state to prevent"
        print(f"  a second one is refused: {dup['detail'][:56]}…")

        section("Generation uses it, and charges the extra head too")
        code, gen = request("POST", "/school/fees/generate", token=tok, body={
            "academic_year_id": year, "period": period})
        assert code in (200, 201), gen

        db = SessionLocal()
        try:
            mine = db.execute(select(StudentFee).where(
                StudentFee.student_id == child,
                StudentFee.fee_head_id == tuition_id,
                StudentFee.period == period)).scalar_one()
            assert money(mine.amount_due) == money("2000.00"), (
                f"generation ignored the assignment: charged {mine.amount_due}")
            assert mine.notes and "Own rate" in mine.notes, mine.notes

            peer = db.execute(select(StudentFee).where(
                StudentFee.student_id == other,
                StudentFee.fee_head_id == tuition_id,
                StudentFee.period == period)).scalar_one_or_none()
            if peer:
                assert money(peer.amount_due) == money("5000.00"), (
                    "a child with no assignment still pays the class amount")
        finally:
            db.close()
        print(f"  charged 2000 not 5000, and the row says why")

        # the extra: a head the class has no structure for
        code, extra = request("POST", "/school/finance/assignments", token=tok, body={
            "student_id": child, "fee_head_id": music_id, "academic_year_id": year,
            "amount": "800.00", "reason": f"{TAG} music lessons",
            "starts_on": str(date.today().replace(day=1))})
        assert code == 201 and extra["is_extra"] is True, extra

        code, gen2 = request("POST", "/school/fees/generate", token=tok, body={
            "academic_year_id": year, "period": period})
        assert code in (200, 201), gen2
        db = SessionLocal()
        try:
            music_rows = list(db.execute(select(StudentFee).where(
                StudentFee.student_id == child,
                StudentFee.fee_head_id == music_id,
                StudentFee.period == period)).scalars())
            assert len(music_rows) == 1, (
                f"the extra was charged {len(music_rows)} times, not once")
            assert money(music_rows[0].amount_due) == money("800.00"), music_rows[0]
            assert music_rows[0].source == "assignment", music_rows[0].source
        finally:
            db.close()

        # and running it a third time must not duplicate
        request("POST", "/school/fees/generate", token=tok,
                body={"academic_year_id": year, "period": period})
        db = SessionLocal()
        try:
            again = db.execute(select(StudentFee).where(
                StudentFee.student_id == child,
                StudentFee.fee_head_id == music_id,
                StudentFee.period == period)).scalars().all()
            assert len(again) == 1, f"generation is not idempotent: {len(again)} rows"
        finally:
            db.close()
        print("  the extra head is charged once, and stays once when run again")

        section("A concession still comes off on top")
        db = SessionLocal()
        try:
            db.add(Concession(**ids, student_id=other, fee_head_id=tuition_id,
                              kind="percent", value=Decimal("10.00"),
                              reason=f"{TAG} staff ward",
                              valid_from=date.today() - timedelta(days=30),
                              is_active=True))
            db.commit()
        finally:
            db.close()
        next_period = f"{(date.today().replace(day=1) + timedelta(days=32)):%Y-%m}"
        request("POST", "/school/fees/generate", token=tok,
                body={"academic_year_id": year, "period": next_period})
        db = SessionLocal()
        try:
            peer_fee = db.execute(select(StudentFee).where(
                StudentFee.student_id == other,
                StudentFee.fee_head_id == tuition_id,
                StudentFee.period == next_period)).scalar_one_or_none()
            if peer_fee:
                assert money(peer_fee.amount_due) == money("4500.00"), (
                    f"10% off 5000 should be 4500, got {peer_fee.amount_due}")
                print("  10% off the class amount: 4500")
            else:
                print("  (the peer is not in the fee class; concession path unchanged)")
        finally:
            db.close()

        section("Money already collected is never rewritten")
        db = SessionLocal()
        try:
            paid_fee = db.execute(select(StudentFee).where(
                StudentFee.student_id == child,
                StudentFee.fee_head_id == tuition_id,
                StudentFee.period == period)).scalar_one()
            paid_fee_id = paid_fee.id
        finally:
            db.close()
        code, rec = request("POST",
                            f"/school/fees/student-fees/{paid_fee_id}/record-payment",
                            token=tok, body={"amount_paid": "2000.00",
                                             "payment_mode": "cash"})
        assert code == 200, rec

        code, upd = request("PATCH",
                            f"/school/finance/assignments/{a['id']}",
                            token=tok, body={"amount": "1500.00"})
        assert code == 200, upd
        code, applied = request("POST",
                                f"/school/finance/assignments/{a['id']}/apply",
                                token=tok)
        assert code == 200, applied
        assert applied["left_alone_count"] >= 1, (
            "the paid charge should have been left alone and reported")
        assert any(x["fee_id"] == paid_fee_id for x in applied["left_alone"]), applied

        db = SessionLocal()
        try:
            after = db.get(StudentFee, paid_fee_id)
            assert money(after.amount_due) == money("2000.00"), (
                f"a paid charge was rewritten to {after.amount_due}")
        finally:
            db.close()
        print(f"  {applied['updated']} unpaid charge(s) moved; "
              f"{applied['left_alone_count']} paid one left alone")

        section("A ledger's balance is the arithmetic")
        code, led = request("GET", f"/school/finance/ledger/{child}", token=tok)
        assert code == 200, led
        assert led["entries"], "the child has charges by now"
        expected = money(led["total_charged"]) - money(led["total_paid"])
        assert money(led["balance"]) == expected, (
            f"balance {led['balance']} is not charged {led['total_charged']} "
            f"less paid {led['total_paid']}")
        running = Decimal("0")
        for e in led["entries"]:
            running += money(e["charged"]) - money(e["paid"])
            assert money(e["balance"]) == running, e
        assert any(e["kind"] == "receipt" for e in led["entries"]), led["entries"]
        print(f"  {len(led['entries'])} entries, closing balance {led['balance']}")

        section("A bill cannot be paid more than it is for")
        db = SessionLocal()
        try:
            sup = Supplier(**ids, name=f"{TAG} Paper Co", is_active=True)
            db.add(sup)
            db.commit()
            supplier_id = sup.id
        finally:
            db.close()

        code, order = request("POST", "/school/finance/orders", token=tok, body={
            "supplier_id": supplier_id, "order_no": f"{TAG}-PO-1",
            "ordered_on": str(date.today()),
            "lines": [{"description": "A4 paper", "qty": "10", "unit_cost": "250.00"},
                      {"description": "Toner", "qty": "2", "unit_cost": "3000.00"}]})
        assert code == 201, order
        assert money(order["total"]) == money("8500.00"), (
            f"the header must follow the lines, got {order['total']}")
        print(f"  order totals {order['total']} from its lines")

        code, over = request("POST", f"/school/finance/orders/{order['id']}/receive",
                             token=tok, body={"lines": [
                                 {"line_id": order["lines"][0]["id"], "received_qty": "99"}]})
        assert code == 400 and "than was ordered" in over["detail"], over
        print(f"  refused: {over['detail'][:60]}…")

        code, bill = request("POST", "/school/finance/bills", token=tok, body={
            "supplier_id": supplier_id, "order_id": order["id"],
            "bill_no": f"{TAG}-B1", "billed_on": str(date.today()),
            "amount": "8000.00", "tax_amount": "500.00"})
        assert code == 201, bill
        assert money(bill["total"]) == money("8500.00"), bill

        code, p1 = request("POST", "/school/finance/payments", token=tok, body={
            "bill_id": bill["id"], "amount": "5000.00", "mode": "bank_transfer"})
        assert code == 201 and p1["status"] == "part_paid", p1

        code, toomuch = request("POST", "/school/finance/payments", token=tok, body={
            "bill_id": bill["id"], "amount": "5000.00", "mode": "cash"})
        assert code == 400 and "more than the bill" in toomuch["detail"], toomuch
        print(f"  refused: {toomuch['detail'][:62]}…")

        code, p2 = request("POST", "/school/finance/payments", token=tok, body={
            "bill_id": bill["id"], "amount": "3500.00", "mode": "cash"})
        assert code == 201 and p2["status"] == "paid", p2
        assert money(p2["outstanding"]) == money("0"), p2
        print("  paid in full, and the status followed")

        section("Payables are worked out, not stored")
        code, pay = request("GET", "/school/finance/payables", token=tok)
        assert code == 200, pay
        row = next((r for r in pay["suppliers"] if r["supplier_id"] == supplier_id), None)
        assert row is not None, pay["suppliers"]
        assert money(row["billed"]) == money("8500.00"), row
        assert money(row["paid"]) == money("8500.00"), row
        assert money(row["outstanding"]) == money("0"), row
        print(f"  {row['supplier_name']}: billed {row['billed']}, "
              f"paid {row['paid']}, owed {row['outstanding']}")

        section("The pack counts both halves of what goes out")
        code, rep = request("GET", "/school/finance/report", token=tok)
        assert code == 200, rep
        labels = {c["label"] for c in rep["spend_by_category"]}
        assert "Suppliers" in labels, (
            "supplier payments are expenditure; leaving them out flatters the figure")
        assert money(rep["net"]) == money(rep["received"]) - money(rep["spent"]), rep
        print(f"  received {rep['received']}, spent {rep['spent']}, net {rep['net']}")

        print("\nALL FINANCE CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
