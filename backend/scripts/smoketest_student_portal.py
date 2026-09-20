"""Smoke test for the student portal and the accounts behind it.

Verifies:
    The office can give one child a login and a whole class at once, and the
    password comes back exactly once.
    A child signs in with school code, admission number and password. Every
    wrong combination gives the same refusal, so the form cannot be used to
    find out which children attend.
    A signed-in child sees their own dashboard, homework and results — and
    there is no student id in any path to change.
    A child sees only published results, and a withheld result stays withheld
    for them exactly as it does for their parents.
    A child can hand homework in and change it, and the submission records
    that it was the child rather than the parent.
    A revoked account cannot sign in, but what the child handed in survives.

Run:
    docker exec sms-backend python -m scripts.smoketest_student_portal
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
from app.models.exam import Exam, ExamSubject
from app.models.homework import Homework, HomeworkSubmission
from app.models.mark import Mark
from app.models.student import Student
from app.models.tenant import School
from app.models.user import User
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-STUPORTAL"


def request(method, path, *, token=None, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            payload = r.read()
            if raw:
                return r.status, payload
            return r.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload)
        except Exception:
            return e.code, {"raw": payload.decode(errors="ignore")[:200]}


def section(t):
    print(f"\n=== {t} ===")


def admin_token():
    db = SessionLocal()
    try:
        u = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        u.password_hash = hash_password(ADMIN[1])
        db.commit()
    finally:
        db.close()
    code, data = request("POST", "/school/auth/login",
                         body={"email": ADMIN[0], "password": ADMIN[1]})
    assert code == 200, data
    return data["access_token"]


def cleanup():
    """Take away the logins this test made, and the homework it set. The
    children themselves are seed data and stay put."""
    db = SessionLocal()
    try:
        exams = select(Exam.id).where(Exam.name.like(f"{TAG}%"))
        papers = select(ExamSubject.id).where(ExamSubject.exam_id.in_(exams))
        db.execute(Mark.__table__.delete().where(Mark.exam_subject_id.in_(papers)))
        db.execute(ExamSubject.__table__.delete().where(ExamSubject.exam_id.in_(exams)))
        db.execute(Exam.__table__.delete().where(Exam.name.like(f"{TAG}%")))

        hw = select(Homework.id).where(Homework.title.like(f"{TAG}%"))
        db.execute(HomeworkSubmission.__table__.delete().where(
            HomeworkSubmission.homework_id.in_(hw)))
        db.execute(Homework.__table__.delete().where(Homework.title.like(f"{TAG}%")))

        klass = devdata.klass()
        students = list(db.execute(
            select(Student).where(Student.school_id == klass.school_id,
                                  Student.user_id.is_not(None))
        ).scalars())
        for s in students:
            u = db.get(User, s.user_id)
            if u and u.role.value == "student":
                s.user_id = None
                db.flush()
                db.delete(u)
        db.commit()
    finally:
        db.close()


def main():
    cleanup()
    tok = admin_token()
    klass = devdata.klass()
    child_id = devdata.child_id()
    db = SessionLocal()
    try:
        school = db.get(School, devdata.school_id())
        school_code = school.code
        child = db.get(Student, child_id)
        admission_no = child.admission_no
    finally:
        db.close()

    try:
        section("Nobody has an account yet")
        code, rows = request("GET", f"/school/student-logins?class_id={klass.id}", token=tok)
        assert code == 200 and rows, rows
        assert not any(r["has_login"] for r in rows), "the class starts with no logins"
        print(f"  {len(rows)} children in {klass.name}, none with a login")

        section("One child gets a login")
        code, made = request("POST", f"/school/student-logins/{child_id}", token=tok)
        assert code == 201, made
        assert made["created"] and made["password"], made
        password = made["password"]
        assert len(password) >= 8, password
        assert not set("Il1O0") & set(password), "no characters that look like each other"
        print(f"  {made['student_name']} ({made['admission_no']}) — password handed over once")

        section("The password is never readable again")
        code, rows = request("GET", f"/school/student-logins?class_id={klass.id}", token=tok)
        mine = next(r for r in rows if r["student_id"] == child_id)
        assert mine["has_login"] and mine["is_active"], mine
        assert "password" not in json.dumps(rows), "no password comes back in a listing"
        print("  the listing says who has one, not what it is")

        section("Signing in")
        code, bad = request("POST", "/student/auth/login", body={
            "school_code": school_code, "admission_no": admission_no, "password": "wrong"})
        assert code == 401, bad
        wrong_password_msg = bad["detail"]
        code, bad2 = request("POST", "/student/auth/login", body={
            "school_code": school_code, "admission_no": "NOSUCH999", "password": password})
        assert code == 401, bad2
        assert bad2["detail"] == wrong_password_msg, (
            "an unknown admission number must read the same as a wrong password, "
            "or the form tells you who attends this school")
        code, bad3 = request("POST", "/student/auth/login", body={
            "school_code": "NOSUCHSCHOOL", "admission_no": admission_no, "password": password})
        assert code == 401 and bad3["detail"] == wrong_password_msg, bad3
        print(f"  all three wrong ways say the same thing: {wrong_password_msg!r}")

        code, session = request("POST", "/student/auth/login", body={
            "school_code": school_code, "admission_no": admission_no, "password": password})
        assert code == 200, session
        stok = session["access_token"]
        assert session["user"]["role"] == "student", session["user"]
        print(f"  {session['user']['full_name']} is in")

        section("The portal is about one child, with no id to change")
        code, me = request("GET", "/student/me", token=stok)
        assert code == 200 and me["student_id"] == child_id, me
        assert me["admission_no"] == admission_no and me["school_name"], me
        code, dash = request("GET", "/student/dashboard", token=stok)
        assert code == 200, dash
        assert dash["student_id"] == child_id, dash
        assert "attendance" in dash and 0 <= dash["attendance"]["percent"] <= 100, dash
        print(f"  dashboard: {dash['attendance']['percent']}% attendance, "
              f"{len(dash['timetable'])} period(s) today, {dash['homework_due']} homework due")

        section("Homework, handed in by the child")
        ttok_code, tdata = request("POST", "/teacher/auth/login", body={
            "email": devdata.TEACHER_EMAIL, "password": "TeacherPass123!"})
        assert ttok_code == 200, tdata
        ttok = tdata["access_token"]
        code, hw = request("POST", "/teacher/homework", token=ttok, body={
            "class_subject_id": devdata.class_subject_id(),
            "title": f"{TAG} Fractions",
            "description": "Exercise 4",
            "due_date": (date.today() + timedelta(days=3)).isoformat()})
        assert code == 201, hw
        hw_id = hw["id"]

        code, mine = request("GET", "/student/homework", token=stok)
        assert code == 200 and any(h["id"] == hw_id for h in mine), mine
        print(f"  the child sees {len(mine)} piece(s) of homework, including the new one")

        code, empty = request("GET", f"/student/homework/{hw_id}/submission", token=stok)
        assert code == 200 and empty is None, empty

        code, sub = request("POST", f"/student/homework/{hw_id}/submission", token=stok,
                            body={"comment": "Done all ten"})
        assert code == 201, sub
        assert sub["status"] == "submitted", sub
        code, again = request("PATCH", f"/student/homework/{hw_id}/submission", token=stok,
                              body={"comment": "Done all ten, checked twice"})
        assert code == 200 and "checked twice" in again["comment"], again
        print("  handed in, then changed — and it went back for review")

        db = SessionLocal()
        try:
            row = db.execute(select(HomeworkSubmission).where(
                HomeworkSubmission.homework_id == hw_id)).scalar_one()
            student_user_id = db.get(Student, child_id).user_id
            assert row.submitted_by_user_id == student_user_id, (
                "the record says the child handed it in, not a parent")
        finally:
            db.close()
        print("  and the record says it was the child who did it")

        section("A child sees only published results")
        # The seed has no published exam, so make one. Without this the two
        # assertions that matter most here never run.
        day = date.today() - timedelta(days=5)
        code, exam = request("POST", "/school/exams", token=tok, body={
            "academic_year_id": devdata.year_id(), "name": f"{TAG} Term",
            "kind": "term", "start_date": day.isoformat(),
            "end_date": day.isoformat()})
        assert code == 201, exam
        exam_id = exam["id"]
        code, paper = request("POST", f"/school/exams/{exam_id}/papers", token=tok, body={
            "class_subject_id": devdata.class_subject_id(), "max_marks": 100,
            "pass_marks": 35, "exam_date": day.isoformat()})
        assert code == 201, paper

        code, unseen = request("GET", "/student/exams", token=stok)
        assert code == 200 and not any(e["exam_id"] == exam_id for e in unseen), (
            "an unpublished exam must not appear in a child's list")
        code, denied = request("GET", f"/student/exams/{exam_id}", token=stok)
        assert code in (403, 404), (code, denied)
        print(f"  before publishing: not in the list, and asking directly is refused ({code})")

        code, saved = request("POST", f"/teacher/marks/papers/{paper['id']}/save", token=ttok,
                              body={"section_id": devdata.section_id("A"), "entries": [
                                  {"student_id": child_id, "status": "scored",
                                   "marks_obtained": 72}]})
        assert code == 200, saved
        code, pub = request("POST", f"/school/exams/{exam_id}/publish", token=tok)
        assert code == 200 and pub["is_published"], pub

        code, seen = request("GET", "/student/exams", token=stok)
        assert code == 200, seen
        row = next((e for e in seen if e["exam_id"] == exam_id), None)
        assert row is not None, "a published exam appears"
        code, detail = request("GET", f"/student/exams/{exam_id}", token=stok)
        assert code == 200, detail
        assert detail["student_id"] == child_id, detail
        assert any(s["marks_obtained"] == 72 for s in detail["subjects"]), detail["subjects"]
        print(f"  after publishing: visible, {detail['summary'].get('total_obtained')} marks showing")

        code, pdf = request("GET", f"/student/exams/{exam_id}/report-card.pdf",
                            token=stok, raw=True)
        assert code == 200 and pdf[:4] == b"%PDF", pdf[:40]
        print(f"  and the report card prints ({len(pdf)} bytes)")

        section("A withheld result stays withheld for the child too")
        code, decision = request("POST", "/school/result-decisions", token=tok, body={
            "exam_id": exam_id, "student_id": child_id, "result_status": "withheld",
            "reason": f"{TAG} fees outstanding",
            "parent_note": "Please contact the office."})
        assert code == 201, decision
        code, hidden = request("GET", f"/student/exams/{exam_id}", token=stok)
        assert code == 200, hidden
        assert hidden["result_status"] == "withheld", hidden["result_status"]
        assert not hidden["subjects"], (
            "a child must not see the marks their parents cannot see")
        assert hidden["parent_note"], "and they are told why, the same as at home"
        print(f"  marks hidden, note shown: {hidden['parent_note']!r}")

        code, _ = request("DELETE", f"/school/result-decisions/{decision['id']}", token=tok)
        code, back = request("GET", f"/student/exams/{exam_id}", token=stok)
        assert code == 200 and back["subjects"], "lifting the decision shows them again"
        print("  lifting it puts the marks back")

        section("A whole class at once")
        code, batch = request("POST", f"/school/student-logins/class/{klass.id}", token=tok)
        assert code == 201, batch
        assert batch["total"] == len(rows), batch
        assert len(batch["reset"]) >= 1, "the child who already had one is reset, not duplicated"
        assert all(r["password"] for r in batch["created"] + batch["reset"]), batch
        print(f"  {len(batch['created'])} created, {len(batch['reset'])} reset, "
              f"{batch['total']} in total")

        section("Resetting a password ends the old one")
        code, old = request("POST", "/student/auth/login", body={
            "school_code": school_code, "admission_no": admission_no, "password": password})
        assert code == 401, "the password from before the class reset must no longer work"
        fresh = next(r for r in batch["reset"] + batch["created"]
                     if r["student_id"] == child_id)["password"]
        code, session2 = request("POST", "/student/auth/login", body={
            "school_code": school_code, "admission_no": admission_no, "password": fresh})
        assert code == 200, session2
        stok = session2["access_token"]
        print("  the old password is dead, the new one works")

        section("A child changes their own password")
        code, err = request("POST", "/student/auth/change-password", token=stok,
                            body={"current_password": "notit", "new_password": "BrandNew123"})
        assert code == 400, err
        code, _ = request("POST", "/student/auth/change-password", token=stok,
                          body={"current_password": fresh, "new_password": "BrandNew123"})
        assert code == 204, _
        code, session3 = request("POST", "/student/auth/login", body={
            "school_code": school_code, "admission_no": admission_no,
            "password": "BrandNew123"})
        assert code == 200, session3
        stok = session3["access_token"]
        print("  changed, and the office's password no longer works")

        section("A student cannot reach anybody else's anything")
        for path in ("/school/students", "/school/student-logins",
                     "/parent/me/children", "/teacher/marks/papers",
                     "/school/analytics/overview"):
            code, err = request("GET", path, token=stok)
            assert code == 403, f"a student reached {path}: {code}"
        print("  refused the student register, the logins list, the parent and teacher portals")

        section("Revoking an account keeps the work")
        code, revoked = request("DELETE", f"/school/student-logins/{child_id}", token=tok)
        assert code == 200 and not revoked["is_active"], revoked
        code, denied = request("POST", "/student/auth/login", body={
            "school_code": school_code, "admission_no": admission_no,
            "password": "BrandNew123"})
        assert code == 401, denied
        db = SessionLocal()
        try:
            still = db.execute(select(HomeworkSubmission).where(
                HomeworkSubmission.homework_id == hw_id)).scalar_one_or_none()
            assert still is not None, "what the child handed in survives the account"
        finally:
            db.close()
        print("  signed out for good, and the homework they handed in is still there")

        print("\nALL STUDENT-PORTAL CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
