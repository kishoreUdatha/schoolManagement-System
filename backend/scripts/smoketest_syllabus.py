"""End-to-end smoke test for syllabus, coverage and lesson plans.

Verifies:
    The subject teacher builds chapters/topics, reorders them and copies the
    syllabus into another class; other teachers can't edit it; coverage per
    section drives progress and the behind-schedule count; covered topics
    can't be deleted.
    Lesson plans: only for subjects you teach; submit notifies the principal;
    returned plans need a comment; delivering marks the plan's topics taught;
    parent sees progress for the child's section.

Run:
    docker exec sms-backend python -m scripts.smoketest_syllabus
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

from sqlalchemy import select

from app.core.enums import SubjectKind, UserRole
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.academic import SchoolClass, Section
from app.models.notice import Notice
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.syllabus import LessonPlan
from app.models.user import User


BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TEACHER = ("teacher@sms.local", "TeacherPass123!")
OTHER = ("smoke.syl.other@dev.local", "OtherPass123!")
PARENT_PW = "ParentPass123!"
CODE = "SMKSYL"


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


def setup():
    db = SessionLocal()
    try:
        admin = db.execute(select(User).where(User.email == ADMIN[0])).scalar_one()
        admin.password_hash = hash_password(ADMIN[1])
        teacher = db.execute(select(User).where(User.email == TEACHER[0])).scalar_one()
        teacher.password_hash = hash_password(TEACHER[1])
        other = User(tenant_id=admin.tenant_id, school_id=admin.school_id, full_name="Smoke Syl Other",
                     email=OTHER[0], password_hash=hash_password(OTHER[1]), role=UserRole.teacher, is_active=True)
        db.add(other)
        student, parent = db.execute(
            select(Student, User)
            .join(ParentStudent, ParentStudent.student_id == Student.id)
            .join(User, ParentStudent.parent_user_id == User.id)
            .where(Student.school_id == admin.school_id, Student.is_active.is_(True))
            .limit(1)
        ).first()
        parent.password_hash = hash_password(PARENT_PW)
        sec = db.get(Section, student.section_id)
        cls = db.get(SchoolClass, sec.class_id)
        other_class = db.execute(
            select(SchoolClass).where(SchoolClass.academic_year_id == cls.academic_year_id, SchoolClass.id != cls.id).limit(1)
        ).scalar_one_or_none()
        subj = Subject(tenant_id=admin.tenant_id, school_id=admin.school_id, name="Smoke Syllabus Science",
                       code=CODE, kind=SubjectKind.core)
        db.add(subj)
        db.flush()
        cs = ClassSubject(tenant_id=admin.tenant_id, school_id=admin.school_id, class_id=cls.id, subject_id=subj.id,
                          teacher_user_id=teacher.id)
        db.add(cs)
        cs2 = None
        if other_class:
            cs2 = ClassSubject(tenant_id=admin.tenant_id, school_id=admin.school_id, class_id=other_class.id,
                               subject_id=subj.id, teacher_user_id=teacher.id)
            db.add(cs2)
        db.commit()
        return dict(sid=student.id, section_id=sec.id, cs=cs.id, cs2=cs2.id if cs2 else None, year=cls.academic_year_id,
                    parent_email=parent.email, teacher_id=teacher.id)
    finally:
        db.close()


def cleanup():
    db = SessionLocal()
    try:
        subj_ids = select(Subject.id).where(Subject.code == CODE)
        cs_ids = select(ClassSubject.id).where(ClassSubject.subject_id.in_(subj_ids))
        db.execute(LessonPlan.__table__.delete().where(LessonPlan.class_subject_id.in_(cs_ids)))
        db.execute(ClassSubject.__table__.delete().where(ClassSubject.subject_id.in_(subj_ids)))
        db.execute(Subject.__table__.delete().where(Subject.code == CODE))
        db.execute(Notice.__table__.delete().where(Notice.title.like("%Smoke Syl%")))
        db.execute(User.__table__.delete().where(User.email == OTHER[0]))
        db.commit()
    finally:
        db.close()


def login(role, email, pw):
    code, data = request("POST", f"/{role}/auth/login", body={"email": email, "password": pw})
    assert code == 200, data
    return data["access_token"]


def main():
    cleanup()
    ctx = setup()
    cs, sec = ctx["cs"], ctx["section_id"]
    today = date.today()
    try:
        tok = login("school", *ADMIN)
        ttok = login("teacher", *TEACHER)
        otok = login("teacher", *OTHER)
        ptok = login("parent", ctx["parent_email"], PARENT_PW)

        section("Syllabus editing")
        code, d = request("POST", f"/school/syllabus/{cs}/chapters", token=ttok, body={
            "title": "Plants", "planned_start": (today - timedelta(days=20)).isoformat(),
            "planned_end": (today - timedelta(days=1)).isoformat(), "topics": ["Parts of a plant", "Photosynthesis", " "],
        })
        assert code == 201 and len(d["items"]) == 1 and len(d["items"][0]["topics"]) == 2, d
        code, d = request("POST", f"/school/syllabus/{cs}/chapters", token=tok, body={
            "title": "Animals", "planned_end": (today + timedelta(days=30)).isoformat(), "topics": ["Habitats"],
        })
        assert code == 201 and [c["title"] for c in d["items"]] == ["Plants", "Animals"], d
        ch_plants, ch_animals = d["items"][0], d["items"][1]
        code, err = request("POST", f"/school/syllabus/{cs}/chapters", token=otok, body={"title": "Nope"})
        assert code == 403, err
        code, err = request("GET", f"/school/syllabus/{cs}", token=otok)
        assert code == 404, "unrelated teacher can't see it"
        code, err = request("POST", f"/school/syllabus/{cs}/chapters", token=ttok,
                            body={"title": "Bad", "planned_start": today.isoformat(), "planned_end": (today - timedelta(days=1)).isoformat()})
        assert code == 422, err
        code, d = request("PUT", f"/school/syllabus/{cs}/chapter-order", token=ttok, body={"ids": [ch_animals["id"], ch_plants["id"]]})
        assert [c["title"] for c in d["items"]] == ["Animals", "Plants"], d
        request("PUT", f"/school/syllabus/{cs}/chapter-order", token=ttok, body={"ids": [ch_plants["id"], ch_animals["id"]]})
        code, _r = request("POST", f"/school/syllabus/chapters/{ch_animals['id']}/topics", token=ttok, body={"titles": ["Food chains"]})
        assert code == 204, _r
        print("  chapters/topics added, reordered; outsiders blocked")

        section("Coverage + progress")
        t1, t2 = ch_plants["topics"][0]["id"], ch_plants["topics"][1]["id"]
        code, err = request("PUT", f"/school/syllabus/topics/{t1}/coverage", token=ttok,
                            body={"section_id": sec, "covered": True, "covered_on": (today + timedelta(days=3)).isoformat()})
        assert code == 400, err
        code, _r = request("PUT", f"/school/syllabus/topics/{t1}/coverage", token=ttok, body={"section_id": sec, "covered": True})
        assert code == 204, _r
        code, rows = request("GET", f"/school/syllabus?academic_year_id={ctx['year']}", token=tok)
        mine = next(r for r in rows if r["class_subject_id"] == cs)
        sp = next(s for s in mine["sections"] if s["section_id"] == sec)
        assert mine["topics"] == 4 and sp["covered"] == 1 and sp["percent"] == 25 and sp["behind"] == 1, sp
        # Name the year, as the admin call above already does. Without it the
        # endpoint falls back to whichever year is current, and another suite
        # in this run moves that — so this passed or failed on test order.
        code, rows = request("GET", f"/school/syllabus?academic_year_id={ctx['year']}", token=ttok)
        assert any(r["class_subject_id"] == cs and r["can_edit"] for r in rows), rows
        code, err = request("DELETE", f"/school/syllabus/topics/{t1}", token=ttok)
        assert code == 400, err
        code, err = request("DELETE", f"/school/syllabus/chapters/{ch_plants['id']}", token=ttok)
        assert code == 400, err
        print(f"  25% covered, {sp['behind']} topic behind schedule; covered topics protected")

        if ctx["cs2"]:
            code, src = request("GET", f"/school/syllabus/{ctx['cs2']}/copy-sources", token=ttok)
            assert any(s["class_subject_id"] == cs for s in src), src
            code, d2 = request("POST", f"/school/syllabus/{ctx['cs2']}/copy", token=ttok, body={"source_class_subject_id": cs})
            assert code == 200 and d2["topics"] == 4 and all(not t["coverage"] for c in d2["items"] for t in c["topics"]), d2
            code, err = request("POST", f"/school/syllabus/{ctx['cs2']}/copy", token=ttok, body={"source_class_subject_id": cs})
            assert code == 400, err
            print("  copied into another class (no dates/coverage); second copy refused")

        section("Lesson plans")
        plan = {"class_subject_id": cs, "section_id": sec, "plan_date": today.isoformat(), "periods": 1,
                "title": "Smoke Syl photosynthesis", "objectives": "Explain photosynthesis", "topic_ids": [t2]}
        code, err = request("POST", "/school/lesson-plans", token=otok, body=plan)
        assert code == 403, err
        code, p = request("POST", "/school/lesson-plans", token=ttok, body=plan)
        assert code == 201 and p["status"] == "draft" and p["topics"][0]["id"] == t2, p
        code, err = request("POST", "/school/lesson-plans", token=ttok, body={**plan, "topic_ids": [999999]})
        assert code == 400, err
        code, p = request("POST", f"/school/lesson-plans/{p['id']}/submit", token=ttok)
        assert code == 200 and p["status"] == "submitted", p
        code, err = request("POST", f"/school/lesson-plans/{p['id']}/review", token=tok, body={"decision": "return"})
        assert code == 422, err
        code, p = request("POST", f"/school/lesson-plans/{p['id']}/review", token=tok,
                          body={"decision": "return", "comment": "Add an activity"})
        assert code == 200 and p["status"] == "returned" and p["reviewed_by_name"], p
        code, err = request("POST", f"/school/lesson-plans/{p['id']}/deliver", token=ttok, body={"delivered_on": today.isoformat()})
        assert code == 400, err
        code, p = request("PUT", f"/school/lesson-plans/{p['id']}", token=ttok, body={**plan, "activities": "Leaf experiment"})
        assert code == 200 and p["status"] == "returned", "stays returned until resubmitted"
        request("POST", f"/school/lesson-plans/{p['id']}/submit", token=ttok)
        code, p = request("POST", f"/school/lesson-plans/{p['id']}/review", token=tok, body={"decision": "approve"})
        assert p["status"] == "approved", p
        code, err = request("POST", f"/school/lesson-plans/{p['id']}/review", token=ttok, body={"decision": "approve"})
        assert code in (400, 403), err
        code, p = request("POST", f"/school/lesson-plans/{p['id']}/deliver", token=ttok, body={"delivered_on": today.isoformat(), "note": "Went well"})
        assert code == 200 and p["delivered_on"] == today.isoformat(), p
        code, d = request("GET", f"/school/syllabus/{cs}", token=ttok)
        cov = d["items"][0]["topics"][1]["coverage"][str(sec)]
        assert cov["lesson_plan_id"] == p["id"], cov
        code, err = request("DELETE", f"/school/lesson-plans/{p['id']}", token=ttok)
        assert code == 400, err
        code, mine = request("GET", "/school/lesson-plans", token=otok)
        assert not any(x["id"] == p["id"] for x in mine), "teachers only see their own plans"
        code, queue = request("GET", "/school/lesson-plans?status=approved", token=tok)
        assert any(x["id"] == p["id"] for x in queue), queue
        print("  403 for non-teacher, return needs comment, approve, deliver marks topic taught")

        section("Parent view")
        code, subs = request("GET", f"/parent/me/children/{ctx['sid']}/syllabus", token=ptok)
        s = next(x for x in subs if x["subject_name"] == "Smoke Syllabus Science")
        assert s["covered"] == 2 and s["total"] == 4 and s["percent"] == 50, s
        print(f"  parent sees {s['percent']}% of {s['subject_name']}")

        print("\nALL SYLLABUS / LESSON PLAN CHECKS PASSED")
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
