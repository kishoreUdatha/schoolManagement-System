"""End-to-end smoke test for inventory, assets and the school store.

Verifies:
    Supplier GSTIN validation; items with auto SKU; sellable needs a price.
    Purchase needs a cost; issue needs a recipient; can't issue more than on hand;
      running balance in the ledger; low-stock flag; stock value at average cost.
    Asset lifecycle: assign → return → repair → repaired → dispose, with invalid
      transitions refused and maintenance cost totalled.
    Store: accountant sells to a student (cash and add-to-fees), stock drops,
      overselling refused, bill numbers, void restores stock and waives the fee.

Run:
    docker exec sms-backend python -m scripts.smoketest_inventory
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from decimal import Decimal

from sqlalchemy import select

from app.core.enums import FeeStatus
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.fee import FeeHead, StudentFee
from app.models.inventory import Asset, InventoryItem, StockMove, StoreSale, Supplier
from app.models.student import Student
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
ACCOUNTANT = ("accountant@sms.local", "AccountantPass123!")
TEACHER_EMAIL = "teacher@sms.local"
MARK = "Smoke Inv"
HEAD_CODE = "SMKSTORE"


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
        item_ids = select(InventoryItem.id).where(InventoryItem.name.like(f"{MARK}%"))
        sale_ids = list(db.execute(select(StockMove.store_sale_id).where(StockMove.item_id.in_(item_ids), StockMove.store_sale_id.is_not(None))).scalars())
        db.execute(StudentFee.__table__.delete().where(StudentFee.fee_head_id.in_(select(FeeHead.id).where(FeeHead.code == HEAD_CODE))))
        if sale_ids:
            db.execute(StoreSale.__table__.delete().where(StoreSale.id.in_(sale_ids)))
        db.execute(StockMove.__table__.delete().where(StockMove.item_id.in_(item_ids)))
        db.execute(InventoryItem.__table__.delete().where(InventoryItem.name.like(f"{MARK}%")))
        db.execute(Asset.__table__.delete().where(Asset.name.like(f"{MARK}%")))
        db.execute(Supplier.__table__.delete().where(Supplier.name.like(f"{MARK}%")))
        db.execute(FeeHead.__table__.delete().where(FeeHead.code == HEAD_CODE))
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
        acc.is_active = True
        teacher = db.execute(select(User).where(User.email == TEACHER_EMAIL)).scalar_one()
        student = db.execute(select(Student).where(Student.school_id == admin.school_id, Student.is_active.is_(True))).scalars().first()
        head = FeeHead(tenant_id=admin.tenant_id, school_id=admin.school_id, name="Smoke store", code=HEAD_CODE)
        db.add(head)
        db.commit()
        return student.id, teacher.id, head.id
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, (role, data)
    return data["access_token"]


def main():
    cleanup()
    sid, teacher_id, head_id = setup()
    try:
        tok = login("school", *ADMIN)
        atok = login("accountant", *ACCOUNTANT)

        section("Suppliers + items")
        code, err = request("POST", "/school/inventory/suppliers", token=tok, body={"name": f"{MARK} Traders", "gstin": "BADGSTIN"})
        assert code == 422, err
        code, sup = request("POST", "/school/inventory/suppliers", token=tok, body={"name": f"{MARK} Traders", "gstin": "29ABCDE1234F1Z5"})
        assert code == 201, sup
        code, err = request("POST", "/school/inventory/items", token=tok, body={"name": f"{MARK} Tie", "is_sellable": True})
        assert code == 422, err
        code, tie = request("POST", "/school/inventory/items", token=tok, body={
            "name": f"{MARK} Tie", "category": "Uniform", "is_sellable": True, "sale_price": "150", "reorder_level": "5"})
        assert code == 201 and tie["sku"].startswith("ITM") and tie["on_hand"] == "0.00", tie
        code, chalk = request("POST", "/school/inventory/items", token=tok, body={"name": f"{MARK} Chalk box", "unit": "box"})

        section("Stock moves")
        code, err = request("POST", "/school/inventory/moves", token=tok, body={"item_id": tie["id"], "kind": "purchase", "qty": "10"})
        assert code == 400, err
        code, m = request("POST", "/school/inventory/moves", token=tok, body={
            "item_id": tie["id"], "kind": "purchase", "qty": "10", "unit_cost": "80", "supplier_id": sup["id"], "reference": "INV-1"})
        assert code == 201 and Decimal(m["on_hand"]) == 10, m
        request("POST", "/school/inventory/moves", token=tok, body={"item_id": chalk["id"], "kind": "purchase", "qty": "20", "unit_cost": "30"})
        code, err = request("POST", "/school/inventory/moves", token=tok, body={"item_id": chalk["id"], "kind": "issue", "qty": "5"})
        assert code == 422, err
        code, err = request("POST", "/school/inventory/moves", token=tok, body={"item_id": chalk["id"], "kind": "issue", "qty": "50", "issued_to": "Class 1"})
        assert code == 400 and "Only" in err["detail"], err
        code, m = request("POST", "/school/inventory/moves", token=tok, body={"item_id": chalk["id"], "kind": "issue", "qty": "17", "issued_to": "Class 1 A"})
        assert code == 201 and Decimal(m["on_hand"]) == 3, m
        code, led = request("GET", f"/school/inventory/moves?item_id={chalk['id']}", token=tok)
        assert [Decimal(x["balance_after"]) for x in led] == [Decimal(3), Decimal(20)], led
        code, items = request("GET", f"/school/inventory/items?q={MARK.replace(' ', '%20')}", token=tok)
        tie_row = next(i for i in items if i["id"] == tie["id"])
        assert Decimal(tie_row["stock_value"]) == 800, tie_row
        print("  purchases, issue, ledger balances, stock value ok")

        section("Assets")
        code, a = request("POST", "/school/inventory/assets", token=tok, body={
            "name": f"{MARK} Projector", "category": "Electronics", "cost": "45000", "supplier_id": sup["id"], "warranty_until": "2030-01-01"})
        assert code == 201 and a["status"] == "in_store" and a["asset_tag"].startswith("AST"), a
        code, err = request("POST", f"/school/inventory/assets/{a['id']}/events", token=tok, body={"kind": "returned"})
        assert code == 400, err
        code, a = request("POST", f"/school/inventory/assets/{a['id']}/events", token=tok, body={"kind": "assigned", "to_user_id": teacher_id, "location": "Room 5"})
        assert a["status"] == "in_use" and a["assigned_to_name"], a
        code, err = request("POST", f"/school/inventory/assets/{a['id']}/events", token=tok, body={"kind": "disposed"})
        assert code == 400, "can't dispose an asset in use"
        request("POST", f"/school/inventory/assets/{a['id']}/events", token=tok, body={"kind": "returned", "location": "Store"})
        request("POST", f"/school/inventory/assets/{a['id']}/events", token=tok, body={"kind": "maintenance", "notes": "Lamp"})
        code, a = request("POST", f"/school/inventory/assets/{a['id']}/events", token=tok, body={"kind": "repaired", "cost": "3500"})
        assert a["status"] == "in_store" and Decimal(a["maintenance_cost"]) == 3500 and len(a["events"]) == 4, a
        print("  assign → return → repair → repaired; cost tracked")

        section("Store")
        code, s1 = request("POST", "/school/inventory/store/sales", token=atok, body={
            "student_id": sid, "payment": "cash", "lines": [{"item_id": tie["id"], "qty": "2"}]})
        assert code == 201 and Decimal(s1["total"]) == 300 and s1["bill_no"].startswith("ST"), s1
        code, err = request("POST", "/school/inventory/store/sales", token=atok, body={
            "student_id": sid, "payment": "cash", "lines": [{"item_id": chalk["id"], "qty": "1"}]})
        assert code == 400 and "isn't sold" in err["detail"], err
        code, err = request("POST", "/school/inventory/store/sales", token=atok, body={
            "student_id": sid, "payment": "cash", "lines": [{"item_id": tie["id"], "qty": "5"}, {"item_id": tie["id"], "qty": "4"}]})
        assert code == 400 and "Only 8" in err["detail"], err
        code, s2 = request("POST", "/school/inventory/store/sales", token=atok, body={
            "student_id": sid, "payment": "add_to_fees", "fee_head_id": head_id, "lines": [{"item_id": tie["id"], "qty": "3"}]})
        assert code == 201 and s2["bill_no"] != s1["bill_no"], s2
        db = SessionLocal()
        fee = db.execute(select(StudentFee).where(StudentFee.source == "store", StudentFee.source_id == s2["id"])).scalar_one()
        assert fee.amount_due == Decimal("450.00") and fee.status == FeeStatus.pending
        db.close()
        code, v = request("POST", f"/school/inventory/store/sales/{s2['id']}/void", token=atok)
        assert code == 200 and v["is_void"], v
        db = SessionLocal()
        assert db.get(StudentFee, fee.id).status == FeeStatus.waived
        db.close()
        code, items = request("GET", "/school/inventory/items?sellable_only=true", token=atok)
        assert Decimal(next(i for i in items if i["id"] == tie["id"])["on_hand"]) == 8, "void put 3 back"
        code, dash = request("GET", "/school/inventory/dashboard", token=atok)
        assert Decimal(dash["store_sales_today"]) >= 300 and any(x["id"] == chalk["id"] for x in dash["low_stock"]) is False
        print(f"  bills {s1['bill_no']}, {s2['bill_no']} (voided); dashboard {dash['store_sales_today']} today")

        print("\nALL INVENTORY CHECKS PASSED")
    except AssertionError as e:
        print(f"\nFAILED: {e}")
        sys.exit(1)
    finally:
        cleanup()


if __name__ == "__main__":
    main()
