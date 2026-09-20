"""Story 12.1 + 12.2 smoke test."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.user import User
from app.models.weekly_report import WeeklyReport
from scripts import devdata


BASE = "http://localhost:8000/api/v1"
TEACHER = ("iyer@dev.local", "TeacherPass123!")
PARENT = ("sharma@dev.local", "ParentPass123!")
SECTION_ID = devdata.section_id("A")  # iyer is the class teacher
STUDENT_ID = devdata.child_id()


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
        for email, pw in (TEACHER, PARENT):
            u = db.execute(
                select(User).where(User.email == email)
            ).scalar_one_or_none()
            if u:
                u.password_hash = hash_password(pw)
                u.is_active = True
        db.commit()
    finally:
        db.close()


def cleanup_week(ws: date):
    db = SessionLocal()
    try:
        db.execute(
            WeeklyReport.__table__.delete().where(WeeklyReport.week_start == ws)
        )
        db.commit()
    finally:
        db.close()


def main():
    section("RESET")
    reset_passwords()
    # Pick last Monday as the week_start
    today = date.today()
    last_monday = today - timedelta(days=today.weekday() + 7)
    cleanup_week(last_monday)
    print(f"  using week_start={last_monday}")

    code, data = request(
        "POST",
        "/teacher/auth/login",
        body={"email": TEACHER[0], "password": TEACHER[1]},
    )
    assert code == 200, data
    t_token = data["access_token"]

    code, data = request(
        "POST",
        "/parent/auth/login",
        body={"email": PARENT[0], "password": PARENT[1]},
    )
    assert code == 200, data
    p_token = data["access_token"]

    section("Teacher generates for section + week")
    code, rows = request(
        "POST",
        "/teacher/weekly-reports/generate",
        token=t_token,
        body={
            "section_id": SECTION_ID,
            "week_start": last_monday.isoformat(),
            "teacher_remark": "Smoke 12.1 - keep it up",
            "share_with_parents": True,
        },
    )
    assert code == 201, rows
    print(f"  generated {len(rows)} reports")
    assert len(rows) >= 5
    aarav = next(r for r in rows if r["student_id"] == STUDENT_ID)
    print(
        f"  Aarav: att={aarav['attendance_pct']}% hw={aarav['homework_submission_pct']}% remark={aarav['teacher_remark']}"
    )
    assert aarav["teacher_remark"] == "Smoke 12.1 - keep it up"
    assert aarav["shared_at"]

    section("Re-generate overwrites the snapshot")
    code, rows2 = request(
        "POST",
        "/teacher/weekly-reports/generate",
        token=t_token,
        body={
            "section_id": SECTION_ID,
            "week_start": last_monday.isoformat(),
            "teacher_remark": "Smoke 12.1 - updated",
            "share_with_parents": True,
        },
    )
    assert code == 201, rows2
    assert len(rows2) == len(rows)
    aarav2 = next(r for r in rows2 if r["student_id"] == STUDENT_ID)
    assert aarav2["id"] == aarav["id"], (aarav, aarav2)
    assert aarav2["teacher_remark"] == "Smoke 12.1 - updated"

    section("Teacher: list for section + week")
    code, listing = request(
        "GET",
        f"/teacher/weekly-reports?section_id={SECTION_ID}&week_start={last_monday}",
        token=t_token,
    )
    assert code == 200, listing
    assert len(listing) == len(rows2)

    section("Parent: list child's reports — sees Aarav's")
    code, parent_view = request(
        "GET", f"/parent/me/children/{STUDENT_ID}/weekly-reports", token=p_token
    )
    assert code == 200, parent_view
    smoke = next(r for r in parent_view if r["id"] == aarav["id"])
    print(f"  parent sees report id={smoke['id']} remark={smoke['teacher_remark']}")
    assert smoke["teacher_remark"] == "Smoke 12.1 - updated"

    section("Teacher: unshare → parent stops seeing")
    code, body_ = request(
        "PATCH",
        f"/teacher/weekly-reports/{aarav['id']}",
        token=t_token,
        body={"share_with_parents": False},
    )
    assert code == 200, body_
    assert body_["shared_at"] is None

    code, parent_view = request(
        "GET", f"/parent/me/children/{STUDENT_ID}/weekly-reports", token=p_token
    )
    assert code == 200, parent_view
    assert not any(r["id"] == aarav["id"] for r in parent_view), parent_view
    print(f"  after unshare, parent sees {len(parent_view)} reports")

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
