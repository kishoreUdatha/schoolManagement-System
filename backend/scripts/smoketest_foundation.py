"""End-to-end smoke test for enrolment history, guardians, terms, departments.

Verifies:
    Admission writes an enrolment; promotion closes last year's as 'promoted'
      and opens the new one; deactivation marks it 'left'; a past outcome can be
      corrected; the old year's roster still lists the student.
    Parent login creation also creates a guardian; the school adds a grandparent
      (pickup only); the parent adds a driver; gate passes flag whether the named
      collector is a listed pickup person; portal access for a guardian creates a
      working parent login; guardians with logins / primary can't be removed.
    Terms stay inside the year, can't overlap, sequence follows dates, and an
      exam can't use another year's term.
    Departments: staff and subjects link to them; counts; bad ids rejected.

Run:
    docker exec sms-backend python -m scripts.smoketest_foundation
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.exam import Exam
from app.models.fee import StudentFee
from app.models.foundation import Department, Guardian, StudentEnrollment, StudentGuardian, Term
from app.models.parent import ParentStudent
from app.models.staff import Staff
from app.models.student import Student
from app.models.subject import Subject
from app.models.user import User
from app.models.visitor import GatePass


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
YEAR_NAME = "Smoke 2031-32"
MARK = "Smoke Found"
PARENT_EMAIL = "smoke.found.parent@dev.local"
GRAN_EMAIL = "smoke.found.gran@dev.local"


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
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


def cleanup():
    db = SessionLocal()
    try:
        sids = [i for (i,) in db.execute(select(Student.id).where(Student.full_name.like(f"{MARK}%"))).all()]
        if sids:
            db.execute(GatePass.__table__.delete().where(GatePass.student_id.in_(sids)))
            db.execute(StudentFee.__table__.delete().where(StudentFee.student_id.in_(sids)))
            db.execute(ParentStudent.__table__.delete().where(ParentStudent.student_id.in_(sids)))
            db.execute(StudentGuardian.__table__.delete().where(StudentGuardian.student_id.in_(sids)))
            db.execute(StudentEnrollment.__table__.delete().where(StudentEnrollment.student_id.in_(sids)))
            db.execute(Student.__table__.delete().where(Student.id.in_(sids)))
        db.execute(Guardian.__table__.delete().where(Guardian.full_name.like(f"{MARK}%")))
        users = select(User.id).where(User.email.in_((PARENT_EMAIL, GRAN_EMAIL)))
        db.execute(Guardian.__table__.delete().where(Guardian.user_id.in_(users)))
        db.execute(User.__table__.delete().where(User.email.in_((PARENT_EMAIL, GRAN_EMAIL))))
        db.execute(Exam.__table__.delete().where(Exam.name.like(f"{MARK}%")))
        db.execute(Term.__table__.delete().where(Term.name.like(f"{MARK}%")))
        db.execute(Staff.__table__.update().where(Staff.department_id.in_(select(Department.id).where(Department.code.like("SMK%")))).values(department_id=None))
        db.execute(Subject.__table__.update().where(Subject.department_id.in_(select(Department.id).where(Department.code.like("SMK%")))).values(department_id=None))
        db.execute(Department.__table__.delete().where(Department.code.like("SMK%")))
        year_ids = select(AcademicYear.id).where(AcademicYear.name == YEAR_NAME)
        class_ids = select(SchoolClass.id).where(SchoolClass.academic_year_id.in_(year_ids))
        db.execute(Section.__table__.delete().where(Section.class_id.in_(class_ids)))
        db.execute(SchoolClass.__table__.delete().where(SchoolClass.academic_year_id.in_(year_ids)))
        db.execute(AcademicYear.__table__.delete().where(AcademicYear.name == YEAR_NAME))
        db.commit()
    finally:
        db.close()


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        cur = db.execute(select(Student).where(Student.school_id == admin.school_id)).scalars().first()
        y2 = AcademicYear(tenant_id=admin.tenant_id, school_id=admin.school_id, name=YEAR_NAME,
                          start_date=date(2031, 4, 1), end_date=date(2032, 3, 31), is_current=False, is_archived=False)
        db.add(y2)
        db.flush()
        c2 = SchoolClass(tenant_id=admin.tenant_id, school_id=admin.school_id, academic_year_id=y2.id, name="Class 2", display_order=2)
        db.add(c2)
        db.flush()
        s2 = Section(tenant_id=admin.tenant_id, school_id=admin.school_id, class_id=c2.id, name="A", capacity=40)
        db.add(s2)
        db.commit()
        return cur.academic_year_id, cur.section_id, y2.id, s2.id
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, (role, data)
    return data["access_token"]


def main():
    cleanup()
    year1, sec1, year2, sec2 = setup()
    try:
        tok = login("school", *ADMIN)

        section("Enrolment history")
        code, st = request("POST", "/school/students", token=tok, body={
            "full_name": f"{MARK} Kid", "academic_year_id": year1, "section_id": sec1, "gender": "female"})
        assert code == 201, st
        sid = st["id"]
        code, hist = request("GET", f"/school/students/{sid}/enrollments", token=tok)
        assert len(hist) == 1 and hist[0]["outcome"] == "studying" and hist[0]["notes"] == "Admitted", hist
        code, pr = request("POST", "/school/students/promote", token=tok, body={
            "source_section_id": sec1, "target_section_id": sec2, "student_ids": [sid]})
        assert code == 200, pr
        code, hist = request("GET", f"/school/students/{sid}/enrollments", token=tok)
        assert len(hist) == 2, hist
        new, old = hist[0], hist[1]
        assert new["academic_year_id"] == year2 and new["outcome"] == "studying" and new["start_date"] == "2031-04-01", new
        assert old["outcome"] == "promoted" and old["end_date"], old
        code, roster = request("GET", f"/school/enrollments?academic_year_id={year1}&section_id={sec1}", token=tok)
        assert any(r["student_id"] == sid and r["outcome"] == "promoted" for r in roster), "old roster keeps the student"
        code, fix = request("PATCH", f"/school/enrollments/{old['id']}", token=tok, body={"outcome": "repeated"})
        assert code == 200 and fix["outcome"] == "repeated", fix
        code, err = request("PATCH", f"/school/enrollments/{new['id']}", token=tok, body={"outcome": "promoted"})
        assert code == 400, err
        code, _ = request("POST", f"/school/students/{sid}/deactivate", token=tok)
        code, hist = request("GET", f"/school/students/{sid}/enrollments", token=tok)
        assert hist[0]["outcome"] == "left", hist[0]
        request("POST", f"/school/students/{sid}/activate", token=tok)
        code, hist = request("GET", f"/school/students/{sid}/enrollments", token=tok)
        assert hist[0]["outcome"] == "studying" and hist[0]["end_date"] is None, hist[0]
        print("  admitted → promoted → left → back; past outcome corrected")

        section("Guardians")
        code, p = request("POST", "/school/parents", token=tok, body={
            "full_name": f"{MARK} Mother", "email": PARENT_EMAIL, "phone": "9800011111", "student_id": sid, "relation": "mother"})
        assert code == 201, p
        ptok = login("parent", PARENT_EMAIL, p["temporary_password"])
        code, gs = request("GET", f"/school/students/{sid}/guardians", token=tok)
        assert len(gs) == 1 and gs[0]["relation"] == "mother" and gs[0]["is_primary"] and gs[0]["has_portal_login"], gs
        mother_id = gs[0]["guardian_id"]
        code, err = request("POST", f"/school/students/{sid}/guardians", token=tok, body={"full_name": f"{MARK} Gran", "relation": "grandparent"})
        assert code == 400 and "phone" in err["detail"], err
        code, gs = request("POST", f"/school/students/{sid}/guardians", token=tok, body={
            "full_name": f"{MARK} Gran", "phone": "9800022222", "email": GRAN_EMAIL, "relation": "grandparent", "lives_with_student": True})
        assert code == 201 and len(gs) == 2, gs
        gran_id = next(g["guardian_id"] for g in gs if g["relation"] == "grandparent")
        code, gs = request("POST", f"/parent/me/children/{sid}/guardians", token=ptok, body={
            "full_name": f"{MARK} Driver", "phone": "9800033333", "relation": "driver"})
        assert code == 201 and len(gs) == 3, gs
        code, err = request("DELETE", f"/parent/me/children/{sid}/guardians/{mother_id}", token=ptok)
        assert code == 400, err
        code, err = request("DELETE", f"/school/students/{sid}/guardians/{mother_id}", token=tok)
        assert code == 400 and "login" in err["detail"], err

        today = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
        code, gp = request("POST", f"/parent/me/children/{sid}/gate-passes", token=ptok, body={
            "leave_on": today, "reason": "Smoke visit", "pickup_name": f"{MARK.lower()}  gran"})
        assert code == 201 and gp["pickup_listed"] is True, gp
        request("POST", f"/parent/me/children/{sid}/gate-passes/{gp['id']}/cancel", token=ptok)
        code, gp2 = request("POST", f"/parent/me/children/{sid}/gate-passes", token=ptok, body={
            "leave_on": today, "reason": "Smoke visit", "pickup_name": "A Stranger"})
        assert code == 201 and gp2["pickup_listed"] is False, gp2
        print("  pickup check: listed grandparent ✓, stranger flagged")

        code, grant = request("POST", f"/school/students/{sid}/guardians/{gran_id}/portal-access", token=tok)
        assert code == 200 and grant["email"] == GRAN_EMAIL, grant
        login("parent", GRAN_EMAIL, grant["temporary_password"])
        code, gs = request("GET", f"/school/students/{sid}/guardians", token=tok)
        gran = next(g for g in gs if g["guardian_id"] == gran_id)
        assert gran["has_portal_login"] and len(gs) == 3, gs
        code, err = request("POST", f"/school/students/{sid}/guardians/{gran_id}/portal-access", token=tok)
        assert code == 400, err
        code, gs = request("PATCH", f"/school/students/{sid}/guardians/{gran_id}", token=tok, body={"is_primary": True})
        assert [g["full_name"] for g in gs if g["is_primary"]] == [f"{MARK} Gran"], gs
        print("  grandparent got a working login and became primary")

        section("Terms")
        code, t1 = request("POST", f"/school/academic-years/{year2}/terms", token=tok, body={"name": f"{MARK} Term 2", "start_date": "2031-10-01", "end_date": "2032-03-31"})
        assert code == 201, t1
        code, t0 = request("POST", f"/school/academic-years/{year2}/terms", token=tok, body={"name": f"{MARK} Term 1", "start_date": "2031-04-01", "end_date": "2031-09-30"})
        assert code == 201, t0
        code, terms = request("GET", f"/school/academic-years/{year2}/terms", token=tok)
        assert [t["name"] for t in terms] == [f"{MARK} Term 1", f"{MARK} Term 2"] and [t["sequence"] for t in terms] == [1, 2], terms
        code, err = request("POST", f"/school/academic-years/{year2}/terms", token=tok, body={"name": f"{MARK} X", "start_date": "2031-09-01", "end_date": "2031-10-15"})
        assert code == 400 and "Overlaps" in err["detail"], err
        code, err = request("POST", f"/school/academic-years/{year2}/terms", token=tok, body={"name": f"{MARK} X", "start_date": "2032-03-01", "end_date": "2032-05-01"})
        assert code == 400 and "within" in err["detail"], err
        code, err = request("POST", "/school/exams", token=tok, body={"name": f"{MARK} Exam", "kind": "term", "start_date": "2026-10-01", "end_date": "2026-10-10", "academic_year_id": year1, "term_id": t0["id"]})
        assert code == 400 and "Term" in err["detail"], err
        code, ex = request("POST", "/school/exams", token=tok, body={"name": f"{MARK} Exam", "kind": "term", "start_date": "2031-09-20", "end_date": "2031-09-25", "academic_year_id": year2, "term_id": t0["id"]})
        assert code == 201 and ex["term_id"] == t0["id"], ex
        code, err = request("DELETE", f"/school/terms/{t0['id']}", token=tok)
        assert code == 400, err

        section("Departments")
        code, d = request("POST", "/school/departments", token=tok, body={"name": f"{MARK} Science", "code": "smk-sci"})
        assert code == 201 and d["code"] == "SMK-SCI", d
        code, staff = request("GET", "/school/staff", token=tok)
        teacher = next(s for s in staff if s["role"] == "teacher")
        code, upd = request("PATCH", f"/school/staff/{teacher['id']}", token=tok, body={"department_id": d["id"]})
        assert code == 200 and upd["department_name"] == f"{MARK} Science", upd
        code, err = request("PATCH", f"/school/staff/{teacher['id']}", token=tok, body={"department_id": 999999})
        assert code == 404, err
        code, subs = request("GET", "/school/subjects", token=tok)
        if subs:
            code, s1 = request("PATCH", f"/school/subjects/{subs[0]['id']}", token=tok, body={"department_id": d["id"]})
            assert code == 200 and s1["department_id"] == d["id"], s1
        code, ds = request("GET", "/school/departments", token=tok)
        mine = next(x for x in ds if x["id"] == d["id"])
        assert mine["staff_count"] == 1 and mine["subject_count"] == (1 if subs else 0), mine
        print(f"  {mine['name']}: {mine['staff_count']} staff, {mine['subject_count']} subject(s)")

        print("\nALL FOUNDATION CHECKS PASSED")
    except AssertionError as e:
        print(f"\nFAILED: {e}")
        sys.exit(1)
    finally:
        cleanup()


if __name__ == "__main__":
    main()
