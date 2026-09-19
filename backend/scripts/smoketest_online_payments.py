"""End-to-end smoke test for online fee payment.

Verifies:
    Gateway settings: secrets are write-only; bad key format rejected.
    Test-mode checkout (no keys) → verify → fee paid, receipt PDF.
    Paying an already-paid fee is refused; wrong-child fees 404.
    Razorpay signature path (real HMAC with a test secret): bad signature → failed,
      good signature → paid.
    Webhook: bad signature 400; payment.captured applies an order the browser never
      confirmed; replay is idempotent.
    Same fee paid via two orders → second one records the excess for refund.

Run:
    docker exec sms-backend python -m scripts.smoketest_online_payments
"""
from __future__ import annotations

import hashlib
import hmac
import json
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.core import crypto
from app.core.enums import FeeStatus, OnlinePaymentStatus
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.fee import FeeHead, StudentFee
from app.models.online_payment import FeePaymentOrder, FeePaymentOrderItem, SchoolPaymentGateway
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
PARENT_PW = "ParentPass123!"
HEAD_CODE = "SMKPAY"
KEY_SECRET = "smoke_key_secret_123"
HOOK_SECRET = "smoke_hook_secret"


def request(method, path, *, token=None, body=None, raw=None, headers=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body_ = r.read()
            if r.headers.get("content-type", "").startswith("application/pdf"):
                return r.status, body_
            return r.status, json.loads(body_) if body_ else None
    except urllib.error.HTTPError as e:
        body_ = e.read()
        try:
            return e.code, json.loads(body_)
        except Exception:
            return e.code, {"raw": body_.decode(errors="ignore")}


def section(t):
    print(f"\n=== {t} ===")


def sign(secret, msg):
    return hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()


def cleanup():
    db = SessionLocal()
    try:
        fee_ids = select(StudentFee.id).where(
            StudentFee.fee_head_id.in_(select(FeeHead.id).where(FeeHead.code == HEAD_CODE))
        )
        order_ids = select(FeePaymentOrderItem.order_id).where(FeePaymentOrderItem.student_fee_id.in_(fee_ids))
        db.execute(FeePaymentOrder.__table__.delete().where(FeePaymentOrder.id.in_(order_ids)))
        db.execute(StudentFee.__table__.delete().where(StudentFee.id.in_(fee_ids)))
        db.execute(FeeHead.__table__.delete().where(FeeHead.code == HEAD_CODE))
        db.execute(SchoolPaymentGateway.__table__.delete().where(SchoolPaymentGateway.key_id == "rzp_test_SMOKE123"))
        db.commit()
    finally:
        db.close()


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        student, parent = db.execute(
            select(Student, User)
            .join(ParentStudent, ParentStudent.student_id == Student.id)
            .join(User, ParentStudent.parent_user_id == User.id)
            .where(Student.school_id == admin.school_id)
            .limit(1)
        ).first()
        parent.password_hash = hash_password(PARENT_PW)
        other = db.execute(
            select(Student).where(Student.school_id == admin.school_id, Student.id != student.id)
        ).scalars().first()
        head = FeeHead(tenant_id=admin.tenant_id, school_id=admin.school_id, name="Smoke Pay", code=HEAD_CODE, is_recurring=True)
        db.add(head)
        db.flush()
        fees = []
        for i, sid in enumerate([student.id] * 5 + ([other.id] if other else [])):
            sf = StudentFee(
                tenant_id=admin.tenant_id,
                school_id=admin.school_id,
                student_id=sid,
                fee_structure_id=None,
                source="smoke",
                source_id=i,
                fee_head_id=head.id,
                period=f"2031-{i + 1:02d}",
                amount_due=Decimal("1000.00") + i,
                amount_paid=Decimal("0"),
                due_date=date(2031, i + 1, 10),
                status=FeeStatus.pending,
            )
            db.add(sf)
            fees.append(sf)
        db.commit()
        return student.id, parent.email, admin.school_id, [f.id for f in fees]
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def fee(fid):
    db = SessionLocal()
    try:
        return db.get(StudentFee, fid)
    finally:
        db.close()


def main():
    section("RESET")
    cleanup()
    sid, parent_email, school_id, fees = setup()
    f1, f2, f3, f4, f5 = fees[:5]
    other_fee = fees[5] if len(fees) > 5 else None
    tok = login("school", *ADMIN)
    ptok = login("parent", parent_email, PARENT_PW)
    pay = f"/parent/me/children/{sid}/fees/pay"

    section("Gateway settings")
    code, gw = request("GET", "/school/payments/gateway", token=tok)
    assert code == 200 and gw["configured"] is False and gw["test_mode_available"], gw
    code, err = request("PUT", "/school/payments/gateway", token=tok, body={"key_id": "not-a-key", "key_secret": "x" * 10})
    assert code == 422, err

    section("Test-mode checkout")
    code, co = request("POST", pay, token=ptok, body={"fee_ids": [f1, f2]})
    assert code == 200 and co["provider"] == "mock" and co["amount_paise"] == 200100, co
    code, err = request(
        "POST",
        f"{pay}/verify",
        token=ptok,
        body={"razorpay_order_id": co["provider_order_id"], "razorpay_payment_id": "pay_x", "razorpay_signature": "wrong"},
    )
    assert code == 400, err
    code, co = request("POST", pay, token=ptok, body={"fee_ids": [f1, f2]})
    code, order = request(
        "POST",
        f"{pay}/verify",
        token=ptok,
        body={"razorpay_order_id": co["provider_order_id"], "razorpay_payment_id": "pay_mock1", "razorpay_signature": "mock-signature"},
    )
    assert code == 200 and order["status"] == "paid" and order["receipt_no"], order
    assert fee(f1).status == FeeStatus.paid and fee(f1).payment_mode == "online"
    code, pdf = request("GET", f"/parent/me/children/{sid}/payments/{order['id']}/receipt.pdf", token=ptok)
    assert code == 200 and pdf[:4] == b"%PDF", code
    code, pdf = request("GET", f"/school/payments/online/{order['id']}/receipt.pdf", token=tok)
    assert code == 200 and pdf[:4] == b"%PDF"
    print(f"  paid {order['amount']} as {order['receipt_no']}; receipts render")

    section("Guards")
    code, err = request("POST", pay, token=ptok, body={"fee_ids": [f1]})
    assert code == 400 and "already paid" in err["detail"], err
    if other_fee:
        code, err = request("POST", pay, token=ptok, body={"fee_ids": [other_fee]})
        assert code == 404, err

    section("Razorpay signature path")
    code, gw = request(
        "PUT",
        "/school/payments/gateway",
        token=tok,
        body={"key_id": "rzp_test_SMOKE123", "key_secret": KEY_SECRET, "webhook_secret": HOOK_SECRET},
    )
    assert code == 200 and gw["mode"] == "test" and gw["has_webhook_secret"], gw
    assert "key_secret" not in gw and KEY_SECRET not in json.dumps(gw)
    # Order creation would call api.razorpay.com; insert the order the gateway
    # would have returned instead, then exercise verify/webhook for real.
    db = SessionLocal()
    try:
        orders = {}
        for name, fid in (("sig", f3), ("hook", f4), ("dup_a", f5), ("dup_b", f5)):
            sf = db.get(StudentFee, fid)
            o = FeePaymentOrder(
                tenant_id=sf.tenant_id, school_id=sf.school_id, student_id=sid, parent_user_id=None,
                amount=sf.amount_due, currency="INR", provider="razorpay",
                provider_order_id=f"order_{uuid.uuid4().hex[:14]}", status=OnlinePaymentStatus.created,
            )
            db.add(o)
            db.flush()
            db.add(FeePaymentOrderItem(order_id=o.id, student_fee_id=fid, amount=sf.amount_due))
            orders[name] = o.provider_order_id
        db.commit()
    finally:
        db.close()
    code, err = request(
        "POST", f"{pay}/verify", token=ptok,
        body={"razorpay_order_id": orders["sig"], "razorpay_payment_id": "pay_A", "razorpay_signature": sign("wrong", "x")},
    )
    assert code == 400, err
    code, o = request(
        "POST", f"{pay}/verify", token=ptok,
        body={"razorpay_order_id": orders["sig"], "razorpay_payment_id": "pay_A", "razorpay_signature": sign(KEY_SECRET, f"{orders['sig']}|pay_A")},
    )
    assert code == 200 and o["status"] == "paid", o
    print("  forged signature rejected; genuine one accepted (even after a failed attempt)")

    section("Webhook")
    hook = f"/public/payments/razorpay/{school_id}/webhook"
    event = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {"id": "pay_W", "order_id": orders["hook"]}}}}).encode()
    code, err = request("POST", hook, raw=event, headers={"X-Razorpay-Signature": "bad"})
    assert code == 400, err
    good = {"X-Razorpay-Signature": sign(HOOK_SECRET, event.decode())}
    code, res = request("POST", hook, raw=event, headers=good)
    assert code == 200 and "applied" in res, res
    code, res = request("POST", hook, raw=event, headers=good)
    assert code == 200, res
    f4_row = fee(f4)
    assert f4_row.status == FeeStatus.paid and f4_row.amount_paid == f4_row.amount_due, f4_row.amount_paid
    print("  webhook applied once; replay harmless")

    section("Double payment → excess recorded")
    for name, pid in (("dup_a", "pay_D1"), ("dup_b", "pay_D2")):
        code, o = request(
            "POST", f"{pay}/verify", token=ptok,
            body={"razorpay_order_id": orders[name], "razorpay_payment_id": pid, "razorpay_signature": sign(KEY_SECRET, f"{orders[name]}|{pid}")},
        )
        assert code == 200, o
    assert Decimal(o["excess_amount"]) == Decimal(o["amount"]), o
    f5_row = fee(f5)
    assert f5_row.amount_paid == f5_row.amount_due, f5_row.amount_paid
    code, listing = request("GET", f"/school/payments/online?student_id={sid}&status=paid", token=tok)
    assert any(Decimal(x["excess_amount"]) > 0 for x in listing), listing
    print(f"  second payment flagged: excess {o['excess_amount']} to refund")

    cleanup()
    print("\nALL ONLINE PAYMENT CHECKS PASSED")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"\nFAILED: {e}")
        cleanup()
        sys.exit(1)
