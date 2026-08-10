"""Story 20.1 — quick verification that each export endpoint returns CSV."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.exam import Exam
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")


def request(method, path, *, token=None, as_text=False, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            if as_text:
                return r.status, raw.decode(), dict(r.headers)
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw.decode(errors="ignore")}


def section(t):
    print(f"\n=== {t} ===")


def reset_password():
    db = SessionLocal()
    try:
        u = db.execute(
            select(User).where(User.email == ADMIN[0])
        ).scalar_one_or_none()
        if u:
            u.password_hash = hash_password(ADMIN[1])
            u.is_active = True
            db.commit()
    finally:
        db.close()


def main():
    section("RESET + login")
    reset_password()
    code, data = request(
        "POST",
        "/school/auth/login",
        body={"email": ADMIN[0], "password": ADMIN[1]},
    )
    assert code == 200, data
    token = data["access_token"]

    paths = [
        "/school/exports/students.csv",
        "/school/exports/staff.csv",
        "/school/exports/fees.csv",
        "/school/exports/homework.csv",
        "/school/exports/behaviour.csv",
    ]
    # marks requires exam_id
    db = SessionLocal()
    try:
        exam = db.execute(select(Exam).limit(1)).scalar_one_or_none()
    finally:
        db.close()
    if exam:
        paths.append(f"/school/exports/marks.csv?exam_id={exam.id}")

    section("All exports return CSV")
    for p in paths:
        code, text, hdrs = request("GET", p, token=token, as_text=True)
        ctype = hdrs.get("content-type", "")
        lines = text.splitlines() if text else []
        print(f"  {p[-35:]:40} → {code} ct={'csv' if 'csv' in ctype else ctype} lines={len(lines)}")
        assert code == 200, text[:200]
        assert "text/csv" in ctype, ctype
        assert len(lines) >= 1, text  # at least header

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
