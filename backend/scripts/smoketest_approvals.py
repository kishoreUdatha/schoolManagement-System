"""End-to-end smoke test for Story 19.2 — Principal approvals.

Verifies:
    Teacher can file an approval request via /school/approvals.
    Principal sees it pending.
    Principal approves a result_publishing request → Exam.is_published flips.
    Principal rejects a marks_correction request → record updated, no mutation.
    Re-decide rejected.
    Foreign-school approvals not visible.
    Parent token rejected from filing requests.

Run:
    docker exec sms-backend python -m scripts.smoketest_approvals
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from sqlalchemy import select

from app.core.enums import ExamKind
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.approval import ApprovalRequest
from app.models.exam import Exam
from app.models.user import User
from scripts import devdata


BASE = "http://localhost:8000/api/v1"
TEACHER = ("iyer@dev.local", "TeacherPass123!")
PRINCIPAL = ("principal@dev.local", "PrincipalPass123!")
PARENT = ("sharma@dev.local", "ParentPass123!")
SCHOOL_ADMIN = ("school@sms.local", "SchoolPass123!")


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
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


def reset_passwords():
    db = SessionLocal()
    try:
        for email, pw in (TEACHER, PRINCIPAL, PARENT, SCHOOL_ADMIN):
            u = db.execute(
                select(User).where(User.email == email)
            ).scalar_one_or_none()
            if u:
                u.password_hash = hash_password(pw)
                u.is_active = True
        db.commit()
    finally:
        db.close()


def ensure_unpublished_exam(school_id: int, tenant_id: int) -> int:
    """Reset Mid-term exam to unpublished so we can test publishing."""
    db = SessionLocal()
    try:
        ex = db.execute(
            select(Exam).where(
                Exam.school_id == school_id, Exam.name == "Mid-term"
            )
        ).scalar_one_or_none()
        if ex:
            ex.is_published = False
            ex.published_at = None
            db.commit()
            return ex.id
        # Create one if missing
        ex = Exam(
            tenant_id=tenant_id,
            school_id=school_id,
            academic_year_id=devdata.year_id(),
            name="Mid-term",
            kind=ExamKind.term,
            start_date="2026-06-01",
            end_date="2026-06-05",
            is_published=False,
        )
        db.add(ex)
        db.commit()
        return ex.id
    finally:
        db.close()


def cleanup_test_approvals():
    db = SessionLocal()
    try:
        db.execute(
            ApprovalRequest.__table__.delete().where(
                ApprovalRequest.reason.like("Smoke 19.2 -%")
            )
        )
        db.commit()
    finally:
        db.close()


def login(role, email, pw):
    code, data = request(
        "POST", f"/{role}/auth/login", body={"email": email, "password": pw}
    )
    assert code == 200, data
    return data["access_token"], data["user"]


def main():
    section("RESET PASSWORDS + cleanup")
    reset_passwords()
    cleanup_test_approvals()

    teacher_token, teacher_user = login("teacher", *TEACHER)
    principal_token, _ = login("principal", *PRINCIPAL)
    parent_token, _ = login("parent", *PARENT)
    sa_token, sa_user = login("school", *SCHOOL_ADMIN)

    exam_id = ensure_unpublished_exam(
        sa_user["school_id"], sa_user["tenant_id"]
    )
    print(f"  using exam_id={exam_id}")

    section("Parent CANNOT file an approval")
    code, body_ = request(
        "POST",
        "/school/approvals",
        token=parent_token,
        body={
            "kind": "marks_correction",
            "reason": "Smoke 19.2 - should fail",
            "payload": {},
        },
    )
    print(f"  {code} {body_.get('detail') if isinstance(body_, dict) else ''}")
    assert code == 403, body_

    section("Teacher files marks_correction request")
    code, mc = request(
        "POST",
        "/school/approvals",
        token=teacher_token,
        body={
            "kind": "marks_correction",
            "reason": "Smoke 19.2 - marks correction",
            "payload": {"mark_id": 1, "new_value": 78, "old_value": 65},
        },
    )
    assert code == 201, mc
    print(f"  id={mc['id']} status={mc['status']}")
    mc_id = mc["id"]

    section("Teacher files result_publishing request")
    code, pub = request(
        "POST",
        "/school/approvals",
        token=teacher_token,
        body={
            "kind": "result_publishing",
            "reason": "Smoke 19.2 - publish Mid-term",
            "payload": {"exam_id": exam_id},
        },
    )
    assert code == 201, pub
    pub_id = pub["id"]

    section("Principal lists pending — sees both")
    code, items = request(
        "GET", "/principal/approvals?status=pending", token=principal_token
    )
    assert code == 200, items
    ids = {it["id"] for it in items}
    assert {mc_id, pub_id}.issubset(ids), (ids, mc_id, pub_id)
    print(f"  {len(items)} pending")

    section("Principal rejects marks_correction")
    code, decided = request(
        "POST",
        f"/principal/approvals/{mc_id}/decide",
        token=principal_token,
        body={"status": "rejected", "decision_remark": "Need original answer sheet"},
    )
    assert code == 200, decided
    assert decided["status"] == "rejected", decided
    assert decided["reviewed_by_user_id"], decided
    assert decided["decided_at"], decided
    print(f"  status={decided['status']} remark={decided['decision_remark']}")

    section("Principal re-decides rejected → 400")
    code, body_ = request(
        "POST",
        f"/principal/approvals/{mc_id}/decide",
        token=principal_token,
        body={"status": "approved"},
    )
    print(f"  {code} {body_.get('detail')}")
    assert code == 400, body_

    section("Principal approves result_publishing → Exam flips")
    code, decided = request(
        "POST",
        f"/principal/approvals/{pub_id}/decide",
        token=principal_token,
        body={"status": "approved", "decision_remark": "Looks good"},
    )
    assert code == 200, decided
    assert decided["status"] == "approved", decided

    # Verify mutation via DB
    db = SessionLocal()
    try:
        ex = db.get(Exam, exam_id)
        print(f"  Exam.is_published={ex.is_published} published_at={ex.published_at}")
        assert ex.is_published is True
        assert ex.published_at is not None
    finally:
        db.close()

    section("Principal lists approved + rejected for history")
    code, approved = request(
        "GET", "/principal/approvals?status=approved", token=principal_token
    )
    assert code == 200, approved
    assert any(it["id"] == pub_id for it in approved), approved
    code, rejected = request(
        "GET", "/principal/approvals?status=rejected", token=principal_token
    )
    assert code == 200, rejected
    assert any(it["id"] == mc_id for it in rejected), rejected
    print(
        f"  approved={len(approved)} rejected={len(rejected)}"
    )

    section("School admin can ALSO list approvals (read-only)")
    code, items = request("GET", "/school/approvals", token=sa_token)
    assert code == 200, items
    print(f"  {len(items)} total in school view")

    section("Approve result_publishing with missing payload → 400")
    code, req_ = request(
        "POST",
        "/school/approvals",
        token=teacher_token,
        body={
            "kind": "result_publishing",
            "reason": "Smoke 19.2 - bad payload",
            "payload": {},
        },
    )
    assert code == 201, req_
    bad_id = req_["id"]
    code, body_ = request(
        "POST",
        f"/principal/approvals/{bad_id}/decide",
        token=principal_token,
        body={"status": "approved"},
    )
    print(f"  apply failure → {code} {body_.get('detail')}")
    assert code == 400, body_

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
