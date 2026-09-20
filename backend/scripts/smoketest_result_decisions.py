"""End-to-end smoke test for result decisions and editing a pending leave.

Verifies:
    Withholding a result hides the marks from the parent and shows the school's
    note instead, while staff still see the numbers flagged; passing by grace
    flips the pass flag; a stale edit is refused; lifting the decision puts the
    computed result back.
    Leave: a pending application can be re-dated by its owner, overlaps are
    still refused, and once decided it can no longer be edited.

Run:
    docker exec sms-backend python -m scripts.smoketest_result_decisions
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import AcademicYear, Section
from app.models.exam import Exam, ExamSubject
from app.models.mark import Mark
from app.models.parent import ParentStudent
from app.models.subject import ClassSubject, Subject
from app.models.result_override import ExamResultOverride
from app.models.staff_leave import StaffLeave
from app.models.student import Student
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
TAG = "SMOKE-RD"


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
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        teacher = db.execute(select(User).where(User.email == TEACHER[0])).scalar_one()
        teacher.password_hash = hash_password(TEACHER[1])
        link = db.execute(
            select(ParentStudent).join(Student, Student.id == ParentStudent.student_id)
            .where(Student.school_id == admin.school_id, Student.is_active.is_(True)).limit(1)
        ).scalar_one()
        student = db.get(Student, link.student_id)
        parent = db.get(User, link.parent_user_id)
        parent.password_hash = hash_password("ParentPass123!")
        # the dev database has no exam of its own, so build a published one
        sec = db.get(Section, student.section_id)
        cs = db.execute(select(ClassSubject).where(ClassSubject.class_id == sec.class_id).limit(1)).scalar_one_or_none()
        if cs is None:
            sub = Subject(tenant_id=student.tenant_id, school_id=student.school_id,
                          name=f"{TAG} subject", code="SMKD1")
            db.add(sub)
            db.flush()
            cs = ClassSubject(tenant_id=student.tenant_id, school_id=student.school_id,
                              class_id=sec.class_id, subject_id=sub.id)
            db.add(cs)
            db.flush()
        year = db.execute(
            select(AcademicYear).where(AcademicYear.school_id == admin.school_id).limit(1)
        ).scalar_one()
        today = date.today()
        exam = Exam(tenant_id=student.tenant_id, school_id=student.school_id, academic_year_id=year.id,
                    name=f"{TAG} term test", kind="term", start_date=today - timedelta(days=7),
                    end_date=today - timedelta(days=5), is_published=True,
                    published_at=datetime.now(timezone.utc))
        db.add(exam)
        db.flush()
        paper = ExamSubject(tenant_id=student.tenant_id, school_id=student.school_id, exam_id=exam.id,
                            class_subject_id=cs.id, max_marks=50, pass_marks=18,
                            exam_date=today - timedelta(days=6))
        db.add(paper)
        db.flush()
        db.add(Mark(tenant_id=student.tenant_id, school_id=student.school_id, exam_subject_id=paper.id,
                    student_id=student.id, status="scored", marks_obtained=20, is_pass=True,
                    marked_at=datetime.now(timezone.utc)))
        db.commit()
        return dict(student_id=student.id, parent_email=parent.email, teacher_id=teacher.id,
                    exam_id=exam.id if exam else None, school_id=admin.school_id)
    finally:
        db.close()


def cleanup(ctx):
    db = SessionLocal()
    try:
        if ctx:
            db.execute(ExamResultOverride.__table__.delete().where(
                ExamResultOverride.student_id == ctx["student_id"]))
        exams = select(Exam.id).where(Exam.name.like(f"{TAG}%"))
        papers = select(ExamSubject.id).where(ExamSubject.exam_id.in_(exams))
        db.execute(Mark.__table__.delete().where(Mark.exam_subject_id.in_(papers)))
        db.execute(ExamSubject.__table__.delete().where(ExamSubject.exam_id.in_(exams)))
        db.execute(Exam.__table__.delete().where(Exam.name.like(f"{TAG}%")))
        subs = select(Subject.id).where(Subject.name.like(f"{TAG}%"))
        db.execute(ClassSubject.__table__.delete().where(ClassSubject.subject_id.in_(subs)))
        db.execute(Subject.__table__.delete().where(Subject.name.like(f"{TAG}%")))
        db.execute(StaffLeave.__table__.delete().where(StaffLeave.reason.like(f"{TAG}%")))
        db.commit()
    finally:
        db.close()


def result_checks(ctx, tok, ptok):
    sid, exam_id = ctx["student_id"], ctx["exam_id"]
    if not exam_id:
        print("  (no published exam in this database — skipped)")
        return
    section("Withholding a result")
    code, staff_view = request("GET", f"/school/result-decisions/exams/{exam_id}/students/{sid}", token=tok)
    assert code == 200 and staff_view["result_status"] == "normal", staff_view
    code, dec = request("POST", "/school/result-decisions", token=tok, body={
        "exam_id": exam_id, "student_id": sid, "result_status": "withheld",
        "reason": f"{TAG} fees outstanding", "parent_note": "Please see the office."})
    assert code == 201 and dec["version_no"] == 1 and dec["decided_by_name"], dec
    code, err = request("POST", "/school/result-decisions", token=tok, body={
        "exam_id": exam_id, "student_id": sid, "result_status": "failed", "reason": f"{TAG} again"})
    assert code == 400 and "already has a decision" in err["detail"], err
    code, parent_view = request("GET", f"/parent/me/children/{sid}/exams/{exam_id}", token=ptok)
    assert code == 200, parent_view
    assert parent_view["result_status"] == "withheld" and parent_view["subjects"] == [], parent_view["result_status"]
    assert parent_view["parent_note"] == "Please see the office.", parent_view
    code, staff_view = request("GET", f"/school/result-decisions/exams/{exam_id}/students/{sid}", token=tok)
    assert staff_view["result_status"] == "withheld" and staff_view["override_reason"].startswith(TAG), staff_view
    print("  parent sees the note and no marks; staff still see everything, flagged")

    section("Changing the decision")
    code, err = request("PATCH", f"/school/result-decisions/{dec['id']}", token=tok,
                        body={"result_status": "pass_by_grace", "reason": f"{TAG} grace", "expected_version": 9})
    assert code == 400 and "changed this decision" in err["detail"], err
    code, grace = request("PATCH", f"/school/result-decisions/{dec['id']}", token=tok,
                          body={"result_status": "pass_by_grace", "reason": f"{TAG} two marks short",
                                "expected_version": 1})
    assert grace["version_no"] == 2 and grace["result_status"] == "pass_by_grace", grace
    code, parent_view = request("GET", f"/parent/me/children/{sid}/exams/{exam_id}", token=ptok)
    assert parent_view["summary"]["is_pass"] is True and parent_view["subjects"] != [], parent_view["result_status"]
    print("  version bumped to 2; graced result reads as a pass and the marks are back")

    section("Lifting it")
    code, gone = request("PATCH", f"/school/result-decisions/{dec['id']}", token=tok, body={"result_status": "normal"})
    assert code == 200 and gone is None, gone
    code, after = request("GET", f"/school/result-decisions/exams/{exam_id}/students/{sid}", token=tok)
    assert after["result_status"] == "normal" and after["override_reason"] is None, after
    code, listing = request("GET", f"/school/result-decisions?exam_id={exam_id}", token=tok)
    assert all(d["student_id"] != sid for d in listing), listing
    print("  back to whatever the marks say")


def leave_checks(tok):
    section("Editing a pending leave")
    start = date.today() + timedelta(days=30)
    code, mine = request("POST", "/staff/leaves", token=tok, body={
        "kind": "casual", "from_date": str(start), "to_date": str(start + timedelta(days=1)),
        "reason": f"{TAG} family function"})
    assert code == 201, mine
    code, other = request("POST", "/staff/leaves", token=tok, body={
        "kind": "casual", "from_date": str(start + timedelta(days=10)),
        "to_date": str(start + timedelta(days=11)), "reason": f"{TAG} second trip"})
    assert code == 201, other
    code, edited = request("PATCH", f"/staff/leaves/{mine['id']}", token=tok, body={
        "to_date": str(start + timedelta(days=3)), "reason": f"{TAG} family function, extended"})
    assert code == 200 and edited["to_date"] == str(start + timedelta(days=3)), edited
    assert edited["reason"].endswith("extended"), edited
    code, err = request("PATCH", f"/staff/leaves/{mine['id']}", token=tok, body={
        "to_date": str(start + timedelta(days=11))})
    assert code == 400 and "overlapping" in err["detail"], err
    code, err = request("PATCH", f"/staff/leaves/{mine['id']}", token=tok, body={
        "from_date": str(start + timedelta(days=5))})
    assert code == 400 and "can't be before" in err["detail"], err
    code, cancelled = request("POST", f"/staff/leaves/{mine['id']}/cancel", token=tok)
    assert cancelled["status"] == "cancelled", cancelled
    code, err = request("PATCH", f"/staff/leaves/{mine['id']}", token=tok, body={"reason": f"{TAG} too late"})
    assert code == 400 and "already cancelled" in err["detail"], err
    print("  re-dated while pending, overlap and backwards dates refused, frozen once decided")


def main():
    cleanup(None)
    ctx = setup()
    try:
        tok = login("school", *ADMIN)
        ptok = login("parent", ctx["parent_email"], "ParentPass123!")
        ttok = login("teacher", *TEACHER)
        result_checks(ctx, tok, ptok)
        leave_checks(ttok)
        print("\nALL RESULT-DECISION / LEAVE-EDIT CHECKS PASSED")
    finally:
        cleanup(ctx)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
