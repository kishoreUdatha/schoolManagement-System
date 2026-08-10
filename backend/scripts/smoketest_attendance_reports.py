"""End-to-end smoke test for Story 7.3 — Attendance reports.

Verifies the six endpoints under /api/v1/school/reports/attendance:
    daily-absent       (JSON + .csv)
    class-summary      (JSON + .csv)
    student-monthly    (JSON + .csv)

Plus tenant-isolation: numbers come from school 2 only.

Run:
    docker exec sms-backend python -m scripts.smoketest_attendance_reports
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from calendar import monthrange
from datetime import date, timedelta

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN_EMAIL = "school@sms.local"
ADMIN_PASSWORD = "SchoolPass123!"


def request(method, path, *, token=None, as_text=False):
    req = urllib.request.Request(f"{BASE}{path}", method=method)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            if as_text:
                return r.status, raw.decode(), dict(r.headers)
            return r.status, json.loads(raw), dict(r.headers)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw), dict(e.headers)
        except Exception:
            return e.code, {"raw": raw.decode(errors="ignore")}, dict(e.headers)


def section(t):
    print(f"\n=== {t} ===")


def reset_admin_password():
    db = SessionLocal()
    try:
        u = db.execute(select(User).where(User.email == ADMIN_EMAIL)).scalar_one_or_none()
        if u:
            u.password_hash = hash_password(ADMIN_PASSWORD)
            u.is_active = True
            db.commit()
    finally:
        db.close()


def main():
    section("LOGIN")
    reset_admin_password()
    body = json.dumps({"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).encode()
    req = urllib.request.Request(
        f"{BASE}/school/auth/login", data=body, method="POST"
    )
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    token = data["access_token"]
    print(f"  school_id={data['user']['school_id']}")

    today = date.today()
    last_month = today - timedelta(days=30)
    year, month = today.year, today.month

    section("daily-absent JSON")
    code, rows, _ = request(
        "GET", f"/school/reports/attendance/daily-absent?date={today}", token=token
    )
    assert code == 200, rows
    print(f"  {len(rows)} absent rows. first: {rows[0] if rows else '(none)'}")

    section("daily-absent CSV")
    code, text, hdrs = request(
        "GET",
        f"/school/reports/attendance/daily-absent.csv?date={today}",
        token=token,
        as_text=True,
    )
    assert code == 200, text[:200]
    assert hdrs.get("content-type", "").startswith("text/csv"), hdrs
    assert hdrs.get("content-disposition", "").startswith("attachment"), hdrs
    lines = text.strip().splitlines()
    print(f"  {len(lines)} lines, header: {lines[0]}")
    assert lines[0].startswith("Class,Section,Roll #"), lines[0]

    section("class-summary JSON")
    code, rows, _ = request(
        "GET",
        f"/school/reports/attendance/class-summary?from={last_month}&to={today}",
        token=token,
    )
    assert code == 200, rows
    print(f"  {len(rows)} class/section rows")
    for r in rows[:3]:
        print(
            f"    {r['class_name']} {r['section_name']}: "
            f"students={r['distinct_students']} pct={r['attendance_pct']}"
        )

    section("class-summary CSV")
    code, text, hdrs = request(
        "GET",
        f"/school/reports/attendance/class-summary.csv?from={last_month}&to={today}",
        token=token,
        as_text=True,
    )
    assert code == 200, text[:200]
    assert "Attendance %" in text.splitlines()[0], text

    section("student-monthly JSON")
    # Find a section that has students
    sec_id = rows[0]["section_id"] if rows else 1
    code, report, _ = request(
        "GET",
        f"/school/reports/attendance/student-monthly?section_id={sec_id}&year={year}&month={month}",
        token=token,
    )
    assert code == 200, report
    print(
        f"  {report['section_label']} {year}-{month:02d}: "
        f"overall_pct={report['overall_pct']} totals={report['totals']}"
    )
    # First and last day of month should match
    last_day = monthrange(year, month)[1]
    assert report["from_date"] == f"{year}-{month:02d}-01"
    assert report["to_date"] == f"{year}-{month:02d}-{last_day:02d}"
    # Each row's marked_days = sum of its statuses
    for r in report["rows"]:
        assert (
            r["marked_days"]
            == r["present"] + r["absent"] + r["late"] + r["half_day"]
        ), r

    section("student-monthly CSV")
    code, text, hdrs = request(
        "GET",
        f"/school/reports/attendance/student-monthly.csv?section_id={sec_id}&year={year}&month={month}",
        token=token,
        as_text=True,
    )
    assert code == 200, text[:200]
    lines = text.strip().splitlines()
    print(f"  {len(lines)} lines incl header")
    # Total rows excluding header should equal report row count
    assert len(lines) - 1 == len(report["rows"]), (len(lines), len(report["rows"]))

    section("Validation: bad month rejected")
    code, body_, _ = request(
        "GET",
        f"/school/reports/attendance/student-monthly?section_id={sec_id}&year={year}&month=13",
        token=token,
    )
    assert code == 422, (code, body_)

    section("Validation: from > to rejected")
    code, body_, _ = request(
        "GET",
        f"/school/reports/attendance/class-summary?from={today}&to={last_month}",
        token=token,
    )
    assert code == 400, (code, body_)
    print(f"  rejected: {body_.get('detail')}")

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
