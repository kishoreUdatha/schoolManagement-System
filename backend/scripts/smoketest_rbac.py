"""End-to-end smoke test for roles, permissions and branches.

Verifies:
    The permission catalogue is seeded and built-in roles appear per school.
    A custom role grants a real ability: a plain staff member can't approve a
    fee refund until given a role carrying fees.refund.approve, and loses it
    again when the role is taken away.
    Built-in roles can't be deleted or renamed; a role in use can't be deleted;
    duplicate codes and unknown permissions are refused.
    Branches: unique codes, one main branch, sections and staff assigned,
    counts reported, and a branch in use can't be deleted.

Run:
    docker exec sms-backend python -m scripts.smoketest_rbac
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.core.enums import FeeStatus, UserRole
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import Section
from app.models.fee import FeeHead, StudentFee
from app.models.fee_extra import Refund
from app.models.rbac import Branch, Permission, Role, RolePermission, UserRoleAssignment
from app.models.staff import Staff
from app.models.student import Student
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
CLERK = ("smoke.rbac.clerk@dev.local", "ClerkPass123!")
HEAD = "SMKRBAC"


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


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        clerk = User(tenant_id=admin.tenant_id, school_id=admin.school_id, full_name="Smoke RBAC Clerk",
                     email=CLERK[0], password_hash=hash_password(CLERK[1]), role=UserRole.staff, is_active=True)
        db.add(clerk)
        student = db.execute(
            select(Student).where(Student.school_id == admin.school_id, Student.is_active.is_(True)).limit(1)
        ).scalar_one()
        head = FeeHead(tenant_id=admin.tenant_id, school_id=admin.school_id, name="Smoke RBAC Fee", code=HEAD, is_active=True)
        db.add(head)
        db.flush()
        fee = StudentFee(tenant_id=admin.tenant_id, school_id=admin.school_id, student_id=student.id,
                         fee_head_id=head.id, period="2099-09", amount_due=Decimal("1000.00"),
                         amount_paid=Decimal("1000.00"), due_date=date.today(), status=FeeStatus.paid,
                         source="smoke_rbac", source_id=990001)
        db.add(fee)
        sec = db.get(Section, student.section_id)
        staff_row = db.execute(select(Staff).where(Staff.school_id == admin.school_id).limit(1)).scalar_one_or_none()
        db.commit()
        return dict(clerk_id=clerk.id, student_id=student.id, fee_id=fee.id, section_id=sec.id,
                    staff_id=staff_row.id if staff_row else None)
    finally:
        db.close()


def cleanup():
    db = SessionLocal()
    try:
        heads = select(FeeHead.id).where(FeeHead.code == HEAD)
        fees = select(StudentFee.id).where(StudentFee.fee_head_id.in_(heads))
        db.execute(Refund.__table__.delete().where(Refund.student_fee_id.in_(fees)))
        db.execute(Refund.__table__.delete().where(Refund.reason.like("Smoke RBAC%")))
        db.execute(StudentFee.__table__.delete().where(StudentFee.fee_head_id.in_(heads)))
        db.execute(FeeHead.__table__.delete().where(FeeHead.code == HEAD))
        users = select(User.id).where(User.email == CLERK[0])
        db.execute(UserRoleAssignment.__table__.delete().where(UserRoleAssignment.user_id.in_(users)))
        db.execute(User.__table__.delete().where(User.email == CLERK[0]))
        roles = select(Role.id).where(Role.code.like("smoke_%"))
        db.execute(UserRoleAssignment.__table__.delete().where(UserRoleAssignment.role_id.in_(roles)))
        db.execute(RolePermission.__table__.delete().where(RolePermission.role_id.in_(roles)))
        db.execute(Role.__table__.delete().where(Role.code.like("smoke_%")))
        branches = select(Branch.id).where(Branch.code.like("SMK%"))
        db.execute(Section.__table__.update().where(Section.branch_id.in_(branches)).values(branch_id=None))
        db.execute(Staff.__table__.update().where(Staff.branch_id.in_(branches)).values(branch_id=None))
        db.execute(UserRoleAssignment.__table__.update().where(UserRoleAssignment.branch_id.in_(branches)).values(branch_id=None))
        db.execute(Branch.__table__.delete().where(Branch.code.like("SMK%")))
        db.commit()
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def main():
    cleanup()
    ctx = setup()
    try:
        tok = login("school", *ADMIN)
        ctok = login("staff", *CLERK)

        section("Catalogue and built-in roles")
        code, perms = request("GET", "/school/permissions", token=tok)
        assert code == 200 and any(p["code"] == "fees.refund.approve" for p in perms), perms[:2]
        modules = {p["module"] for p in perms}
        assert len(perms) >= 30 and "Fees" in modules, (len(perms), modules)
        code, roles = request("GET", "/school/roles", token=tok)
        codes = {r["code"] for r in roles}
        assert {"school_admin", "principal", "teacher", "accountant", "staff"} <= codes, codes
        admin_role = next(r for r in roles if r["code"] == "school_admin")
        assert admin_role["is_system"] and len(admin_role["permissions"]) == len(perms), "admin has everything"
        code, err = request("DELETE", f"/school/roles/{admin_role['id']}", token=tok)
        assert code == 400 and "Built-in" in err["detail"], err
        print(f"  {len(perms)} permissions across {len(modules)} modules; {len(roles)} built-in roles")

        section("A clerk gains an ability")
        code, mine = request("GET", "/school/me/access", token=ctok)
        assert code == 200 and "fees.refund.approve" not in mine["permissions"], mine
        code, r = request("POST", "/school/fees/refunds", token=tok, body={
            "student_id": ctx["student_id"], "student_fee_id": ctx["fee_id"], "amount": "100",
            "reason": "Smoke RBAC overpaid"})
        assert code == 201, r
        code, err = request("POST", f"/school/fees/refunds/{r['id']}/decide", token=ctok, body={"approve": True})
        assert code == 403, err
        code, err = request("GET", "/school/roles", token=ctok)
        assert code == 403, "a clerk can't manage roles either"
        code, err = request("POST", "/school/roles", token=tok, body={
            "name": "Smoke Bad", "code": "smoke_bad", "permissions": ["fees.does_not_exist"]})
        assert code == 400 and "Unknown permission" in err["detail"], err
        code, role = request("POST", "/school/roles", token=tok, body={
            "name": "Smoke Finance Approver", "code": "smoke_fin", "base_role": "staff",
            "description": "Office staff who may approve refunds",
            "permissions": ["fees.refund.approve", "fees.collect"]})
        assert code == 201 and role["users"] == 0, role
        code, err = request("POST", "/school/roles", token=tok, body={
            "name": "Dup", "code": "smoke_fin", "permissions": []})
        assert code == 400, err
        code, asg = request("POST", "/school/role-assignments", token=tok,
                            body={"user_id": ctx["clerk_id"], "role_id": role["id"]})
        assert code == 201 and asg[0]["role_name"] == "Smoke Finance Approver", asg
        code, err = request("POST", "/school/role-assignments", token=tok,
                            body={"user_id": ctx["clerk_id"], "role_id": role["id"]})
        assert code == 400, "no duplicate assignment"
        code, mine = request("GET", "/school/me/access", token=ctok)
        assert "fees.refund.approve" in mine["permissions"] and mine["roles"] == ["Smoke Finance Approver"], mine
        code, ok = request("POST", f"/school/fees/refunds/{r['id']}/decide", token=ctok,
                           body={"approve": True, "note": "Smoke RBAC fine"})
        assert code == 200 and ok["status"] == "approved", ok
        print("  clerk refused, given the role, then approved the refund")

        section("Taking it away")
        code, err = request("DELETE", f"/school/roles/{role['id']}", token=tok)
        assert code == 400 and "still have this role" in err["detail"], err
        code, _ = request("DELETE", f"/school/role-assignments/{asg[0]['id']}", token=tok)
        assert code == 204
        code, mine = request("GET", "/school/me/access", token=ctok)
        assert "fees.refund.approve" not in mine["permissions"], mine
        code, r2 = request("POST", "/school/fees/refunds", token=tok, body={
            "student_id": ctx["student_id"], "student_fee_id": ctx["fee_id"], "amount": "50",
            "reason": "Smoke RBAC second"})
        code, err = request("POST", f"/school/fees/refunds/{r2['id']}/decide", token=ctok, body={"approve": True})
        assert code == 403, err
        code, _ = request("DELETE", f"/school/roles/{role['id']}", token=tok)
        assert code == 204, "unused role can go"
        print("  role removed -> the ability goes with it; unused role deleted")

        section("Branches")
        code, b = request("POST", "/school/branches", token=tok, body={
            "name": "Smoke Main Campus", "code": "SMKMAIN", "address": "1 Smoke Road", "is_main": True})
        assert code == 201 and b["is_main"], b
        code, err = request("POST", "/school/branches", token=tok, body={"name": "Dup", "code": "SMKMAIN"})
        assert code == 400, err
        code, b2 = request("POST", "/school/branches", token=tok, body={
            "name": "Smoke Junior Wing", "code": "SMKJR", "is_main": True})
        assert b2["is_main"], b2
        code, all_ = request("GET", "/school/branches", token=tok)
        mains = [x for x in all_ if x["is_main"]]
        assert len(mains) == 1 and mains[0]["code"] == "SMKJR", "only one main branch"
        code, withsec = request("PUT", f"/school/branches/{b['id']}/sections", token=tok, body={"ids": [ctx["section_id"]]})
        assert withsec["sections"] == 1 and withsec["students"] >= 1, withsec
        if ctx["staff_id"]:
            code, withstaff = request("PUT", f"/school/branches/{b['id']}/staff", token=tok, body={"ids": [ctx["staff_id"]]})
            assert withstaff["staff"] == 1, withstaff
        code, err = request("DELETE", f"/school/branches/{b['id']}", token=tok)
        assert code == 400 and "still belong" in err["detail"], err
        code, cleared = request("PUT", f"/school/branches/{b['id']}/sections", token=tok, body={"ids": []})
        assert cleared["sections"] == 0, cleared
        if ctx["staff_id"]:
            request("PUT", f"/school/branches/{b['id']}/staff", token=tok, body={"ids": []})
        code, _ = request("DELETE", f"/school/branches/{b['id']}", token=tok)
        assert code == 204
        print("  one main branch, sections/staff assigned with counts, in-use branch protected")

        print("\nALL ROLE / PERMISSION / BRANCH CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
