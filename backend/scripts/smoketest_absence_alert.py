"""End-to-end smoke test for Story 7.2 — Auto absence alert to parents.

Verifies:
    POST /api/v1/teacher/attendance/save with status=absent triggers a
    single_parent in-app notice to the linked parent's inbox.
    Re-saving the same status is idempotent (no duplicate alert).
    Transitioning back to absent after present DOES re-alert.

Assumes seeded dev data:
    Teacher (class teacher of section 1): iyer@dev.local / TeacherPass123!
    Parent (linked to student 1):         sharma@dev.local / ParentPass123!

Run:
    docker exec sms-backend python -m scripts.smoketest_absence_alert
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date

from sqlalchemy import select

from app.core.security import hash_password
from app.models.attendance import StudentAttendance
from app.database import SessionLocal
from app.models.user import User
from scripts import devdata


BASE = "http://localhost:8000/api/v1"
TEACHER_EMAIL = "iyer@dev.local"
TEACHER_PASSWORD = "TeacherPass123!"
PARENT_EMAIL = "sharma@dev.local"
PARENT_PASSWORD = "ParentPass123!"
SECTION_ID = devdata.section_id("A")
STUDENT_ID = devdata.child_id()  # Aarav Sharma — linked to parent sharma@dev.local


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
        for email, pw in (
            (TEACHER_EMAIL, TEACHER_PASSWORD),
            (PARENT_EMAIL, PARENT_PASSWORD),
        ):
            u = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
            if u:
                u.password_hash = hash_password(pw)
                u.is_active = True
        db.commit()
    finally:
        db.close()


def clear_todays_attendance():
    """The alert only fires the first time a child is marked absent on a day,
    so a second run on the same day would see nothing new. Wipe today's row
    for the child under test and the run starts from a clean slate."""
    db = SessionLocal()
    try:
        db.execute(
            StudentAttendance.__table__.delete().where(
                StudentAttendance.student_id == STUDENT_ID,
                StudentAttendance.date == date.today(),
            )
        )
        db.commit()
    finally:
        db.close()

def login(email, pw, role):
    code, data = request(
        "POST", f"/{role}/auth/login", body={"email": email, "password": pw}
    )
    assert code == 200, data
    return data["access_token"]


def count_absence_notices(token):
    code, inbox = request("GET", "/parent/me/notices", token=token)
    assert code == 200, inbox
    return sum(1 for n in inbox if n["title"].startswith("Absence notice:"))


def main():
    section("RESET SEED PASSWORDS")
    reset_passwords()
    clear_todays_attendance()

    teacher_token = login(TEACHER_EMAIL, TEACHER_PASSWORD, "teacher")
    parent_token = login(PARENT_EMAIL, PARENT_PASSWORD, "parent")

    today = date.today().isoformat()

    section("STEP 1 — baseline parent absence-notice count")
    baseline = count_absence_notices(parent_token)
    print(f"  baseline absence-notices in inbox: {baseline}")

    section("STEP 2 — mark student 1 ABSENT (first time today)")
    code, res = request(
        "POST",
        "/teacher/attendance/save",
        token=teacher_token,
        body={
            "section_id": SECTION_ID,
            "date": today,
            "entries": [{"student_id": STUDENT_ID, "status": "absent"}],
        },
    )
    print(f"  {code} saved={res.get('saved')} alerts_sent={res.get('absence_alerts_sent')}")
    assert code == 200, res
    assert res["absence_alerts_sent"] == 1, res

    after1 = count_absence_notices(parent_token)
    print(f"  inbox count now: {after1} (was {baseline})")
    assert after1 == baseline + 1, f"expected +1, got {after1 - baseline}"

    section("STEP 3 — re-save same ABSENT (idempotent)")
    code, res = request(
        "POST",
        "/teacher/attendance/save",
        token=teacher_token,
        body={
            "section_id": SECTION_ID,
            "date": today,
            "entries": [{"student_id": STUDENT_ID, "status": "absent"}],
        },
    )
    print(f"  {code} alerts_sent={res.get('absence_alerts_sent')}")
    assert res["absence_alerts_sent"] == 0, res

    after2 = count_absence_notices(parent_token)
    print(f"  inbox count: {after2} (should equal {after1})")
    assert after2 == after1, f"expected idempotent, got {after2 - after1} extra"

    section("STEP 4 — flip to PRESENT (no alert)")
    code, res = request(
        "POST",
        "/teacher/attendance/save",
        token=teacher_token,
        body={
            "section_id": SECTION_ID,
            "date": today,
            "entries": [{"student_id": STUDENT_ID, "status": "present"}],
        },
    )
    print(f"  {code} alerts_sent={res.get('absence_alerts_sent')}")
    assert res["absence_alerts_sent"] == 0, res

    section("STEP 5 — flip BACK to ABSENT (alert fires again)")
    code, res = request(
        "POST",
        "/teacher/attendance/save",
        token=teacher_token,
        body={
            "section_id": SECTION_ID,
            "date": today,
            "entries": [{"student_id": STUDENT_ID, "status": "absent"}],
        },
    )
    print(f"  {code} alerts_sent={res.get('absence_alerts_sent')}")
    assert res["absence_alerts_sent"] == 1, res

    after3 = count_absence_notices(parent_token)
    print(f"  inbox count: {after3} (should be {after1 + 1})")
    assert after3 == after1 + 1, f"expected +1, got {after3 - after1}"

    section("STEP 6 — verify notice body shape")
    code, inbox = request("GET", "/parent/me/notices", token=parent_token)
    latest = next(n for n in inbox if n["title"].startswith("Absence notice:"))
    print(f"  title: {latest['title']}")
    print(f"  body:  {latest['body']}")
    assert today in latest["body"], latest["body"]
    assert "Grade 1 A" in latest["body"], latest["body"]

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
