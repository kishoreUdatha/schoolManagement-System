"""End-to-end smoke test for Story 15.2 — Video completion tracking.

Verifies:
    Teacher creates a video.
    Parent's video list shows is_completed=false initially.
    Parent marks completed → list shows is_completed=true, completion_count=1.
    Parent marks again → idempotent.
    Parent unmarks → completion_count=0, is_completed=false.
    Teacher /videos/{id}/completions roster shows all class students with
    correct watched/not-watched.
    Foreign-child or foreign-video gracefully rejected.

Run:
    docker exec sms-backend python -m scripts.smoketest_video_completion
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.learning_video import LearningVideo, LearningVideoCompletion
from app.models.user import User
from scripts import devdata


BASE = "http://localhost:8000/api/v1"
TEACHER = ("iyer@dev.local", "TeacherPass123!")
PARENT = ("sharma@dev.local", "ParentPass123!")
CLASS_SUBJECT_ID = devdata.class_subject_id()  # Maths, Grade 1
STUDENT_ID = devdata.child_id()  # Aarav
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


def cleanup():
    db = SessionLocal()
    try:
        videos = db.execute(
            select(LearningVideo).where(
                LearningVideo.title == "Smoke 15.2"
            )
        ).scalars().all()
        for v in videos:
            db.execute(
                LearningVideoCompletion.__table__.delete().where(
                    LearningVideoCompletion.video_id == v.id
                )
            )
            db.delete(v)
        db.commit()
    finally:
        db.close()


def main():
    section("RESET + cleanup")
    reset_passwords()
    cleanup()

    section("Teacher login + create video")
    code, data = request(
        "POST",
        "/teacher/auth/login",
        body={"email": TEACHER[0], "password": TEACHER[1]},
    )
    assert code == 200, data
    teacher_token = data["access_token"]

    code, v = request(
        "POST",
        "/teacher/videos",
        token=teacher_token,
        body={
            "class_subject_id": CLASS_SUBJECT_ID,
            "title": "Smoke 15.2",
            "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "description": "Tracking video",
        },
    )
    assert code == 201, v
    video_id = v["id"]
    print(f"  video_id={video_id}")
    assert v["completion_count"] == 0
    assert v["eligible_student_count"] >= 1

    section("Parent login + initial list")
    code, data = request(
        "POST",
        "/parent/auth/login",
        body={"email": PARENT[0], "password": PARENT[1]},
    )
    assert code == 200, data
    parent_token = data["access_token"]

    code, items = request(
        "GET", f"/parent/me/children/{STUDENT_ID}/videos", token=parent_token
    )
    assert code == 200, items
    mine = next((it for it in items if it["id"] == video_id), None)
    assert mine is not None, items
    print(f"  parent sees video, is_completed={mine['is_completed']} count={mine['completion_count']}")
    assert mine["is_completed"] is False
    assert mine["completion_count"] == 0

    section("Parent marks completed")
    code, mine = request(
        "POST",
        f"/parent/me/children/{STUDENT_ID}/videos/{video_id}/completion",
        token=parent_token,
    )
    assert code == 201, mine
    print(f"  is_completed={mine['is_completed']} count={mine['completion_count']}")
    assert mine["is_completed"] is True
    assert mine["completion_count"] == 1

    section("Idempotent: mark again returns same state")
    code, mine = request(
        "POST",
        f"/parent/me/children/{STUDENT_ID}/videos/{video_id}/completion",
        token=parent_token,
    )
    assert code == 201, mine
    assert mine["completion_count"] == 1, mine

    section("Foreign child rejected (not linked to this parent)")
    code, body_ = request(
        "POST",
        f"/parent/me/children/{OTHER_CHILD_ID}/videos/{video_id}/completion",
        token=parent_token,
    )
    print(f"  {code} {body_.get('detail') if isinstance(body_, dict) else ''}")
    assert code == 404, body_

    section("Teacher fetches completion roster")
    code, roster = request(
        "GET", f"/teacher/videos/{video_id}/completions", token=teacher_token
    )
    assert code == 200, roster
    print(
        f"  completion_count={roster['completion_count']} "
        f"eligible={roster['eligible_student_count']} "
        f"rows={len(roster['rows'])}"
    )
    assert roster["completion_count"] == 1
    assert roster["eligible_student_count"] == len(roster["rows"])
    aarav_row = next(r for r in roster["rows"] if r["student_id"] == STUDENT_ID)
    assert aarav_row["completed"] is True
    assert aarav_row["completed_at"] is not None
    not_completed = [r for r in roster["rows"] if not r["completed"]]
    print(f"  Aarav marked. Others not watched: {len(not_completed)}")

    section("Parent unmarks → count drops")
    code, _ = request(
        "DELETE",
        f"/parent/me/children/{STUDENT_ID}/videos/{video_id}/completion",
        token=parent_token,
    )
    assert code == 204, _

    code, items = request(
        "GET", f"/parent/me/children/{STUDENT_ID}/videos", token=parent_token
    )
    assert code == 200, items
    mine = next((it for it in items if it["id"] == video_id), None)
    assert mine is not None
    assert mine["is_completed"] is False
    assert mine["completion_count"] == 0
    print(f"  after unmark: is_completed={mine['is_completed']} count={mine['completion_count']}")

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
