"""End-to-end smoke test for late-fee rules and fee refunds.

Verifies:
    Late fees: per-day charge after grace days, capped by max; preview matches
      apply; re-running updates instead of duplicating; the charge lands as its
      own fee line under the late-fee head and never charges itself.
    Refunds: only what was actually paid can be refunded; approval needed
      before payout; rejection needs a note; processing reduces the fee's paid
      amount, reopens a paid fee, notifies the parent and shows in the cash book.

Run:
    docker exec sms-backend python -m scripts.smoketest_fee_extras
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select

from app.core.enums import FeeStatus
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.accounts import FeeCollection
from app.models.fee import FeeHead, StudentFee
from app.models.fee_extra import LateFeeRule, Refund
from app.models.notice import Notice, NoticeRecipient
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TUITION = "SMKLFT"   # head the overdue fee sits under
LATE = "SMKLFL"      # head late fees are booked under


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


def setup(overdue_on: date):
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        student, parent_id = db.execute(
            select(Student, ParentStudent.parent_user_id)
            .join(ParentStudent, ParentStudent.student_id == Student.id)
            .where(Student.school_id == admin.school_id, Student.is_active.is_(True)).limit(1)
        ).first()
        heads = {}
        for code, name in ((TUITION, "Smoke Late Tuition"), (LATE, "Smoke Late Fee")):
            h = FeeHead(tenant_id=admin.tenant_id, school_id=admin.school_id, name=name, code=code, is_active=True)
            db.add(h)
            heads[code] = h
        db.flush()
        overdue = StudentFee(tenant_id=admin.tenant_id, school_id=admin.school_id, student_id=student.id,
                             fee_head_id=heads[TUITION].id, period="2099-01", amount_due=Decimal("1000.00"),
                             amount_paid=Decimal("0.00"), due_date=overdue_on, status=FeeStatus.pending,
                             source="smoke", source_id=999001)
        paid = StudentFee(tenant_id=admin.tenant_id, school_id=admin.school_id, student_id=student.id,
                          fee_head_id=heads[TUITION].id, period="2099-02", amount_due=Decimal("500.00"),
                          amount_paid=Decimal("500.00"), due_date=overdue_on, status=FeeStatus.paid,
                          source="smoke", source_id=999002)
        db.add_all([overdue, paid])
        db.commit()
        return dict(sid=student.id, parent_id=parent_id, overdue=overdue.id, paid=paid.id,
                    tuition_head=heads[TUITION].id, late_head=heads[LATE].id)
    finally:
        db.close()


def cleanup():
    db = SessionLocal()
    try:
        heads = select(FeeHead.id).where(FeeHead.code.in_((TUITION, LATE)))
        fees = select(StudentFee.id).where(StudentFee.fee_head_id.in_(heads))
        db.execute(Refund.__table__.delete().where(Refund.student_fee_id.in_(fees)))
        db.execute(Refund.__table__.delete().where(Refund.reason.like("Smoke%")))
        db.execute(FeeCollection.__table__.delete().where(FeeCollection.student_fee_id.in_(fees)))
        db.execute(StudentFee.__table__.delete().where(StudentFee.fee_head_id.in_(heads)))
        db.execute(LateFeeRule.__table__.delete().where(LateFeeRule.name.like("Smoke%")))
        db.execute(FeeHead.__table__.delete().where(FeeHead.code.in_((TUITION, LATE))))
        db.execute(Notice.__table__.delete().where(Notice.title.like("%Late fee%") | Notice.title.like("%refund%")))
        db.commit()
    finally:
        db.close()


def fee_row(fee_id):
    db = SessionLocal()
    try:
        f = db.get(StudentFee, fee_id)
        return (f.amount_paid, f.status.value) if f else None
    finally:
        db.close()


def late_fee_rows(student_id):
    db = SessionLocal()
    try:
        return [(f.amount_due, f.fee_head_id, f.status.value) for f in db.execute(
            select(StudentFee).where(StudentFee.student_id == student_id, StudentFee.source == "late_fee")
        ).scalars()]
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
    today = date.today()
    due = today - timedelta(days=15)
    ctx = setup(due)
    try:
        tok = login("school", *ADMIN)

        section("Late fee rules")
        code, err = request("POST", "/school/fees/late-fee-rules", token=tok, body={
            "name": "Smoke same head", "fee_head_id": ctx["late_head"], "charge_head_id": ctx["late_head"],
            "basis": "per_day", "amount": "10"})
        assert code == 400, err
        code, err = request("POST", "/school/fees/late-fee-rules", token=tok, body={
            "name": "Smoke bad pct", "charge_head_id": ctx["late_head"], "basis": "percent_per_month", "amount": "150"})
        assert code == 422, err
        code, rule = request("POST", "/school/fees/late-fee-rules", token=tok, body={
            "name": "Smoke per-day", "fee_head_id": ctx["tuition_head"], "charge_head_id": ctx["late_head"],
            "basis": "per_day", "amount": "10", "grace_days": 5, "max_amount": "80"})
        assert code == 201 and rule["charge_head_name"] == "Smoke Late Fee", rule
        print("  rule: ₹10/day after 5 grace days, capped at ₹80")

        section("Preview and apply")
        code, prev = request("GET", "/school/fees/late-fees/preview", token=tok)
        row = next(r for r in prev["rows"] if r["student_fee_id"] == ctx["overdue"])
        # 15 days late - 5 grace = 10 days x 10 = 100, capped at 80
        assert row["days_late"] == 15 and row["charge"] == "80.00" and row["already_charged"] == "0.00", row
        assert not any(r["student_fee_id"] == ctx["paid"] for r in prev["rows"]), "paid fees aren't charged"
        before = notices_for(ctx["parent_id"], "%Late fee%")
        code, res = request("POST", "/school/fees/late-fees/apply", token=tok, body={"notify_parents": True})
        assert code == 200 and res["created"] == 1, res
        assert notices_for(ctx["parent_id"], "%Late fee%") == before + 1, "parent told"
        rows = late_fee_rows(ctx["sid"])
        assert rows == [(Decimal("80.00"), ctx["late_head"], "pending")], rows
        code, res = request("POST", "/school/fees/late-fees/apply", token=tok)
        assert res["created"] == 0 and res["updated"] == 0, "second run is a no-op"
        assert len(late_fee_rows(ctx["sid"])) == 1, "no duplicate charge"
        code, prev2 = request("GET", "/school/fees/late-fees/preview", token=tok)
        assert not any(r["student_fee_id"] and r["head_name"] == "Smoke Late Fee" for r in prev2["rows"]), "late fees don't fine themselves"
        print("  ₹80 charged once under its own head; re-running changes nothing")

        section("Refunds")
        code, opts = request("GET", f"/school/fees/refunds/options/{ctx['sid']}", token=tok)
        opt = next(o for o in opts if o["student_fee_id"] == ctx["paid"])
        assert opt["refundable"] == "500.00", opt
        code, err = request("POST", "/school/fees/refunds", token=tok, body={
            "student_id": ctx["sid"], "student_fee_id": ctx["paid"], "amount": "600", "reason": "Smoke too much"})
        assert code == 400 and "500" in err["detail"], err
        code, hold = request("POST", "/school/fees/refunds", token=tok, body={
            "student_id": ctx["sid"], "student_fee_id": ctx["paid"], "amount": "500", "reason": "Smoke reserved"})
        code, opts = request("GET", f"/school/fees/refunds/options/{ctx['sid']}", token=tok)
        assert not any(o["student_fee_id"] == ctx["paid"] for o in opts), "an open request reserves the money"
        request("POST", f"/school/fees/refunds/{hold['id']}/decide", token=tok, body={"approve": False, "note": "Smoke drop"})
        code, r = request("POST", "/school/fees/refunds", token=tok, body={
            "student_id": ctx["sid"], "student_fee_id": ctx["paid"], "amount": "200", "reason": "Smoke overpaid", "mode": "upi"})
        assert code == 201 and r["status"] == "requested" and r["fee_label"].startswith("Smoke Late Tuition"), r
        code, err = request("POST", f"/school/fees/refunds/{r['id']}/process", token=tok, body={"processed_on": str(today)})
        assert code == 400, err
        code, err = request("POST", f"/school/fees/refunds/{r['id']}/decide", token=tok, body={"approve": False})
        assert code == 400, err
        code, a = request("POST", f"/school/fees/refunds/{r['id']}/decide", token=tok, body={"approve": True, "note": "Smoke ok"})
        assert code == 200 and a["status"] == "approved" and a["decided_by_name"], a
        code, err = request("POST", f"/school/fees/refunds/{r['id']}/process", token=tok,
                            body={"processed_on": str(today + timedelta(days=2))})
        assert code == 400, err
        before = notices_for(ctx["parent_id"], "%refund%")
        code, p = request("POST", f"/school/fees/refunds/{r['id']}/process", token=tok,
                          body={"processed_on": str(today), "reference": "UPI123"})
        assert code == 200 and p["status"] == "processed", p
        assert notices_for(ctx["parent_id"], "%refund%") == before + 1
        assert fee_row(ctx["paid"]) == (Decimal("300.00"), "pending"), fee_row(ctx["paid"])
        code, opts = request("GET", f"/school/fees/refunds/options/{ctx['sid']}", token=tok)
        assert next(o for o in opts if o["student_fee_id"] == ctx["paid"])["refundable"] == "300.00", opts
        code, err = request("POST", f"/school/fees/refunds/{r['id']}/decide", token=tok, body={"approve": True})
        assert code == 400, "already decided"
        print("  200 refunded: fee back to pending with 300 paid, parent notified")

        section("Cash book")
        code, cb = request("GET", f"/school/accounts/cash-book?frm={today}&to={today}", token=tok)
        if code != 200:
            code, cb = request("GET", f"/school/accounts/cash-book?from={today}&to={today}", token=tok)
        assert code == 200, cb
        assert Decimal(cb["expenses"]["refunds"]) >= Decimal("200.00"), cb["expenses"]
        print(f"  cash book shows refunds {cb['expenses']['refunds']} as an outflow")

        print("\nALL LATE FEE / REFUND CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
