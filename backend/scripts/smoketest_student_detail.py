"""Smoke test for a child's academic file, exam history, family and the
register of children who have left.

Verifies:
    Siblings are worked out from shared parents rather than stored, so linking
    a second child to a parent makes them siblings immediately and unlinking
    undoes it — with no list anywhere to go stale.
    A subject nobody has marked reads as unmarked, not as nought.
    A leaver is an inactive child, derived from the enrolment history, and the
    register says who left without a leaving certificate.
    None of it is reachable by a teacher or a parent.

Run:
    docker exec sms-backend python -m scripts.smoketest_student_detail
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
from app.models.mark import Mark
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.user import User
from scripts import devdata

TAG = "SMOKE-SDETAIL"
BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            payload = r.read()
            return r.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload)
        except Exception:
            return e.code, {"raw": payload.decode(errors="ignore")[:200]}


def section(t):
    print(f"\n=== {t} ===")


def login(role, email, password):
    db = SessionLocal()
    try:
        u = db.execute(select(User).where(User.email == email)).scalar_one()
        u.password_hash = hash_password(password)
        db.commit()
    finally:
        db.close()
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": password})
    assert code == 200, (email, data)
    return data["access_token"]


def main():
    tok = login("school", *ADMIN)
    child = devdata.child_id()
    other = devdata.other_child_id()
    parent_email = devdata.PARENT_EMAIL

    db = SessionLocal()
    try:
        parent = db.execute(select(User).where(User.email == parent_email)).scalar_one()
        parent_id = parent.id
        had_link = db.execute(
            select(ParentStudent).where(
                ParentStudent.parent_user_id == parent_id,
                ParentStudent.student_id == other,
            )
        ).scalar_one_or_none() is not None
    finally:
        db.close()

    try:
        section("What a child studies")
        code, acad = request("GET", f"/school/student-detail/{child}/academic", token=tok)
        assert code == 200, acad
        assert acad["student_id"] == child and acad["admission_no"], acad
        assert acad["subjects"], "the class teaches something"
        assert all("teacher_name" in s for s in acad["subjects"]), acad["subjects"][0]
        print(f"  {acad['full_name']}: {len(acad['subjects'])} subject(s), "
              f"{len(acad['history'])} year(s) of history")

        section("Unmarked is not nought")
        # The seed carries no published exam — the other suites clean theirs up —
        # so make one with a paper deliberately left unmarked. Without this the
        # assertion below runs over an empty list and proves nothing.
        day = date.today() - timedelta(days=3)
        code, exam = request("POST", "/school/exams", token=tok, body={
            "academic_year_id": devdata.year_id(), "name": f"{TAG} Term",
            "kind": "term", "start_date": day.isoformat(), "end_date": day.isoformat()})
        assert code == 201, exam
        subjects = devdata.class_subject_ids()
        papers = []
        for cs in subjects[:2]:
            code, paper = request("POST", f"/school/exams/{exam['id']}/papers", token=tok, body={
                "class_subject_id": cs, "max_marks": 100, "pass_marks": 35,
                "exam_date": day.isoformat()})
            assert code == 201, paper
            papers.append(paper)
        ttok_setup = login("teacher", devdata.TEACHER_EMAIL, "TeacherPass123!")
        # mark the first paper only; the second stays untouched on purpose
        request("POST", f"/teacher/marks/papers/{papers[0]['id']}/save", token=ttok_setup, body={
            "section_id": devdata.section_id("A"),
            "entries": [{"student_id": child, "status": "scored", "marks_obtained": 61}]})
        code, pub = request("POST", f"/school/exams/{exam['id']}/publish", token=tok)
        assert code == 200, pub

        code, exams = request("GET", f"/school/student-detail/{child}/exams", token=tok)
        assert code == 200, exams
        mine = next(e for e in exams["exams"] if e["exam_id"] == exam["id"])
        marked = [s for s in mine["subjects"] if s["marks_obtained"] is not None]
        blank = [s for s in mine["subjects"] if s["marks_obtained"] is None]
        assert marked and blank, (
            "this exam was built with one paper marked and one not")
        assert mine["out_of"] == 100, (
            "the unmarked paper must not be counted in the total out of")
        assert mine["obtained"] == 61, mine
        for e in exams["exams"]:
            for s in e["subjects"]:
                if s["marks_obtained"] is None:
                    assert s["is_pass"] is None, (
                        "a subject nobody marked cannot have a pass verdict")
            assert e["out_of"] >= 0 and 0 <= e["percent"] <= 100, e
        print(f"  {len(exams['exams'])} published exam(s), none scored from a blank")

        section("Siblings come from sharing a parent")
        code, fam = request("GET", f"/school/student-detail/{child}/family", token=tok)
        assert code == 200, fam
        before = {s["student_id"] for s in fam["siblings"]}
        assert any(p["user_id"] == parent_id for p in fam["parents"]), fam["parents"]

        # link the other child to the same parent and look again
        code, linked = request("POST", f"/school/parents/{parent_id}/links", token=tok,
                               body={"student_id": other, "relation": "father"})
        assert code in (200, 201), linked
        code, fam2 = request("GET", f"/school/student-detail/{child}/family", token=tok)
        after = {s["student_id"] for s in fam2["siblings"]}
        assert other in after and other not in before, (before, after)
        sib = next(s for s in fam2["siblings"] if s["student_id"] == other)
        assert sib["shared_parents"], sib
        print(f"  linking made {sib['full_name']} a sibling at once, "
              f"sharing {sib['shared_parents'][0]}")

        # and unlinking undoes it, with no stored list to correct
        code, _ = request("DELETE", f"/school/parents/{parent_id}/links/{other}", token=tok)
        code, fam3 = request("GET", f"/school/student-detail/{child}/family", token=tok)
        assert other not in {s["student_id"] for s in fam3["siblings"]}, fam3["siblings"]
        print("  unlinking undid it, with nothing to keep in step")

        section("Children who have left")
        code, left = request("GET", "/school/student-detail/leavers", token=tok)
        assert code == 200, left
        assert left["total"] == len(left["leavers"]), left["total"]
        assert all(not r["is_active"] for r in left["leavers"]), "a leaver is inactive"
        assert left["without_certificate"] == sum(
            1 for r in left["leavers"] if not r["certificate_id"]), left
        print(f"  {left['total']} leaver(s), {left['without_certificate']} without a certificate")

        section("A made-up child is a 404, not an empty page")
        code, err = request("GET", "/school/student-detail/99999999/academic", token=tok)
        assert code == 404, (code, err)
        print("  404")

        section("Not for teachers or parents")
        ttok = login("teacher", devdata.TEACHER_EMAIL, "TeacherPass123!")
        ptok = login("parent", parent_email, "ParentPass123!")
        for name, t in (("teacher", ttok), ("parent", ptok)):
            for path in (f"/school/student-detail/{child}/family",
                         "/school/student-detail/leavers"):
                code, err = request("GET", path, token=t)
                assert code == 403, f"a {name} reached {path}: {code}"
        print("  both refused the family view and the leavers register")

        print("\nALL STUDENT-DETAIL CHECKS PASSED")
    finally:
        db = SessionLocal()
        try:
            exams_q = select(Exam.id).where(Exam.name.like(f"{TAG}%"))
            papers_q = select(ExamSubject.id).where(ExamSubject.exam_id.in_(exams_q))
            db.execute(Mark.__table__.delete().where(Mark.exam_subject_id.in_(papers_q)))
            db.execute(ExamSubject.__table__.delete().where(ExamSubject.exam_id.in_(exams_q)))
            db.execute(Exam.__table__.delete().where(Exam.name.like(f"{TAG}%")))
            db.commit()
        finally:
            db.close()
        if not had_link:
            request("DELETE", f"/school/parents/{parent_id}/links/{other}", token=tok)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
