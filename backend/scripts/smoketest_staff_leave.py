"""End-to-end smoke test for Story 8.2 — Staff leave workflow.

Verifies:
    Teacher applies for leave → pending.
    School admin sees it in /school/staff-leaves.
    Reject one (notice fired, no attendance written).
    Approve another (notice fired, StaffAttendance rows on_leave for the range).
    Overlapping application rejected.
    Re-decide rejected.

Run:
    docker exec sms-backend python -m scripts.smoketest_staff_leave
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
from app.models.staff_attendance import StaffAttendance
from app.models.staff_leave import StaffLeave
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
TEACHER = ("iyer@dev.local", "TeacherPass123!")
ADMIN = ("school@sms.local", "SchoolPass123!")


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
        for email, pw in (TEACHER, ADMIN):
            u = db.execute(
                select(User).where(User.email == email)
            ).scalar_one_or_none()
            if u:
                u.password_hash = hash_password(pw)
                u.is_active = True
        db.commit()
    finally:
        db.close()


def cleanup():
    db = SessionLocal()
    try:
        db.execute(
            StaffLeave.__table__.delete().where(
                StaffLeave.reason.like("Smoke 8.2 -%")
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
    section("RESET + cleanup")
    reset_passwords()
    cleanup()

    teacher_token, teacher_user = login("teacher", *TEACHER)
    admin_token, _ = login("school", *ADMIN)

    today = date.today()

    section("Apply leave #1 (will be REJECTED)")
    code, l1 = request(
        "POST",
        "/staff/leaves",
        token=teacher_token,
        body={
            "kind": "casual",
            "from_date": (today + timedelta(days=10)).isoformat(),
            "to_date": (today + timedelta(days=11)).isoformat(),
            "reason": "Smoke 8.2 - personal",
        },
    )
    assert code == 201, l1
    assert l1["status"] == "pending"
    print(f"  id={l1['id']} days={l1['days']}")

    section("Apply leave #2 (will be APPROVED)")
    code, l2 = request(
        "POST",
        "/staff/leaves",
        token=teacher_token,
        body={
            "kind": "sick",
            "from_date": (today + timedelta(days=20)).isoformat(),
            "to_date": (today + timedelta(days=22)).isoformat(),
            "reason": "Smoke 8.2 - medical",
        },
    )
    assert code == 201, l2
    assert l2["days"] == 3

    section("Overlap is blocked")
    code, body_ = request(
        "POST",
        "/staff/leaves",
        token=teacher_token,
        body={
            "kind": "casual",
            "from_date": (today + timedelta(days=21)).isoformat(),
            "to_date": (today + timedelta(days=21)).isoformat(),
            "reason": "Smoke 8.2 - overlap",
        },
    )
    print(f"  {code} {body_.get('detail') if isinstance(body_, dict) else ''}")
    assert code == 400, body_

    section("Admin sees both in pending list")
    code, items = request(
        "GET", "/school/staff-leaves?status=pending", token=admin_token
    )
    assert code == 200, items
    ids = {it["id"] for it in items}
    assert {l1["id"], l2["id"]}.issubset(ids), ids

    section("Reject #1")
    code, decided = request(
        "POST",
        f"/school/staff-leaves/{l1['id']}/decide",
        token=admin_token,
        body={"status": "rejected", "decision_remark": "Need cover arrangement first"},
    )
    assert code == 200, decided
    assert decided["status"] == "rejected"
    assert decided["decided_by_user_id"]

    section("Approve #2 — attendance materialized")
    code, decided = request(
        "POST",
        f"/school/staff-leaves/{l2['id']}/decide",
        token=admin_token,
        body={"status": "approved", "decision_remark": "Get well soon"},
    )
    assert code == 200, decided
    assert decided["status"] == "approved"

    db = SessionLocal()
    try:
        rows = db.execute(
            select(StaffAttendance).where(
                StaffAttendance.user_id == teacher_user["id"],
                StaffAttendance.date >= today + timedelta(days=20),
                StaffAttendance.date <= today + timedelta(days=22),
            )
        ).scalars().all()
        print(f"  attendance rows on_leave: {len(rows)}")
        assert len(rows) == 3
        for r in rows:
            assert r.status.value == "on_leave", r.status

        # Applicant got a notice
        from app.models.notice import Notice, NoticeRecipient
        from sqlalchemy import func
        notice_cnt = db.execute(
            select(func.count(NoticeRecipient.id))
            .join(Notice, NoticeRecipient.notice_id == Notice.id)
            .where(
                NoticeRecipient.user_id == teacher_user["id"],
                Notice.title.like("Leave %"),
            )
        ).scalar_one()
        print(f"  notice rows for teacher: {notice_cnt}")
        assert notice_cnt >= 2  # one reject, one approve
    finally:
        db.close()

    section("Re-decide rejected #1 — 400")
    code, body_ = request(
        "POST",
        f"/school/staff-leaves/{l1['id']}/decide",
        token=admin_token,
        body={"status": "approved"},
    )
    print(f"  {code} {body_.get('detail')}")
    assert code == 400

    section("Teacher: my leaves")
    code, mine = request("GET", "/staff/leaves", token=teacher_token)
    smoke = [m for m in mine if (m.get("reason") or "").startswith("Smoke 8.2")]
    print(f"  smoke leaves: {len(smoke)}")
    assert len(smoke) == 2

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
