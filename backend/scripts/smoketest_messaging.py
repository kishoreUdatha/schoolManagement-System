"""Story 17.2 smoke test."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.messaging import Conversation, Message
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
TEACHER = ("iyer@dev.local", "TeacherPass123!")
PARENT = ("sharma@dev.local", "ParentPass123!")
STUDENT_ID = 1


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
        # Remove any test conversations
        convs = db.execute(select(Conversation).where(
            Conversation.student_id == STUDENT_ID
        )).scalars().all()
        for c in convs:
            db.execute(Message.__table__.delete().where(Message.conversation_id == c.id))
            db.delete(c)
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
    teacher_id = data["user"]["id"]
    t_token = data["access_token"]

    code, data = request(
        "POST",
        "/parent/auth/login",
        body={"email": PARENT[0], "password": PARENT[1]},
    )
    assert code == 200, data
    p_token = data["access_token"]

    section("Parent: teacher contacts for child")
    code, contacts = request(
        "GET",
        f"/parent/me/children/{STUDENT_ID}/teacher-contacts",
        token=p_token,
    )
    assert code == 200, contacts
    print(f"  contacts: {[c['teacher_name'] for c in contacts]}")
    assert any(c["teacher_user_id"] == teacher_id for c in contacts)

    section("Parent starts conversation")
    code, conv = request(
        "POST",
        "/parent/me/conversations",
        token=p_token,
        body={
            "teacher_user_id": teacher_id,
            "student_id": STUDENT_ID,
            "body": "Hi, how is Aarav doing in maths?",
        },
    )
    assert code == 201, conv
    conv_id = conv["id"]
    assert conv["unread_for_viewer"] == 0  # parent's own message
    print(f"  conv_id={conv_id}")

    section("Teacher sees it in inbox with 1 unread")
    code, inbox = request("GET", "/teacher/conversations", token=t_token)
    assert code == 200, inbox
    teacher_view = next(c for c in inbox if c["id"] == conv_id)
    assert teacher_view["unread_for_viewer"] == 1, teacher_view

    section("Teacher reads messages")
    code, msgs = request(
        "GET", f"/teacher/conversations/{conv_id}/messages", token=t_token
    )
    assert code == 200, msgs
    assert len(msgs) == 1
    assert msgs[0]["body"].startswith("Hi, how is Aarav")
    assert msgs[0]["sender_role"] == "parent"

    section("Teacher marks read → unread=0")
    code, conv = request(
        "POST", f"/teacher/conversations/{conv_id}/mark-read", token=t_token
    )
    assert code == 200, conv
    assert conv["unread_for_viewer"] == 0

    section("Teacher replies")
    code, m = request(
        "POST",
        f"/teacher/conversations/{conv_id}/messages",
        token=t_token,
        body={"body": "He's doing well! Strong on multiplication."},
    )
    assert code == 201, m
    assert m["sender_role"] == "teacher"

    section("Parent sees 1 unread")
    code, inbox = request("GET", "/parent/me/conversations", token=p_token)
    parent_view = next(c for c in inbox if c["id"] == conv_id)
    assert parent_view["unread_for_viewer"] == 1, parent_view

    section("Second message from parent reuses same conversation")
    code, conv2 = request(
        "POST",
        "/parent/me/conversations",
        token=p_token,
        body={
            "teacher_user_id": teacher_id,
            "student_id": STUDENT_ID,
            "body": "Thanks!",
        },
    )
    assert code == 201, conv2
    assert conv2["id"] == conv_id  # same conversation

    code, msgs = request(
        "GET", f"/parent/me/conversations/{conv_id}/messages", token=p_token
    )
    assert code == 200, msgs
    assert len(msgs) == 3

    section("Cross-access guard: a foreign teacher cannot read this thread")
    # No second teacher in seed; skip
    print("  (only one teacher account, skip)")

    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
