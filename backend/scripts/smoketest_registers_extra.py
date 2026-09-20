"""Smoke test for the registers that were only reachable the long way round:
library fines, asset assignments, the health register, one receipt by id, and
the settings / integrations index.

Verifies:
    Fines can be listed with what is outstanding, read one at a time, and
    corrected while still owed — but never once collected or waived.
    Assignments pair an asset's "assigned" event with whatever ended it, so a
    handover shows as one spell rather than two loose events.
    The health register lists children with nothing on file, not just the ones
    with alerts, and a receipt can be fetched by its id.

Run:
    docker exec sms-backend python -m scripts.smoketest_registers_extra
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
from app.models.inventory import Asset, AssetEvent
from app.models.library import Book, BookCopy, Loan
from app.models.student import Student
from app.models.user import User
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-REG2"


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
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
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
        assets = select(Asset.id).where(Asset.name.like(f"{TAG}%"))
        db.execute(AssetEvent.__table__.delete().where(AssetEvent.asset_id.in_(assets)))
        db.execute(Asset.__table__.delete().where(Asset.name.like(f"{TAG}%")))
        db.commit()
    finally:
        db.close()


def overdue_loan(tok, student_id: int) -> int:
    """Issue a book and backdate it so a fine is due on return."""
    code, book = request("POST", "/school/library/books", token=tok, body={
        "title": f"{TAG} The Overdue Book", "authors": "A. Late", "category": "Fiction", "copies": 1})
    assert code == 201, book
    accession = book["copies"][0]["accession_no"]
    code, loan = request("POST", "/school/library/loans", token=tok, body={
        "accession_no": accession, "borrower_type": "student", "student_id": student_id})
    assert code == 201, loan
    db = SessionLocal()
    try:
        row = db.get(Loan, loan["id"])
        row.issued_on = date.today() - timedelta(days=40)
        row.due_on = date.today() - timedelta(days=26)
        db.commit()
    finally:
        db.close()
    code, returned = request("POST", f"/school/library/loans/{loan['id']}/return", token=tok, body={})
    assert code == 200, returned
    return loan["id"]


def main():
    cleanup()
    tok = login()
    student_id = devdata.child_id()
    ids = devdata.school()
    try:
        section("Library fines as a register")
        loan_id = overdue_loan(tok, student_id)
        code, summary = request("GET", "/school/library/fines", token=tok)
        assert code == 200, summary
        mine = next(f for f in summary["fines"] if f["loan_id"] == loan_id)
        assert mine["status"] == "pending" and float(mine["amount"]) > 0, mine
        assert float(summary["pending_amount"]) >= float(mine["amount"]), summary["pending_amount"]
        assert mine["overdue_days"] == 26, mine
        code, one = request("GET", f"/school/library/fines/{loan_id}", token=tok)
        assert code == 200 and one["title"].startswith(TAG), one
        print(f"  {summary['pending']} pending, {summary['pending_amount']} outstanding; this one {mine['amount']}")

        section("Correcting a fine")
        code, fixed = request("PATCH", f"/school/library/fines/{loan_id}", token=tok,
                              body={"amount": "15.00", "note": f"{TAG} capped by the librarian"})
        assert code == 200 and float(fixed["amount"]) == 15.0 and fixed["note"].endswith("librarian"), fixed
        code, filtered = request("GET", "/school/library/fines?status=pending", token=tok)
        assert any(f["loan_id"] == loan_id for f in filtered["fines"]), "still pending"
        code, settled = request("POST", f"/school/library/loans/{loan_id}/fine", token=tok,
                                body={"action": "waived", "note": "Smoke"})
        assert code == 200, settled
        code, err = request("PATCH", f"/school/library/fines/{loan_id}", token=tok, body={"amount": "1"})
        assert code == 400 and "waived" in err["detail"], err
        code, after = request("GET", f"/school/library/fines/{loan_id}", token=tok)
        assert after["status"] == "waived" and float(after["amount"]) == 15.0, after
        print("  corrected while owed, frozen once waived")

        section("Asset assignments")
        code, asset = request("POST", "/school/inventory/assets", token=tok, body={
            "asset_tag": f"{TAG}-1", "name": f"{TAG} Staff laptop", "status": "in_store"})
        assert code == 201, asset
        teacher = devdata.user_id(devdata.TEACHER_EMAIL)
        other = devdata.user_id("principal@dev.local")
        for kind, who, when in (
            ("assigned", teacher, date.today() - timedelta(days=30)),
            ("returned", None, date.today() - timedelta(days=20)),
            ("assigned", other, date.today() - timedelta(days=10)),
        ):
            body = {"kind": kind, "happened_on": str(when)}
            if who:
                body["to_user_id"] = who
            code, res = request("POST", f"/school/inventory/assets/{asset['id']}/events", token=tok, body=body)
            assert code == 200, res
        code, rows = request("GET", f"/school/inventory/assignments?asset_id={asset['id']}", token=tok)
        assert code == 200 and len(rows) == 2, rows
        current = next(r for r in rows if r["returned_on"] is None)
        past = next(r for r in rows if r["returned_on"] is not None)
        assert current["user_id"] == other and past["user_id"] == teacher, rows
        assert past["ended_by"] == "returned", past
        code, open_only = request("GET", "/school/inventory/assignments?open_only=true", token=tok)
        assert all(r["returned_on"] is None for r in open_only), "open only means still out"
        code, mine_only = request(f"GET", f"/school/inventory/assignments?user_id={teacher}", token=tok)
        assert all(r["user_id"] == teacher for r in mine_only), mine_only
        code, single = request("GET", f"/school/inventory/assignments/{current['event_id']}", token=tok)
        assert code == 200 and single["asset_tag"] == f"{TAG}-1", single
        print(f"  two spells on one laptop: {past['user_name']} returned it, {current['user_name']} has it now")

        section("Health register")
        code, roster = request("GET", "/school/health/profiles", token=tok)
        assert code == 200 and len(roster) >= 5, len(roster)
        assert any(not r["has_profile"] for r in roster), "children with nothing on file still show"
        code, saved = request("PUT", f"/school/health/students/{student_id}/profile", token=tok,
                              body={"allergies": "Peanuts", "emergency_contact_phone": "9800000000"})
        assert code == 200, saved
        code, roster = request("GET", "/school/health/profiles", token=tok)
        row = next(r for r in roster if r["student_id"] == student_id)
        assert row["has_profile"] and "allergies" in row["flags"], row
        code, only = request("GET", "/school/health/profiles?with_profile_only=true", token=tok)
        assert all(r["has_profile"] for r in only) and len(only) < len(roster), (len(only), len(roster))
        code, found = request("GET", f"/school/health/profiles?search={row['admission_no']}", token=tok)
        assert len(found) == 1 and found[0]["student_id"] == student_id, found
        print(f"  {len(roster)} children on the register, {len(only)} with anything recorded")

        section("A receipt by its id")
        code, fees = request("GET", f"/school/fees/student-fees?student_id={student_id}", token=tok)
        assert code == 200, fees
        pending = next((f for f in fees["items"] if f["status"] in ("pending", "partial")), None)
        if pending:
            code, paid = request("POST", f"/school/fees/student-fees/{pending['id']}/record-payment", token=tok,
                                 body={"amount_paid": "1", "payment_mode": "cash", "payment_ref": TAG})
            assert code in (200, 201), paid
        code, collections = request("GET", "/school/accounts/collections", token=tok)
        if collections:
            first = collections[0]
            code, one = request("GET", f"/school/accounts/collections/{first['id']}", token=tok)
            assert code == 200 and one["receipt_no"] == first["receipt_no"], one
            code, _ = request("GET", "/school/accounts/collections/99999999", token=tok)
            assert code == 404, "an unknown receipt is a 404"
            print(f"  receipt {one['receipt_no']} fetched by id; an unknown id is a 404")
        else:
            print("  (no receipts in this database — skipped)")

        section("Settings and integrations in one place")
        code, areas = request("GET", "/school/settings", token=tok)
        assert code == 200 and len(areas) >= 5, areas
        keys = {a["key"] for a in areas}
        assert {"school_profile", "library", "payroll", "report_cards"} <= keys, keys
        assert all(a["read"].startswith("GET ") for a in areas), areas
        code, integrations = request("GET", "/school/integrations", token=tok)
        assert code == 200, integrations
        razorpay = next(i for i in integrations if i["key"] == "razorpay")
        assert razorpay["purpose"] and isinstance(razorpay["enabled"], bool), razorpay
        print(f"  {len(areas)} settings areas, {len(integrations)} integrations listed")

        print("\nALL REGISTER CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
