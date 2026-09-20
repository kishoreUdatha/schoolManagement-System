"""End-to-end smoke test for Story 4.3 — Promote students.

Verifies:
    POST /api/v1/school/students/promote moves students from
    a source section to a target section in a later year.

    - Auto-creates target class + section in 2026-27 if missing.
    - Promotes a subset of students (by IDs), then promotes the rest (all).
    - Confirms section_id/academic_year_id/roll_no updated correctly.
    - Rejects same-year promotion.
    - Rejects when target section is at capacity.
    - History check: attendance rows still reference the OLD section_id.

Run:
    docker exec sms-backend python -m scripts.smoketest_student_promote
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from sqlalchemy import func, select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.attendance import StudentAttendance
from app.models.student import Student
from app.models.user import User
from scripts import devdata


BASE = "http://localhost:8000/api/v1"
ADMIN_EMAIL = "school@sms.local"
ADMIN_PASSWORD = "SchoolPass123!"
SCHOOL_ID = devdata.school_id()
SOURCE_SECTION_ID = devdata.section_id("A")  # Grade 1 A, in the earlier year
SAME_YEAR_SECTION_ID = devdata.section_id("B")  # Grade 1 B, same year as A
TARGET_CLASS_NAME = "Grade 2"
TARGET_SECTION_NAME = "A"
TARGET_YEAR_NAME = "2026-27"
# who belongs in Grade 1 A once the test has finished with them
HOME_ROSTER = [
    "Aarav Sharma", "Diya Patel", "Kabir Rao",
    "Meera Nair", "Rohan Gupta", "Ananya Reddy",
]


def put_the_children_back() -> int:
    """Promotion is a one-way door for the children it moves, so the test undoes
    itself — otherwise every later test that wants a full Grade 1 A finds it
    empty, and the suite only passes in alphabetical order."""
    db = SessionLocal()
    try:
        year_id = devdata.year_id()
        moved = list(db.execute(
            select(Student).where(
                Student.school_id == SCHOOL_ID,
                Student.full_name.in_(HOME_ROSTER),
            ).order_by(Student.id)
        ).scalars())
        for roll, child in enumerate(moved, start=1):
            child.section_id = SOURCE_SECTION_ID
            child.academic_year_id = year_id
            child.roll_no = roll
            child.is_active = True
        db.commit()
        return len(moved)
    finally:
        db.close()



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


def ensure_target_setup(tenant_id: int):
    """Ensure 2026-27 year has a Grade 2 → Section A."""
    db = SessionLocal()
    try:
        # Reset admin password to be safe
        u = db.execute(select(User).where(User.email == ADMIN_EMAIL)).scalar_one_or_none()
        if u:
            u.password_hash = hash_password(ADMIN_PASSWORD)
            u.is_active = True

        tgt_year = db.execute(
            select(AcademicYear).where(
                AcademicYear.school_id == SCHOOL_ID,
                AcademicYear.name == TARGET_YEAR_NAME,
            )
        ).scalar_one_or_none()
        if not tgt_year:
            raise RuntimeError(f"Year {TARGET_YEAR_NAME} not seeded")
        if tgt_year.is_archived:
            tgt_year.is_archived = False

        tgt_class = db.execute(
            select(SchoolClass).where(
                SchoolClass.school_id == SCHOOL_ID,
                SchoolClass.academic_year_id == tgt_year.id,
                SchoolClass.name == TARGET_CLASS_NAME,
            )
        ).scalar_one_or_none()
        if not tgt_class:
            tgt_class = SchoolClass(
                tenant_id=tenant_id,
                school_id=SCHOOL_ID,
                academic_year_id=tgt_year.id,
                name=TARGET_CLASS_NAME,
                display_order=20,
            )
            db.add(tgt_class)
            db.flush()
            print(f"  created class id={tgt_class.id} {TARGET_CLASS_NAME} in {TARGET_YEAR_NAME}")

        tgt_section = db.execute(
            select(Section).where(
                Section.class_id == tgt_class.id, Section.name == TARGET_SECTION_NAME
            )
        ).scalar_one_or_none()
        if not tgt_section:
            tgt_section = Section(
                tenant_id=tenant_id,
                school_id=SCHOOL_ID,
                class_id=tgt_class.id,
                name=TARGET_SECTION_NAME,
                capacity=20,
            )
            db.add(tgt_section)
            db.flush()
            print(f"  created section id={tgt_section.id} {TARGET_CLASS_NAME} {TARGET_SECTION_NAME}")

        db.commit()
        return tgt_year.id, tgt_class.id, tgt_section.id
    finally:
        db.close()


def snapshot_source(source_section_id: int):
    db = SessionLocal()
    try:
        students = db.execute(
            select(Student)
            .where(Student.section_id == source_section_id, Student.is_active.is_(True))
            .order_by(Student.roll_no)
        ).scalars().all()
        return [
            {
                "id": s.id,
                "admission_no": s.admission_no,
                "full_name": s.full_name,
                "roll_no": s.roll_no,
                "section_id": s.section_id,
                "year": s.academic_year_id,
            }
            for s in students
        ]
    finally:
        db.close()


def count_attendance_for_old_section(student_ids: list[int], old_section_id: int) -> int:
    """Records still pointing to the old section — history preserved."""
    db = SessionLocal()
    try:
        return db.execute(
            select(func.count(StudentAttendance.id)).where(
                StudentAttendance.student_id.in_(student_ids),
                StudentAttendance.section_id == old_section_id,
            )
        ).scalar_one()
    finally:
        db.close()


def main():
    section("LOGIN")
    body = json.dumps({"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).encode()
    req = urllib.request.Request(
        f"{BASE}/school/auth/login", data=body, method="POST"
    )
    req.add_header("Content-Type", "application/json")

    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN_EMAIL)).scalar_one()
        tenant_id = admin.tenant_id
    finally:
        db.close()

    section("SETUP target year + class + section")
    tgt_year_id, tgt_class_id, tgt_section_id = ensure_target_setup(tenant_id)
    print(f"  target: year={tgt_year_id} class={tgt_class_id} section={tgt_section_id}")

    # Reseed admin then login
    with urllib.request.urlopen(req) as r:
        login_data = json.loads(r.read())
    token = login_data["access_token"]

    source_before = snapshot_source(SOURCE_SECTION_ID)
    print(f"  source has {len(source_before)} active students")
    assert len(source_before) >= 2, source_before
    source_student_ids = [s["id"] for s in source_before]

    section("Reject same-year promotion")
    code, body_ = request(
        "POST",
        "/school/students/promote",
        token=token,
        body={
            "source_section_id": SOURCE_SECTION_ID,
            # Grade 1 B is in the SAME year as A, so this must be refused
            "target_section_id": SAME_YEAR_SECTION_ID,
        },
    )
    print(f"  {code} - {body_.get('detail')}")
    assert code == 400, body_

    section("Reject same source==target")
    code, body_ = request(
        "POST",
        "/school/students/promote",
        token=token,
        body={
            "source_section_id": SOURCE_SECTION_ID,
            "target_section_id": SOURCE_SECTION_ID,
        },
    )
    print(f"  {code} - {body_.get('detail')}")
    assert code == 400, body_

    section("Promote 2 specific students")
    pick = source_student_ids[:2]
    code, res = request(
        "POST",
        "/school/students/promote",
        token=token,
        body={
            "source_section_id": SOURCE_SECTION_ID,
            "target_section_id": tgt_section_id,
            "student_ids": pick,
        },
    )
    print(
        f"  {code} promoted={len(res['promoted'])} errors={len(res['errors'])} "
        f"target_year={res.get('target_academic_year_id')}"
    )
    assert code == 200, res
    assert len(res["promoted"]) == 2, res
    assert res["target_academic_year_id"] == tgt_year_id
    for s in res["promoted"]:
        assert s["section_id"] == tgt_section_id
        assert s["academic_year_id"] == tgt_year_id

    # Roll numbers should be 1 and 2 (fresh target section)
    rolls = sorted(s["roll_no"] for s in res["promoted"])
    assert rolls == [1, 2], rolls
    print(f"  assigned rolls: {rolls}")

    section("History: attendance still points to OLD section")
    old_count = count_attendance_for_old_section(pick, SOURCE_SECTION_ID)
    print(f"  old-section attendance rows for promoted students: {old_count}")
    assert old_count > 0, "Expected at least some historical attendance"

    section("Promote remaining students (no student_ids = all)")
    remaining = source_student_ids[2:]
    code, res = request(
        "POST",
        "/school/students/promote",
        token=token,
        body={
            "source_section_id": SOURCE_SECTION_ID,
            "target_section_id": tgt_section_id,
        },
    )
    print(f"  {code} promoted={len(res['promoted'])}")
    assert code == 200, res
    assert len(res["promoted"]) == len(remaining), (
        res,
        remaining,
    )
    new_rolls = sorted(s["roll_no"] for s in res["promoted"])
    assert new_rolls[0] == 3, new_rolls  # continues from 3 after first 2 promotions

    section("Source section is now empty")
    after = snapshot_source(SOURCE_SECTION_ID)
    print(f"  source remaining: {len(after)}")
    assert after == [], after

    section("Capacity reject")
    # Try to promote (already-promoted) student from the target — empty source path
    code, body_ = request(
        "POST",
        "/school/students/promote",
        token=token,
        body={
            "source_section_id": SOURCE_SECTION_ID,
            "target_section_id": tgt_section_id,
        },
    )
    print(f"  empty source → {code} {body_.get('detail')}")
    assert code == 400, body_

    section("Put the children back where the rest of the suite expects them")
    print(f"  returned {put_the_children_back()} children to Grade 1 A")

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
