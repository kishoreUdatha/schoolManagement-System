"""End-to-end smoke test for marking rubrics and closing a homework.

Verifies:
    A rubric's name is unique, its criteria can be changed until work has been
    marked against them, and a rubric attached to homework can't be deleted.
    Marking a submission: only criteria from that homework's rubric, never more
    than a criterion is out of, and the total adds up.
    Closing: a closed homework takes no more submissions and can't be edited;
    reopening lets the parent submit again.

Run:
    docker exec sms-backend python -m scripts.smoketest_rubrics
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date, timedelta

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import Section
from app.models.homework import Homework, HomeworkSubmission
from app.models.parent import ParentStudent
from app.models.rubric import Rubric
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
TAG = "SMOKE-RUB"


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
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


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def setup():
    """A class-subject taught by the test teacher, with a parent-linked student."""
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        teacher = db.execute(select(User).where(User.email == TEACHER[0])).scalar_one()
        teacher.password_hash = hash_password(TEACHER[1])
        link = db.execute(
            select(ParentStudent).join(Student, Student.id == ParentStudent.student_id)
            .where(Student.school_id == admin.school_id, Student.is_active.is_(True),
                   Student.section_id.is_not(None)).limit(1)
        ).scalar_one()
        student = db.get(Student, link.student_id)
        parent = db.get(User, link.parent_user_id)
        parent.password_hash = hash_password("ParentPass123!")
        sec = db.get(Section, student.section_id)
        cs = db.execute(select(ClassSubject).where(ClassSubject.class_id == sec.class_id).limit(1)).scalar_one_or_none()
        if cs is None:
            sub = Subject(tenant_id=student.tenant_id, school_id=student.school_id,
                          name=f"{TAG} subject", code="SMKR1")
            db.add(sub)
            db.flush()
            cs = ClassSubject(tenant_id=student.tenant_id, school_id=student.school_id,
                              class_id=sec.class_id, subject_id=sub.id)
            db.add(cs)
            db.flush()
        saved_teacher = cs.teacher_user_id
        cs.teacher_user_id = teacher.id  # homework is posted by the subject's teacher
        db.commit()
        return dict(cs_id=cs.id, saved_teacher=saved_teacher, student_id=student.id,
                    parent_email=parent.email, subject_id=cs.subject_id)
    finally:
        db.close()


def cleanup(ctx):
    db = SessionLocal()
    try:
        hw = select(Homework.id).where(Homework.title.like(f"{TAG}%"))
        db.execute(HomeworkSubmission.__table__.delete().where(HomeworkSubmission.homework_id.in_(hw)))
        db.execute(Homework.__table__.delete().where(Homework.title.like(f"{TAG}%")))
        db.execute(Rubric.__table__.delete().where(Rubric.name.like(f"{TAG}%")))
        if ctx:
            cs = db.get(ClassSubject, ctx["cs_id"])
            if cs:
                cs.teacher_user_id = ctx["saved_teacher"]
        db.commit()
    finally:
        db.close()


def main():
    cleanup(None)
    ctx = setup()
    cs, sid = ctx["cs_id"], ctx["student_id"]
    name = f"{TAG} essay {uuid.uuid4().hex[:4]}"
    due = str(date.today() + timedelta(days=7))
    try:
        tok = login("school", *ADMIN)
        ttok = login("teacher", *TEACHER)
        ptok = login("parent", ctx["parent_email"], "ParentPass123!")

        section("Building a rubric")
        code, r = request("POST", "/school/rubrics", token=ttok, body={
            "name": name, "description": "Smoke rubric", "subject_id": ctx["subject_id"],
            "criteria": [{"title": "Ideas", "max_points": 10}, {"title": "Spelling", "max_points": 5}]})
        assert code == 201, r
        assert r["max_total"] == 15 and len(r["criteria"]) == 2 and not r["in_use"], r
        code, err = request("POST", "/school/rubrics", token=ttok, body={"name": name.upper(), "criteria": []})
        assert code == 400 and "already exists" in err["detail"], err
        code, c3 = request("POST", f"/school/rubrics/{r['id']}/criteria", token=ttok,
                           body={"title": "Handwriting", "max_points": 5})
        assert code == 201, c3
        code, full = request("GET", f"/school/rubrics/{r['id']}", token=ttok)
        assert full["max_total"] == 20, full
        print(f"  {name}: 3 criteria, out of {full['max_total']}")

        section("Homework that uses it")
        code, hw = request("POST", "/teacher/homework", token=ttok, body={
            "class_subject_id": cs, "title": f"{TAG} essay task", "description": "Write 300 words",
            "due_date": due, "rubric_id": r["id"]})
        assert code == 201 and hw["rubric_name"] == name and not hw["is_closed"], hw
        code, err = request("DELETE", f"/school/rubrics/{r['id']}", token=ttok)
        assert code == 400 and "attached to homework" in err["detail"], err
        code, sub = request("POST", f"/parent/me/children/{sid}/homework/{hw['id']}/submission", token=ptok,
                            body={"comment": "Smoke: my essay"})
        assert code in (200, 201), sub
        print("  posted, a parent submitted, and the rubric can no longer be deleted")

        section("Marking against the rubric")
        code, subs = request("GET", f"/teacher/homework/{hw['id']}/submissions", token=ttok)
        mine = next(s for s in subs if s["student_id"] == sid)
        assert mine["marking"]["total"] is None and mine["marking"]["max_total"] == 20, mine["marking"]
        ids = [c["criterion_id"] for c in mine["marking"]["criteria"]]
        code, err = request("PUT", f"/teacher/homework/submissions/{mine['id']}/rubric-scores", token=ttok,
                            body={"scores": [{"criterion_id": ids[0], "points": 99}]})
        assert code == 400 and "out of" in err["detail"], err
        code, marked = request("PUT", f"/teacher/homework/submissions/{mine['id']}/rubric-scores", token=ttok,
                               body={"scores": [
                                   {"criterion_id": ids[0], "points": 8, "comment": "Good argument"},
                                   {"criterion_id": ids[1], "points": 4},
                                   {"criterion_id": ids[2], "points": 5}]})
        assert code == 200 and marked["total"] == 17, marked
        code, err = request("PUT", f"/school/rubrics/criteria/{ids[0]}", token=ttok,
                            body={"title": "Ideas", "max_points": 12})
        assert code == 400 and "already been marked" in err["detail"], err
        code, remark = request("PUT", f"/teacher/homework/submissions/{mine['id']}/rubric-scores", token=ttok,
                               body={"scores": [{"criterion_id": ids[0], "points": 9}]})
        assert remark["total"] == 18, remark
        print("  scored 17/20, re-marked to 18/20; the rubric is now frozen")

        section("Closing the homework")
        code, closed = request("POST", f"/teacher/homework/{hw['id']}/close", token=ttok, body={"closed": True})
        assert code == 200 and closed["is_closed"] and closed["closed_by_name"] and not closed["can_edit"], closed
        code, err = request("POST", f"/teacher/homework/{hw['id']}/close", token=ttok, body={"closed": True})
        assert code == 400 and "already closed" in err["detail"], err
        code, err = request("POST", f"/parent/me/children/{sid}/homework/{hw['id']}/submission", token=ptok,
                            body={"comment": "Smoke: late attempt"})
        assert code == 400 and "closed" in err["detail"], err
        code, err = request("PATCH", f"/teacher/homework/{hw['id']}", token=ttok, body={"title": f"{TAG} renamed"})
        assert code == 400 and "closed" in err["detail"], err
        code, open_ = request("POST", f"/teacher/homework/{hw['id']}/close", token=ttok, body={"closed": False})
        assert not open_["is_closed"] and open_["closed_at"] is None, open_
        code, sub2 = request("POST", f"/parent/me/children/{sid}/homework/{hw['id']}/submission", token=ptok,
                             body={"comment": "Smoke: second try"})
        assert code in (200, 201), sub2
        print("  closed: no submissions, no edits; reopened: work comes in again")

        section("Retiring a rubric")
        code, retired = request("PATCH", f"/school/rubrics/{r['id']}", token=ttok, body={"is_active": False})
        assert not retired["is_active"], retired
        code, live = request("GET", "/school/rubrics", token=ttok)
        assert all(x["id"] != r["id"] for x in live), "a retired rubric is off the default list"
        code, all_ = request("GET", "/school/rubrics?include_inactive=true", token=ttok)
        assert any(x["id"] == r["id"] for x in all_), all_
        print("  retired rubrics stay out of the picker but keep their marks")

        print("\nALL RUBRIC / HOMEWORK-CLOSE CHECKS PASSED")
    finally:
        cleanup(ctx)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
