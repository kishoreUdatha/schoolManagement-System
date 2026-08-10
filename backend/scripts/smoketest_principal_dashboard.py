"""End-to-end smoke test for Story 19.1 — Principal dashboard metrics.

Verifies:
    /api/v1/school/dashboard returns the new attendance/homework/exam/
    notifications blocks (no longer placeholders).
    Principal CAN reach both /school/dashboard and /principal/dashboard.
    Teacher token is rejected.

Run:
    docker exec sms-backend python -m scripts.smoketest_principal_dashboard
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
SCHOOL_ADMIN = ("school@sms.local", "SchoolPass123!")
PRINCIPAL = ("principal@dev.local", "PrincipalPass123!")
TEACHER = ("iyer@dev.local", "TeacherPass123!")


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
        for email, pw in (SCHOOL_ADMIN, PRINCIPAL, TEACHER):
            u = db.execute(
                select(User).where(User.email == email)
            ).scalar_one_or_none()
            if u:
                u.password_hash = hash_password(pw)
                u.is_active = True
        db.commit()
    finally:
        db.close()


def login(role, email, password):
    code, data = request(
        "POST", f"/{role}/auth/login", body={"email": email, "password": password}
    )
    assert code == 200, data
    return data["access_token"]


def main():
    section("RESET PASSWORDS")
    reset_passwords()

    sa_token = login("school", *SCHOOL_ADMIN)
    prin_token = login("principal", *PRINCIPAL)
    teacher_token = login("teacher", *TEACHER)

    section("School admin /school/dashboard has all new blocks")
    code, d = request("GET", "/school/dashboard", token=sa_token)
    assert code == 200, d
    for key in (
        "counts",
        "fees",
        "attendance",
        "homework",
        "exam_performance",
        "notifications",
    ):
        assert key in d, f"missing {key}"
    print(
        f"  students={d['counts']['students_active']} "
        f"teachers={d['counts']['teachers_active']}"
    )
    print(
        f"  attendance.available={d['attendance']['available']} "
        f"as_of={d['attendance'].get('as_of_date')} pct={d['attendance']['attendance_pct']}"
    )
    print(
        f"  homework.total={d['homework']['total_homework']} "
        f"submission_rate={d['homework']['submission_rate_pct']}%"
    )
    print(
        f"  exam.available={d['exam_performance']['available']} "
        f"name={d['exam_performance'].get('exam_name')} avg={d['exam_performance'].get('average_pct')}"
    )
    print(
        f"  notifications.sent={d['notifications']['sent_count']} "
        f"recipients={d['notifications']['total_recipients']}"
    )
    # Sanity: previous "placeholder" message should NOT appear
    assert "note" not in d["attendance"] or not d["attendance"]["note"], d[
        "attendance"
    ]

    section("Principal /principal/dashboard returns same shape")
    code, d2 = request("GET", "/principal/dashboard", token=prin_token)
    assert code == 200, d2
    assert (
        d2["counts"]["students_active"] == d["counts"]["students_active"]
    ), (d, d2)
    print(
        f"  same student count: {d2['counts']['students_active']}"
    )

    section("Principal can ALSO reach /school/dashboard")
    code, d3 = request("GET", "/school/dashboard", token=prin_token)
    assert code == 200, d3

    section("Teacher token rejected on both")
    code, body_ = request("GET", "/school/dashboard", token=teacher_token)
    assert code == 403, body_
    code, body_ = request("GET", "/principal/dashboard", token=teacher_token)
    assert code == 403, body_
    print("  both 403 ✓")

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
