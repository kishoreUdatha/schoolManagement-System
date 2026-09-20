"""Stories 10.1 + 10.2 smoke test."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.project import Project, ProjectProgress
from app.models.user import User
from scripts import devdata


BASE = "http://localhost:8000/api/v1"
TEACHER = ("iyer@dev.local", "TeacherPass123!")
PARENT = ("sharma@dev.local", "ParentPass123!")
CLASS_SUBJECT_ID = devdata.class_subject_id()
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


def cleanup():
    db = SessionLocal()
    try:
        for p in db.execute(
            select(Project).where(Project.title == "Smoke 10.1")
        ).scalars().all():
            db.execute(
                ProjectProgress.__table__.delete().where(
                    ProjectProgress.project_id == p.id
                )
            )
            db.delete(p)
        db.commit()
    finally:
        db.close()


def main():
    section("RESET + cleanup")
    reset_passwords()
    cleanup()

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

    section("Teacher creates project (notify_parents=true)")
    code, p = request(
        "POST",
        "/teacher/projects",
        token=t_token,
        body={
            "class_subject_id": CLASS_SUBJECT_ID,
            "title": "Smoke 10.1",
            "description": "Build a solar-system poster.",
            "deadline": (date.today() + timedelta(days=14)).isoformat(),
            "kind": "individual",
            "notify_parents": True,
        },
    )
    assert code == 201, p
    project_id = p["id"]
    print(f"  project_id={project_id} eligible={p['eligible_student_count']}")

    section("Parent: list child projects, get initial progress")
    code, items = request(
        "GET", f"/parent/me/children/{STUDENT_ID}/projects", token=p_token
    )
    assert code == 200, items
    assert any(it["id"] == project_id for it in items), items

    code, body_ = request(
        "GET",
        f"/parent/me/children/{STUDENT_ID}/projects/{project_id}/progress",
        token=p_token,
    )
    print(f"  initial progress: {body_}")
    assert code == 200, body_
    assert body_ is None

    section("Parent: in_progress with comment")
    code, pp = request(
        "POST",
        f"/parent/me/children/{STUDENT_ID}/projects/{project_id}/progress",
        token=p_token,
        body={"status": "in_progress", "comment": "Started today"},
    )
    assert code == 200, pp
    assert pp["status"] == "in_progress"
    progress_id = pp["id"]

    section("Parent: submit with attachment")
    code, pp = request(
        "POST",
        f"/parent/me/children/{STUDENT_ID}/projects/{project_id}/progress",
        token=p_token,
        body={
            "status": "submitted",
            "attachment_url": "https://example.com/poster.pdf",
            "comment": "Final submission",
        },
    )
    assert code == 200, pp
    assert pp["status"] == "submitted"
    assert pp["attachment_url"] == "https://example.com/poster.pdf"
    assert pp["submitted_at"]

    section("Teacher: roster shows submitted")
    code, roster = request(
        "GET", f"/teacher/projects/{project_id}/progress", token=t_token
    )
    assert code == 200, roster
    submitted = [r for r in roster if r["status"] == "submitted"]
    print(f"  roster size={len(roster)} submitted={len(submitted)}")
    assert len(submitted) == 1
    assert submitted[0]["student_id"] == STUDENT_ID

    section("Teacher: review with remark + rating")
    code, pp = request(
        "PATCH",
        f"/teacher/projects/progress/{progress_id}/review",
        token=t_token,
        body={"teacher_remark": "Great effort!", "rating": 5},
    )
    assert code == 200, pp
    assert pp["status"] == "reviewed"
    assert pp["rating"] == 5

    section("Parent re-edit resets review")
    code, pp = request(
        "POST",
        f"/parent/me/children/{STUDENT_ID}/projects/{project_id}/progress",
        token=p_token,
        body={"comment": "Updated note"},
    )
    assert code == 200, pp
    assert pp["teacher_remark"] is None
    assert pp["rating"] is None

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
