"""Smoke test for the last of the workflow actions.

Verifies:
    Marks entry can be closed and reopened, and a teacher can't save while it
    is shut. A paper is signed off by someone other than whoever entered the
    marks, and any change to the marks clears the sign-off.
    Published results are taken back with a reason and a revision number, not
    a quiet unpublish.
    A child leaving for another school closes their enrolment on the day they
    left, and dues have to be settled or consciously ignored.
    Reconciliation reports gateway orders against the fees they settled.

Run:
    docker exec sms-backend python -m scripts.smoketest_actions
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
from app.models.exam import Exam, ExamSubject
from app.models.fee import FeeHead, FeeStructure, StudentFee
from app.models.foundation import StudentEnrollment
from app.models.mark import Mark
from app.models.student import Student
from app.models.subject import ClassSubject
from app.models.user import User
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-ACT"


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
        for email, pw in ((ADMIN[0], ADMIN[1]), (devdata.TEACHER_EMAIL, "TeacherPass123!")):
            u = db.execute(select(User).where(User.email == email)).scalar_one()
            u.password_hash = hash_password(pw)
        db.commit()
    finally:
        db.close()


def cleanup():
    db = SessionLocal()
    try:
        exams = select(Exam.id).where(Exam.name.like(f"{TAG}%"))
        papers = select(ExamSubject.id).where(ExamSubject.exam_id.in_(exams))
        db.execute(Mark.__table__.delete().where(Mark.exam_subject_id.in_(papers)))
        db.execute(ExamSubject.__table__.delete().where(ExamSubject.exam_id.in_(exams)))
        db.execute(Exam.__table__.delete().where(Exam.name.like(f"{TAG}%")))
        heads = select(FeeHead.id).where(FeeHead.name.like(f"{TAG}%"))
        db.execute(StudentFee.__table__.delete().where(StudentFee.fee_head_id.in_(heads)))
        db.execute(FeeStructure.__table__.delete().where(FeeStructure.fee_head_id.in_(heads)))
        db.execute(FeeHead.__table__.delete().where(FeeHead.name.like(f"{TAG}%")))
        leaver = db.execute(
            select(Student).where(Student.full_name == devdata.OTHER_CHILD_NAME)
        ).scalar_one_or_none()
        if leaver:  # the transfer test marks them as left; put them back
            leaver.is_active = True
            db.execute(
                StudentEnrollment.__table__.delete().where(
                    StudentEnrollment.student_id == leaver.id,
                    StudentEnrollment.notes.like("%Left on%"),
                )
            )
        db.commit()
    finally:
        db.close()


def main():
    cleanup()
    setup()
    tok = login("school", *ADMIN)
    ttok = login("teacher", devdata.TEACHER_EMAIL, "TeacherPass123!")
    child = devdata.child_id()
    year = devdata.year_id()
    cs_id = devdata.class_subject_id()
    section_id = devdata.section_id("A")
    try:
        section("An exam with marks in it")
        code, exam = request("POST", "/school/exams", token=tok, body={
            "academic_year_id": year, "name": f"{TAG} Unit test", "kind": "unit_test",
            "start_date": str(date.today() - timedelta(days=2)), "end_date": str(date.today())})
        assert code == 201 and exam["marks_open"] and exam["revision_no"] == 1, exam
        code, paper = request("POST", f"/school/exams/{exam['id']}/papers", token=tok, body={
            "class_subject_id": cs_id, "max_marks": 50, "pass_marks": 18,
            "exam_date": str(date.today() - timedelta(days=1))})
        assert code == 201, paper
        code, saved = request("POST", f"/teacher/marks/papers/{paper['id']}/save", token=ttok, body={
            "section_id": section_id,
            "entries": [{"student_id": child, "status": "scored", "marks_obtained": 40}]})
        assert code == 200 and saved["saved"] == 1, saved
        print(f"  {exam['name']}: one paper, one mark")

        section("Closing marks entry")
        code, closed = request("POST", f"/school/exams/{exam['id']}/marks-window", token=tok, body={"open": False})
        assert code == 200 and not closed["marks_open"] and closed["marks_closed_at"], closed
        code, err = request("POST", f"/teacher/marks/papers/{paper['id']}/save", token=ttok, body={
            "section_id": section_id,
            "entries": [{"student_id": child, "status": "scored", "marks_obtained": 45}]})
        assert code == 400 and "Marks entry is closed" in err["detail"], err
        code, reopened = request("POST", f"/school/exams/{exam['id']}/marks-window", token=tok, body={"open": True})
        assert reopened["marks_open"], reopened
        print("  teacher refused while shut, allowed again once reopened")

        section("Verifying a paper")
        code, verified = request("POST", f"/school/exams/papers/{paper['id']}/verify", token=tok,
                                 body={"verified": True})
        assert code == 200 and verified["marks_verified_at"] and verified["marks_verified_count"] == 1, verified
        assert verified["marks_verified_by_name"], verified
        code, changed = request("POST", f"/teacher/marks/papers/{paper['id']}/save", token=ttok, body={
            "section_id": section_id,
            "entries": [{"student_id": child, "status": "scored", "marks_obtained": 44}]})
        assert code == 200, changed
        code, after = request("GET", f"/school/exams/{exam['id']}", token=tok)
        this_paper = next(p for p in after["papers"] if p["id"] == paper["id"])
        assert this_paper["marks_verified_at"] is None, "changed marks lose their sign-off"
        print("  signed off at 1 mark; the sign-off cleared when the mark changed")

        section("Only a second pair of eyes may verify")
        db = SessionLocal()
        try:
            teacher_id = devdata.user_id(devdata.TEACHER_EMAIL)
            for m in db.execute(select(Mark).where(Mark.exam_subject_id == paper["id"])).scalars():
                m.marked_by_user_id = teacher_id
            db.commit()
        finally:
            db.close()
        code, err = request("POST", f"/school/exams/papers/{paper['id']}/verify", token=ttok,
                            body={"verified": True})
        assert code in (400, 403), err
        if code == 400:
            assert "other than whoever entered" in err["detail"], err
        code, ok = request("POST", f"/school/exams/papers/{paper['id']}/verify", token=tok, body={"verified": True})
        assert code == 200 and ok["marks_verified_at"], ok
        print("  the teacher who entered them can't sign them off; the office can")

        section("Revising published results")
        code, published = request("POST", f"/school/exams/{exam['id']}/publish", token=tok)
        assert code == 200 and published["is_published"], published
        code, err = request("POST", f"/school/exams/{exam['id']}/marks-window", token=tok, body={"open": True})
        assert code == 400 and "unpublish or revise" in err["detail"], err
        code, err = request("POST", f"/school/exams/{exam['id']}/revise", token=tok, body={"reason": "typo"})
        assert code == 422, "a reason has to say something"
        code, revised = request("POST", f"/school/exams/{exam['id']}/revise", token=tok,
                                body={"reason": f"{TAG} one paper was marked out of the wrong total"})
        assert code == 200, revised
        assert revised["revision_no"] == 2 and not revised["is_published"] and revised["marks_open"], revised
        assert revised["revision_reason"].startswith(TAG) and revised["revised_at"], revised
        code, err = request("POST", f"/school/exams/{exam['id']}/revise", token=tok, body={"reason": f"{TAG} again"})
        assert code == 400 and "isn't published" in err["detail"], err
        print(f"  now revision {revised['revision_no']}, marks open again, reason on the record")

        section("A child leaving for another school")
        leaver = devdata.other_child_id()
        code, head = request("POST", "/school/fees/heads", token=tok, body={
            "name": f"{TAG} Term fee", "code": f"{TAG[:6]}F1", "is_recurring": True})
        assert code == 201, head
        code, structure = request("POST", "/school/fees/structures", token=tok, body={
            "academic_year_id": year, "class_id": devdata.klass().id,
            "fee_head_id": head["id"], "amount": "1000"})
        assert code == 201, structure
        code, gen = request("POST", "/school/fees/generate", token=tok,
                            body={"academic_year_id": year, "period": f"{date.today():%Y-%m}"})
        assert code == 200, gen
        code, err = request("POST", f"/school/students/{leaver}/transfer", token=tok, body={
            "to_school": "St Xavier's, Pune"})
        assert code == 400 and "still owes" in err["detail"], err
        left_on = date.today() - timedelta(days=3)
        code, gone = request("POST", f"/school/students/{leaver}/transfer", token=tok, body={
            "to_school": "St Xavier's, Pune", "left_on": str(left_on),
            "reason": f"{TAG} family moved", "ignore_dues": True})
        assert code == 200, gone
        assert gone["left_on"] == str(left_on) and float(gone["outstanding_dues"]) > 0, gone
        assert "St Xavier" in gone["note"], gone
        code, history = request("GET", f"/school/students/{leaver}/enrollments", token=tok)
        current = history[0]
        assert current["outcome"] == "left" and current["end_date"] == str(left_on), current
        code, err = request("POST", f"/school/students/{leaver}/transfer", token=tok, body={
            "to_school": "Somewhere else", "ignore_dues": True})
        assert code == 400 and "already left" in err["detail"], err
        print(f"  enrolment closed as 'left' on {left_on}, dues reported at {gone['outstanding_dues']}")

        section("Reconciling the gateway")
        code, recon = request("GET", "/school/payments/reconciliation", token=tok)
        assert code == 200, recon
        for key in ("orders", "settled", "abandoned", "failed", "unapplied", "excess", "clean"):
            assert key in recon, key
        assert isinstance(recon["unapplied"], list) and isinstance(recon["clean"], bool), recon
        frm = date.today() - timedelta(days=30)
        code, ranged = request("GET", f"/school/payments/reconciliation?from={frm}&to={date.today()}", token=tok)
        assert code == 200 and ranged["from_date"] == str(frm), ranged
        print(f"  {recon['orders']} orders in range, {recon['settled']} settled, clean={recon['clean']}")

        print("\nALL ACTION CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
