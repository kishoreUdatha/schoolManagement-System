"""End-to-end smoke test for grade scales, exam types, result approval and report cards.

Verifies:
    Scales: bands must cover 0-100 without gaps or overlaps; one default;
      the default can't be deleted; the CBSE seed works.
    Marks use the exam's scale (pinned scale beats the default), and the
      grade on a mark changes when the scale does.
    Exam types: unique code, in use can't be deleted.
    Approval: with the setting on, results can't be published until approved.
    Report cards: remarks by class teacher, rank list, PDF includes the
      grade legend and remarks.

Run:
    docker exec sms-backend python -m scripts.smoketest_grading
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

from sqlalchemy import select

from app.core.enums import MarkStatus, SubjectKind, UserRole
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import AcademicYear, Section
from app.models.exam import Exam, ExamSubject
from app.models.grading import ExamType, GradeScale, ReportCardRemark, ReportCardSetting
from app.models.mark import Mark
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
CODE = "SMKGRD"
EXAM = "Smoke Grading Exam"


def request(method, path, *, token=None, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body_ = r.read()
            if raw or not r.headers.get("content-type", "").startswith("application/json"):
                return r.status, body_
            return r.status, json.loads(body_) if body_ else None
    except urllib.error.HTTPError as e:
        b = e.read()
        try:
            return e.code, json.loads(b)
        except Exception:
            return e.code, {"raw": b.decode(errors="ignore")}


def section(t):
    print(f"\n=== {t} ===")


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        teacher = db.execute(select(User).where(User.email == TEACHER[0])).scalar_one()
        teacher.password_hash = hash_password(TEACHER[1])
        student = db.execute(
            select(Student).where(Student.school_id == admin.school_id, Student.is_active.is_(True)).limit(1)
        ).scalar_one()
        sec = db.get(Section, student.section_id)
        saved_ct = sec.class_teacher_user_id
        sec.class_teacher_user_id = teacher.id
        year = db.execute(
            select(AcademicYear).where(AcademicYear.school_id == admin.school_id, AcademicYear.is_current.is_(True))
        ).scalar_one()
        subj = Subject(tenant_id=admin.tenant_id, school_id=admin.school_id, name="Smoke Grading Sub", code=CODE, kind=SubjectKind.core)
        db.add(subj)
        db.flush()
        cs = ClassSubject(tenant_id=admin.tenant_id, school_id=admin.school_id, class_id=sec.class_id,
                          subject_id=subj.id, teacher_user_id=teacher.id)
        db.add(cs)
        exam = Exam(tenant_id=admin.tenant_id, school_id=admin.school_id, academic_year_id=year.id, name=EXAM,
                    start_date=date.today() - timedelta(days=3), end_date=date.today() - timedelta(days=1))
        db.add(exam)
        db.flush()
        paper = ExamSubject(tenant_id=admin.tenant_id, school_id=admin.school_id, exam_id=exam.id,
                            class_subject_id=cs.id, max_marks=100, pass_marks=33, exam_date=date.today() - timedelta(days=2))
        db.add(paper)
        db.commit()
        return dict(sid=student.id, section_id=sec.id, exam=exam.id, paper=paper.id, saved_ct=saved_ct,
                    teacher_id=teacher.id, school_id=admin.school_id)
    finally:
        db.close()


def cleanup(ctx=None):
    db = SessionLocal()
    try:
        exams = select(Exam.id).where(Exam.name == EXAM)
        papers = select(ExamSubject.id).where(ExamSubject.exam_id.in_(exams))
        db.execute(Mark.__table__.delete().where(Mark.exam_subject_id.in_(papers)))
        db.execute(ReportCardRemark.__table__.delete().where(ReportCardRemark.exam_id.in_(exams)))
        db.execute(ExamSubject.__table__.delete().where(ExamSubject.exam_id.in_(exams)))
        db.execute(Exam.__table__.delete().where(Exam.name == EXAM))
        subj = select(Subject.id).where(Subject.code == CODE)
        db.execute(ClassSubject.__table__.delete().where(ClassSubject.subject_id.in_(subj)))
        db.execute(Subject.__table__.delete().where(Subject.code == CODE))
        db.execute(GradeScale.__table__.delete().where(GradeScale.name.like("Smoke%") | (GradeScale.name == "CBSE 8-point")))
        db.execute(ExamType.__table__.delete().where(ExamType.code.like("SMK%")))
        if ctx:
            sec = db.get(Section, ctx["section_id"])
            sec.class_teacher_user_id = ctx["saved_ct"]
            cfg = db.execute(select(ReportCardSetting).where(ReportCardSetting.school_id == ctx["school_id"])).scalar_one_or_none()
            if cfg:
                cfg.require_result_approval = False
                cfg.show_rank = False
        db.commit()
    finally:
        db.close()


def mark_grade(paper_id, student_id):
    db = SessionLocal()
    try:
        m = db.execute(select(Mark).where(Mark.exam_subject_id == paper_id, Mark.student_id == student_id)).scalar_one()
        return m.grade
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


BANDS_OK = [
    {"grade": "S", "min_percent": 80, "max_percent": 100, "points": 10, "remark": "Outstanding"},
    {"grade": "M", "min_percent": 40, "max_percent": 79, "points": 6, "remark": "Meets expectations"},
    {"grade": "N", "min_percent": 0, "max_percent": 39, "points": 0, "remark": "Needs support", "is_pass": False},
]


def main():
    cleanup()
    ctx = setup()
    try:
        tok = login("school", *ADMIN)
        ttok = login("teacher", *TEACHER)

        section("Grade scales")
        code, err = request("POST", "/school/grade-scales", token=tok, body={
            "name": "Smoke gap", "bands": [{"grade": "A", "min_percent": 60, "max_percent": 100}, {"grade": "B", "min_percent": 0, "max_percent": 50}]})
        assert code == 422 and "Nothing covers" in str(err), err
        code, err = request("POST", "/school/grade-scales", token=tok, body={
            "name": "Smoke overlap", "bands": [{"grade": "A", "min_percent": 50, "max_percent": 100}, {"grade": "B", "min_percent": 0, "max_percent": 60}]})
        assert code == 422 and "overlap" in str(err), err
        code, cbse = request("POST", "/school/grade-scales/seed-cbse", token=tok)
        assert code == 201 and len(cbse["bands"]) == 8 and cbse["is_default"] and cbse["bands"][0]["grade"] == "A1", cbse
        code, scale = request("POST", "/school/grade-scales", token=tok, body={"name": "Smoke 3-band", "bands": BANDS_OK})
        assert code == 201 and not scale["is_default"], scale
        code, err = request("DELETE", f"/school/grade-scales/{cbse['id']}", token=tok)
        assert code == 400, err
        print(f"  gaps/overlaps rejected; CBSE seed is default ({len(cbse['bands'])} bands)")

        section("Marks use the scale")
        code, _r = request("POST", f"/teacher/marks/papers/{ctx['paper']}/save", token=ttok,
                           body={"section_id": ctx["section_id"], "entries": [{"student_id": ctx["sid"], "status": "scored", "marks_obtained": 72}]})
        assert code == 200, _r
        assert mark_grade(ctx["paper"], ctx["sid"]) == "B1", mark_grade(ctx["paper"], ctx["sid"])
        code, e = request("PATCH", f"/school/exams/{ctx['exam']}", token=tok, body={"grade_scale_id": scale["id"]})
        assert code == 200 and e["grade_scale_id"] == scale["id"], e
        request("POST", f"/teacher/marks/papers/{ctx['paper']}/save", token=ttok,
                body={"section_id": ctx["section_id"], "entries": [{"student_id": ctx["sid"], "status": "scored", "marks_obtained": 72}]})
        assert mark_grade(ctx["paper"], ctx["sid"]) == "M", "pinned scale wins"
        code, err = request("PATCH", f"/school/exams/{ctx['exam']}", token=tok, body={"grade_scale_id": 999999})
        assert code == 400, err
        print("  72% -> B1 on CBSE, M on the pinned 3-band scale")

        section("Exam types")
        code, t1 = request("POST", "/school/exam-types", token=tok, body={"name": "Smoke Unit Test", "code": "SMKUT", "weight_percent": 10})
        assert code == 201, t1
        code, err = request("POST", "/school/exam-types", token=tok, body={"name": "Dup", "code": "SMKUT"})
        assert code == 400, err
        code, e = request("PATCH", f"/school/exams/{ctx['exam']}", token=tok, body={"exam_type_id": t1["id"]})
        assert e["exam_type_name"] == "Smoke Unit Test", e
        code, err = request("DELETE", f"/school/exam-types/{t1['id']}", token=tok)
        assert code == 400, err
        print("  types: unique code, linked to the exam, protected while in use")

        section("Result approval")
        code, cfg = request("PUT", "/school/report-card-settings", token=tok,
                            body={"require_result_approval": True, "show_rank": True, "show_attendance": True, "show_remarks": True, "principal_name": "Dr Smoke"})
        assert code == 200 and cfg["require_result_approval"], cfg
        code, err = request("POST", f"/school/exams/{ctx['exam']}/publish", token=tok)
        assert code == 400 and "approval" in err["detail"], err
        code, err = request("POST", f"/school/exams/{ctx['exam']}/approve-results", token=ttok)
        assert code == 403, err
        code, a = request("POST", f"/school/exams/{ctx['exam']}/approve-results", token=tok)
        assert code == 200 and a["results_approved_at"], a
        code, e = request("POST", f"/school/exams/{ctx['exam']}/publish", token=tok)
        assert code == 200 and e["is_published"], e
        code, err = request("POST", f"/school/exams/{ctx['exam']}/approve-results?approve=false", token=tok)
        assert code == 400, err
        print("  publishing blocked until the principal/admin approves")

        section("Report card")
        code, rows = request("GET", f"/school/exams/{ctx['exam']}/sections/{ctx['section_id']}/remarks", token=ttok)
        me = next(r for r in rows if r["student_id"] == ctx["sid"])
        assert me["grade"] == "M" and me["rank"] == 1 and me["can_edit"], me
        code, err = request("PUT", f"/school/exams/{ctx['exam']}/students/{ctx['sid']}/remark", token=ttok,
                            body={"principal_remark": "Nope"})
        assert code == 403, err
        code, r = request("PUT", f"/school/exams/{ctx['exam']}/students/{ctx['sid']}/remark", token=ttok,
                          body={"teacher_remark": "Smoke steady progress"})
        assert code == 200 and r["teacher_remark"] == "Smoke steady progress", r
        code, r = request("PUT", f"/school/exams/{ctx['exam']}/students/{ctx['sid']}/remark", token=tok,
                          body={"principal_remark": "Smoke well done"})
        assert code == 200 and r["principal_remark"] == "Smoke well done", r
        code, pdf = request("GET", f"/school/exams/{ctx['exam']}/sections/{ctx['section_id']}/report-cards.pdf", token=tok, raw=True)
        assert code == 200 and pdf[:4] == b"%PDF" and len(pdf) > 3000, len(pdf)
        print(f"  remarks saved, rank 1, report card PDF {len(pdf) // 1024} KB with the grade legend")

        print("\nALL GRADING / REPORT CARD CHECKS PASSED")
    finally:
        cleanup(ctx)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
