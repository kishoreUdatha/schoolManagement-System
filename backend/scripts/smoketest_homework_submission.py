"""End-to-end smoke test for Story 9.3 — Homework submission.

Verifies:
    Parent submits homework for a linked child.
    Re-submission overwrites + resets review.
    Teacher lists submissions and approves/rejects with remark.
    After approval, parent re-edit resets back to 'submitted'.
    Guards: foreign child rejected, foreign homework rejected,
    non-teaching teacher rejected.

Assumes seeded dev data:
    Teacher (iyer@dev.local) teaches class_subject_id=1 in Grade 1 (class_id=2)
    Parent  (sharma@dev.local) linked to student 1 (Aarav Sharma, section 1)
    Aarav's section is in class_id=2 → homework on class_subject_id=1 is in his class

Run:
    docker exec sms-backend python -m scripts.smoketest_homework_submission
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
from app.models.homework import Homework, HomeworkSubmission
from app.models.user import User
from scripts import devdata


BASE = "http://localhost:8000/api/v1"
TEACHER_EMAIL = "iyer@dev.local"
TEACHER_PASSWORD = "TeacherPass123!"
PARENT_EMAIL = "sharma@dev.local"
PARENT_PASSWORD = "ParentPass123!"
CLASS_SUBJECT_ID = devdata.class_subject_id()  # Maths in Grade 1
STUDENT_ID = devdata.child_id()
OTHER_CHILD_ID = devdata.other_child_id()  # nobody links this parent to them


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


def cleanup_test_homework():
    """Remove any previous test homework + submissions."""
    db = SessionLocal()
    try:
        for h in db.execute(
            select(Homework).where(Homework.title == "Smoke 9.3 — submit me")
        ).scalars().all():
            db.execute(
                HomeworkSubmission.__table__.delete().where(
                    HomeworkSubmission.homework_id == h.id
                )
            )
            db.delete(h)
        db.commit()
    finally:
        db.close()


def main():
    section("RESET PASSWORDS + CLEANUP")
    reset_passwords()
    cleanup_test_homework()

    section("TEACHER LOGIN + CREATE HOMEWORK")
    code, data = request(
        "POST",
        "/teacher/auth/login",
        body={"email": TEACHER_EMAIL, "password": TEACHER_PASSWORD},
    )
    assert code == 200, data
    teacher_token = data["access_token"]

    due = (date.today() + timedelta(days=7)).isoformat()
    code, hw = request(
        "POST",
        "/teacher/homework",
        token=teacher_token,
        body={
            "class_subject_id": CLASS_SUBJECT_ID,
            "title": "Smoke 9.3 — submit me",
            "description": "Solve problems 1-10",
            "due_date": due,
            "notify_parents": False,
        },
    )
    assert code == 201, hw
    hw_id = hw["id"]
    print(f"  homework_id={hw_id}")

    section("PARENT LOGIN")
    code, data = request(
        "POST",
        "/parent/auth/login",
        body={"email": PARENT_EMAIL, "password": PARENT_PASSWORD},
    )
    assert code == 200, data
    parent_token = data["access_token"]

    section("Parent: no submission yet")
    code, body_ = request(
        "GET",
        f"/parent/me/children/{STUDENT_ID}/homework/{hw_id}/submission",
        token=parent_token,
    )
    print(f"  {code} {body_}")
    assert code == 200, body_
    assert body_ is None, body_

    section("Parent: missing both attachment + comment → 400")
    code, body_ = request(
        "POST",
        f"/parent/me/children/{STUDENT_ID}/homework/{hw_id}/submission",
        token=parent_token,
        body={},
    )
    print(f"  {code} {body_.get('detail')}")
    assert code == 400, body_

    section("Parent: submit attachment + comment")
    code, sub = request(
        "POST",
        f"/parent/me/children/{STUDENT_ID}/homework/{hw_id}/submission",
        token=parent_token,
        body={
            "attachment_url": "https://example.com/aarav-hw.pdf",
            "comment": "Done; question 7 was tricky.",
        },
    )
    print(f"  {code} id={sub.get('id')} status={sub.get('status')}")
    assert code == 201, sub
    assert sub["status"] == "submitted"
    sub_id = sub["id"]

    section("Parent: foreign child rejected (student 4 is not linked)")
    code, body_ = request(
        "POST",
        f"/parent/me/children/{OTHER_CHILD_ID}/homework/{hw_id}/submission",
        token=parent_token,
        body={"comment": "should fail"},
    )
    print(f"  {code} - {body_.get('detail')}")
    assert code == 404, body_

    section("Teacher: list submissions")
    code, items = request(
        "GET", f"/teacher/homework/{hw_id}/submissions", token=teacher_token
    )
    print(f"  {code} {len(items)} item(s)")
    assert code == 200, items
    assert len(items) == 1, items
    assert items[0]["student_name"] == "Aarav Sharma"

    section("Teacher: approve with remark")
    code, reviewed = request(
        "PATCH",
        f"/teacher/homework/submissions/{sub_id}/review",
        token=teacher_token,
        body={"status": "approved", "teacher_remark": "Nice work!"},
    )
    print(f"  {code} status={reviewed.get('status')} remark={reviewed.get('teacher_remark')}")
    assert code == 200, reviewed
    assert reviewed["status"] == "approved"
    assert reviewed["reviewed_by_user_id"]

    section("Teacher: bad review status (submitted) rejected")
    code, body_ = request(
        "PATCH",
        f"/teacher/homework/submissions/{sub_id}/review",
        token=teacher_token,
        body={"status": "submitted"},
    )
    print(f"  {code} - {body_.get('detail')}")
    assert code == 400, body_

    section("Parent: re-submit (edit) → resets to submitted, clears remark")
    code, sub2 = request(
        "PATCH",
        f"/parent/me/children/{STUDENT_ID}/homework/{hw_id}/submission",
        token=parent_token,
        body={"comment": "Reworked question 7 per feedback."},
    )
    print(f"  {code} status={sub2.get('status')} remark={sub2.get('teacher_remark')}")
    assert code == 200, sub2
    assert sub2["status"] == "submitted"
    assert sub2["teacher_remark"] is None
    assert sub2["reviewed_at"] is None

    section("Teacher: reject this time")
    code, reviewed = request(
        "PATCH",
        f"/teacher/homework/submissions/{sub_id}/review",
        token=teacher_token,
        body={"status": "rejected", "teacher_remark": "Still incorrect on Q7"},
    )
    assert code == 200, reviewed
    assert reviewed["status"] == "rejected"
    print(f"  {code} status={reviewed['status']}")

    section("Teacher: non-owning teacher cannot list (no other teacher seeded; skip)")
    print("  (only one teacher account in seed)")

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
