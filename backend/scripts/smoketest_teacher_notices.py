"""End-to-end smoke test for Story 3.11 — Teacher notices.

Verifies:
    POST /api/v1/teacher/notices    (class_parents, section_parents, single_parent)
    GET  /api/v1/teacher/notices    (lists notices sent by this teacher only)
    Audience guard                  (teacher can't send all_parents)
    Permission guard                (teacher can't message a class they don't teach)
    Parent inbox                    (notice lands for the linked parent)

Assumes the seeded dev data:
    School:  Dev Demo School        (school_id=2)
    Teacher: iyer@dev.local         (id=4, teaches class_id=2)
    Parent:  sharma@dev.local       (id=6, linked to students 1 & 2 in section_id=1)

Resets teacher/parent passwords to known values first so the test is repeatable.

Run inside the backend container:
    docker exec sms-backend python -m scripts.smoketest_teacher_notices
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

TEACHER_EMAIL = "iyer@dev.local"
TEACHER_PASSWORD = "TeacherPass123!"
PARENT_EMAIL = "sharma@dev.local"
PARENT_PASSWORD = "ParentPass123!"


def request(
    method: str,
    path: str,
    *,
    token: str | None = None,
    body: dict | None = None,
) -> tuple[int, dict | list | None]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw.decode(errors="ignore")}


def section(title: str) -> None:
    print(f"\n=== {title} ===")


def reset_passwords() -> None:
    db = SessionLocal()
    try:
        for email, pw in (
            (TEACHER_EMAIL, TEACHER_PASSWORD),
            (PARENT_EMAIL, PARENT_PASSWORD),
        ):
            u = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
            if not u:
                print(f"  ! missing seeded user: {email}")
                continue
            u.password_hash = hash_password(pw)
            u.is_active = True
            print(f"  reset password for {email} (id={u.id})")
        db.commit()
    finally:
        db.close()


def main() -> int:
    section("RESET SEED PASSWORDS")
    reset_passwords()

    section("TEACHER LOGIN")
    code, data = request(
        "POST",
        "/teacher/auth/login",
        body={"email": TEACHER_EMAIL, "password": TEACHER_PASSWORD},
    )
    print(f"  {code} - user: {data.get('user', {}).get('email')}")
    assert code == 200, data
    teacher_token = data["access_token"]
    teacher_school_id = data["user"]["school_id"]

    # Pull class/section/student ids the teacher is allowed to message
    db = SessionLocal()
    try:
        from app.models.subject import ClassSubject
        from app.models.academic import Section
        from app.models.parent import ParentStudent
        from app.models.student import Student

        teacher_user_id = data["user"]["id"]
        class_id = db.execute(
            select(ClassSubject.class_id)
            .where(ClassSubject.teacher_user_id == teacher_user_id)
            .order_by(ClassSubject.id)
            .limit(1)
        ).scalar_one()
        # Pick a section with a student whose parent we can check the inbox of.
        # Ordering matters: an unordered pick can land on a section whose
        # children have no parent linked, and the notice then reaches nobody.
        section_id, student_id = db.execute(
            select(Section.id, Student.id)
            .join(Student, Student.section_id == Section.id)
            .join(ParentStudent, ParentStudent.student_id == Student.id)
            .where(Section.class_id == class_id, Student.is_active.is_(True))
            .order_by(Section.id, Student.id)
            .limit(1)
        ).one()
        # An UN-owned class — pick any class on the school the teacher does NOT teach,
        # or fall back to a fake id that should yield 404/403.
        from app.models.academic import SchoolClass
        forbidden_class_id = db.execute(
            select(SchoolClass.id)
            .where(SchoolClass.school_id == teacher_school_id, SchoolClass.id != class_id)
            .limit(1)
        ).scalar_one_or_none()
    finally:
        db.close()

    print(
        f"  teacher_user_id={teacher_user_id} class_id={class_id} "
        f"section_id={section_id} student_id={student_id} "
        f"forbidden_class_id={forbidden_class_id}"
    )

    section("POST class_parents notice")
    code, data = request(
        "POST",
        "/teacher/notices",
        token=teacher_token,
        body={
            "title": "Smoke: class notice",
            "body": "Hello class parents — smoke test",
            "audience": "class_parents",
            "audience_class_id": class_id,
        },
    )
    print(
        f"  {code} - id={data.get('id')} status={data.get('status')} "
        f"recipients={data.get('recipient_count')}"
    )
    assert code == 201, data
    assert data["status"] == "sent", data
    assert data["channels"] == ["in_app"], data
    class_notice_id = data["id"]

    section("POST section_parents notice")
    code, data = request(
        "POST",
        "/teacher/notices",
        token=teacher_token,
        body={
            "title": "Smoke: section notice",
            "body": "Hello section parents — smoke test",
            "audience": "section_parents",
            "audience_section_id": section_id,
        },
    )
    print(
        f"  {code} - id={data.get('id')} recipients={data.get('recipient_count')}"
    )
    assert code == 201, data

    section("POST single_parent notice")
    code, data = request(
        "POST",
        "/teacher/notices",
        token=teacher_token,
        body={
            "title": "Smoke: single parent",
            "body": "Just for one parent",
            "audience": "single_parent",
            "audience_student_id": student_id,
        },
    )
    print(
        f"  {code} - id={data.get('id')} recipients={data.get('recipient_count')}"
    )
    assert code == 201, data

    section("REJECT all_parents (teacher not allowed)")
    code, data = request(
        "POST",
        "/teacher/notices",
        token=teacher_token,
        body={
            "title": "Smoke: should fail",
            "body": "shouldn't go anywhere",
            "audience": "all_parents",
        },
    )
    print(f"  {code} - {data.get('detail') if isinstance(data, dict) else data}")
    assert code == 403, data

    if forbidden_class_id is not None:
        section("REJECT class teacher doesn't teach")
        code, data = request(
            "POST",
            "/teacher/notices",
            token=teacher_token,
            body={
                "title": "Smoke: wrong class",
                "body": "should be blocked",
                "audience": "class_parents",
                "audience_class_id": forbidden_class_id,
            },
        )
        print(f"  {code} - {data.get('detail') if isinstance(data, dict) else data}")
        assert code == 403, data
    else:
        print("  (skipped — no other class on this school to try)")

    section("GET teacher sent-list")
    code, data = request("GET", "/teacher/notices", token=teacher_token)
    titles = [n["title"] for n in data] if isinstance(data, list) else []
    print(f"  {code} - {len(titles)} notices, first three: {titles[:3]}")
    assert code == 200, data
    assert any(n["id"] == class_notice_id for n in data), data

    section("PARENT LOGIN — verify notice landed in inbox")
    code, data = request(
        "POST",
        "/parent/auth/login",
        body={"email": PARENT_EMAIL, "password": PARENT_PASSWORD},
    )
    print(f"  {code} - user: {data.get('user', {}).get('email')}")
    assert code == 200, data
    parent_token = data["access_token"]

    code, inbox = request("GET", "/parent/me/notices", token=parent_token)
    parent_titles = [n["title"] for n in inbox] if isinstance(inbox, list) else []
    print(f"  inbox status={code} count={len(parent_titles)}")
    print(f"  titles: {parent_titles[:5]}")
    assert code == 200, inbox
    assert any(t == "Smoke: class notice" for t in parent_titles), parent_titles
    assert any(t == "Smoke: section notice" for t in parent_titles), parent_titles
    assert any(t == "Smoke: single parent" for t in parent_titles), parent_titles

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
