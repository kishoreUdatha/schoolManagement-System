"""End-to-end smoke test for Story 3.2 — Principal & Accountant roles.

Verifies:
    School admin can create users with role=principal and role=accountant
    through the existing /school/staff endpoint.
    Each new user can sign in on their own /(role)/auth/login endpoint.
    Principal can access /school/reports/attendance/* (NOT fees).
    Accountant can access /school/fees/* (NOT reports).
    Teacher account remains rejected from both.

Run:
    docker exec sms-backend python -m scripts.smoketest_principal_accountant_roles
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
SCHOOL_ADMIN_EMAIL = "school@sms.local"
SCHOOL_ADMIN_PASSWORD = "SchoolPass123!"
PRINCIPAL_EMAIL = "principal@dev.local"
PRINCIPAL_PASSWORD = "PrincipalPass123!"
ACCOUNTANT_EMAIL = "accountant@dev.local"
ACCOUNTANT_PASSWORD = "AccountantPass123!"


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


def reset_school_admin():
    db = SessionLocal()
    try:
        u = db.execute(
            select(User).where(User.email == SCHOOL_ADMIN_EMAIL)
        ).scalar_one_or_none()
        if u:
            u.password_hash = hash_password(SCHOOL_ADMIN_PASSWORD)
            u.is_active = True
            db.commit()
    finally:
        db.close()


def ensure_role_user(email: str, role_str: str, password: str) -> int:
    """Reuse an existing user or create via /school/staff. Returns user_id."""
    db = SessionLocal()
    try:
        existing = db.execute(
            select(User).where(User.email == email)
        ).scalar_one_or_none()
        if existing:
            existing.password_hash = hash_password(password)
            existing.is_active = True
            db.commit()
            return existing.id
    finally:
        db.close()
    return -1  # not present — caller will create via API


def main():
    section("RESET SCHOOL ADMIN + LOGIN")
    reset_school_admin()
    code, data = request(
        "POST",
        "/school/auth/login",
        body={"email": SCHOOL_ADMIN_EMAIL, "password": SCHOOL_ADMIN_PASSWORD},
    )
    assert code == 200, data
    admin_token = data["access_token"]
    print(f"  logged in as school_admin id={data['user']['id']}")

    section("Create principal via /school/staff")
    existing_id = ensure_role_user(PRINCIPAL_EMAIL, "principal", PRINCIPAL_PASSWORD)
    if existing_id == -1:
        code, body_ = request(
            "POST",
            "/school/staff",
            token=admin_token,
            body={
                "full_name": "Dev Principal",
                "email": PRINCIPAL_EMAIL,
                "role": "principal",
                "employee_no": "PRIN001",
                "designation": "Principal",
                "joining_date": str(date.today()),
            },
        )
        print(f"  create code={code}")
        assert code == 201, body_
        # Reset to a known password so the test can log in
        ensure_role_user(PRINCIPAL_EMAIL, "principal", PRINCIPAL_PASSWORD)
    else:
        print(f"  reused existing user_id={existing_id}")

    section("Create accountant via /school/staff")
    existing_id = ensure_role_user(ACCOUNTANT_EMAIL, "accountant", ACCOUNTANT_PASSWORD)
    if existing_id == -1:
        code, body_ = request(
            "POST",
            "/school/staff",
            token=admin_token,
            body={
                "full_name": "Dev Accountant",
                "email": ACCOUNTANT_EMAIL,
                "role": "accountant",
                "employee_no": "ACC001",
                "designation": "Accountant",
                "joining_date": str(date.today()),
            },
        )
        print(f"  create code={code}")
        assert code == 201, body_
        ensure_role_user(ACCOUNTANT_EMAIL, "accountant", ACCOUNTANT_PASSWORD)
    else:
        print(f"  reused existing user_id={existing_id}")

    section("Principal logs in")
    code, data = request(
        "POST",
        "/principal/auth/login",
        body={"email": PRINCIPAL_EMAIL, "password": PRINCIPAL_PASSWORD},
    )
    assert code == 200, data
    prin_token = data["access_token"]
    print(f"  ok role={data['user']['role']}")

    section("Accountant logs in")
    code, data = request(
        "POST",
        "/accountant/auth/login",
        body={"email": ACCOUNTANT_EMAIL, "password": ACCOUNTANT_PASSWORD},
    )
    assert code == 200, data
    acc_token = data["access_token"]
    print(f"  ok role={data['user']['role']}")

    section("Wrong-portal login is rejected")
    code, body_ = request(
        "POST",
        "/teacher/auth/login",
        body={"email": PRINCIPAL_EMAIL, "password": PRINCIPAL_PASSWORD},
    )
    print(f"  principal @ /teacher/auth/login → {code}")
    assert code == 401, body_

    code, body_ = request(
        "POST",
        "/school/auth/login",
        body={"email": ACCOUNTANT_EMAIL, "password": ACCOUNTANT_PASSWORD},
    )
    print(f"  accountant @ /school/auth/login → {code}")
    assert code == 401, body_

    section("Principal CAN reach reports")
    today = date.today().isoformat()
    code, body_ = request(
        "GET",
        f"/school/reports/attendance/daily-absent?date={today}",
        token=prin_token,
    )
    print(f"  daily-absent → {code} (rows={len(body_) if isinstance(body_, list) else '?'})")
    assert code == 200, body_

    section("Principal is BLOCKED from fees")
    code, body_ = request("GET", "/school/fees/heads", token=prin_token)
    print(f"  /school/fees/heads → {code} {body_.get('detail') if isinstance(body_, dict) else ''}")
    assert code == 403, body_

    section("Accountant CAN reach fees")
    code, body_ = request("GET", "/school/fees/heads", token=acc_token)
    print(f"  /school/fees/heads → {code}")
    assert code == 200, body_

    section("Accountant is BLOCKED from reports")
    code, body_ = request(
        "GET",
        f"/school/reports/attendance/daily-absent?date={today}",
        token=acc_token,
    )
    print(f"  daily-absent → {code} {body_.get('detail') if isinstance(body_, dict) else ''}")
    assert code == 403, body_

    section("Teacher token rejected at both endpoints")
    # Reuse existing iyer teacher
    db = SessionLocal()
    try:
        teacher = db.execute(
            select(User).where(User.email == "iyer@dev.local")
        ).scalar_one_or_none()
        if teacher:
            teacher.password_hash = hash_password("TeacherPass123!")
            teacher.is_active = True
            db.commit()
    finally:
        db.close()

    code, data = request(
        "POST",
        "/teacher/auth/login",
        body={"email": "iyer@dev.local", "password": "TeacherPass123!"},
    )
    assert code == 200, data
    teacher_token = data["access_token"]

    code, body_ = request(
        "GET",
        f"/school/reports/attendance/daily-absent?date={today}",
        token=teacher_token,
    )
    print(f"  teacher → reports → {code}")
    assert code == 403, body_

    code, body_ = request("GET", "/school/fees/heads", token=teacher_token)
    print(f"  teacher → fees → {code}")
    assert code == 403, body_

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
