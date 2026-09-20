"""Smoke test for subject groups, curricula, activities, requisitions and
onboarding.

Verifies:
    Activating a curriculum retires whichever one held that slot, so a class
    can never have two programmes in force at once.
    An activity with a capacity refuses the joiner that would exceed it, and
    leaving is recorded rather than deleted.
    A subject cannot be put in the same group twice, and taking it out of a
    group leaves the subject itself alone.
    A requisition cannot be decided by the person who raised it.
    A new starter's checklist arrives with the standard set already on it,
    because an empty checklist and a finished one look identical afterwards.

Every fixture here is built by the test. Nothing asserts over whatever the
seed happens to hold.

Run:
    docker exec sms-backend python -m scripts.smoketest_academics_hr
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
from app.models.academics_ops import (
    Activity,
    ActivityMember,
    Curriculum,
    CurriculumSubject,
    SubjectGroup,
    SubjectGroupMember,
)
from app.models.hr_ops import OnboardingTask, Requisition
from app.models.staff import Staff
from app.models.subject import Subject
from app.models.user import User
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-ACAHR"


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
    code, data = request("POST", f"/{role}/auth/login",
                         body={"email": email, "password": password})
    assert code == 200, (email, data)
    return data["access_token"]


def cleanup():
    """Take away only what this test made. The seed's subjects and staff stay."""
    db = SessionLocal()
    try:
        groups = select(SubjectGroup.id).where(SubjectGroup.name.like(f"{TAG}%"))
        db.execute(SubjectGroupMember.__table__.delete().where(
            SubjectGroupMember.group_id.in_(groups)))
        db.execute(SubjectGroup.__table__.delete().where(
            SubjectGroup.name.like(f"{TAG}%")))

        curricula = select(Curriculum.id).where(Curriculum.name.like(f"{TAG}%"))
        db.execute(CurriculumSubject.__table__.delete().where(
            CurriculumSubject.curriculum_id.in_(curricula)))
        db.execute(Curriculum.__table__.delete().where(
            Curriculum.name.like(f"{TAG}%")))

        activities = select(Activity.id).where(Activity.name.like(f"{TAG}%"))
        db.execute(ActivityMember.__table__.delete().where(
            ActivityMember.activity_id.in_(activities)))
        db.execute(Activity.__table__.delete().where(Activity.name.like(f"{TAG}%")))

        db.execute(Requisition.__table__.delete().where(
            Requisition.title.like(f"{TAG}%")))
        db.execute(OnboardingTask.__table__.delete().where(
            OnboardingTask.title.like(f"{TAG}%")))
        db.commit()
    finally:
        db.close()


def onboarding_fixture_staff(db):
    """A staff member with no checklist yet, so starting one is a real test."""
    rows = list(db.execute(
        select(Staff).where(Staff.school_id == devdata.school_id())
    ).scalars())
    assert rows, "the seed has staff"
    for s in rows:
        has = db.execute(
            select(OnboardingTask).where(OnboardingTask.staff_id == s.id)
        ).first()
        if not has:
            return s
    return None


def main():
    cleanup()
    tok = login("school", *ADMIN)
    ptok = login("principal", "principal@dev.local", "PrincipalPass123!")

    db = SessionLocal()
    try:
        subjects = list(db.execute(
            select(Subject).where(Subject.school_id == devdata.school_id())
            .order_by(Subject.id)
        ).scalars())
        subject_ids = [s.id for s in subjects[:3]]
        subject_names = {s.id: s.name for s in subjects[:3]}
        klass = devdata.klass()
        year_id = devdata.year_id()
    finally:
        db.close()
    assert len(subject_ids) >= 2, "the seed teaches at least two subjects"

    created_staff_id = None
    try:
        section("A subject cannot be in the same group twice")
        code, group = request("POST", "/school/academics/groups", token=tok, body={
            "name": f"{TAG} Sciences", "code": f"{TAG[:6]}SCI",
            "description": "Built by the smoke test"})
        assert code == 201, group
        gid = group["id"]

        code, with_one = request("POST", f"/school/academics/groups/{gid}/subjects",
                                 token=tok, body={"subject_id": subject_ids[0]})
        assert code == 200, with_one
        assert with_one["subject_count"] == 1, with_one

        code, dup = request("POST", f"/school/academics/groups/{gid}/subjects",
                            token=tok, body={"subject_id": subject_ids[0]})
        assert code == 400 and "already in" in dup["detail"], dup
        print(f"  refused: {dup['detail']}")

        section("Taking a subject out of a group leaves the subject alone")
        code, without = request(
            "DELETE", f"/school/academics/groups/{gid}/subjects/{subject_ids[0]}",
            token=tok)
        assert code == 200 and without["subject_count"] == 0, without
        db = SessionLocal()
        try:
            still = db.get(Subject, subject_ids[0])
            assert still is not None and still.is_active, (
                "removing a grouping must not touch the subject master")
        finally:
            db.close()
        print(f"  {subject_names[subject_ids[0]]} is out of the group and still a subject")

        section("Only one curriculum is in force for a class")
        code, first = request("POST", "/school/academics/curricula", token=tok, body={
            "name": f"{TAG} Programme A", "board": "CBSE",
            "academic_year_id": year_id, "class_id": klass.id,
            "effective_from": str(date.today() - timedelta(days=30))})
        assert code == 201 and first["status"] == "draft", first
        code, second = request("POST", "/school/academics/curricula", token=tok, body={
            "name": f"{TAG} Programme B", "board": "CBSE",
            "academic_year_id": year_id, "class_id": klass.id})
        assert code == 201, second

        code, live = request("POST", f"/school/academics/curricula/{first['id']}/activate",
                             token=tok)
        assert code == 200 and live["status"] == "active", live
        assert live["retired"] == [], "nothing held the slot before"

        code, swapped = request(
            "POST", f"/school/academics/curricula/{second['id']}/activate", token=tok)
        assert code == 200 and swapped["status"] == "active", swapped
        assert any(r["id"] == first["id"] for r in swapped["retired"]), swapped["retired"]

        code, listed = request(
            f"GET", f"/school/academics/curricula?academic_year_id={year_id}&state=active",
            token=tok)
        mine = [c for c in listed if c["name"].startswith(TAG)]
        assert len(mine) == 1 and mine[0]["id"] == second["id"], mine
        print(f"  activating B retired A; exactly one in force for {klass.name}")

        section("A programme says what a subject is worth")
        code, withsub = request(
            "PUT", f"/school/academics/curricula/{second['id']}/subjects", token=tok,
            body={"subject_id": subject_ids[0], "periods_per_week": 6, "is_core": True})
        assert code == 200, withsub
        assert withsub["periods_per_week"] == 6, withsub
        assert withsub["subjects"][0]["periods_per_week"] == 6, withsub["subjects"]
        print(f"  {withsub['subject_count']} subject(s), "
              f"{withsub['periods_per_week']} period(s) a week in total")

        section("An activity at capacity refuses the next child")
        code, club = request("POST", "/school/academics/activities", token=tok, body={
            "name": f"{TAG} Chess Club", "kind": "club", "capacity": 2,
            "day_of_week": 3, "venue": "Room 4"})
        assert code == 201, club
        aid = club["id"]
        assert club["capacity"] == 2 and club["places_left"] == 2, club

        db = SessionLocal()
        try:
            from app.models.student import Student
            kids = [
                s.id for s in db.execute(
                    select(Student).where(
                        Student.school_id == devdata.school_id(),
                        Student.is_active.is_(True),
                    ).order_by(Student.id).limit(3)
                ).scalars()
            ]
        finally:
            db.close()
        assert len(kids) >= 3, "the seed has at least three children"

        for kid in kids[:2]:
            code, joined = request(f"POST", f"/school/academics/activities/{aid}/members",
                                   token=tok, body={"student_id": kid})
            assert code == 200, joined
        assert joined["members"] == 2 and joined["is_full"], joined

        code, full = request("POST", f"/school/academics/activities/{aid}/members",
                             token=tok, body={"student_id": kids[2]})
        assert code == 400 and "full" in full["detail"], full
        print(f"  refused: {full['detail']}")

        section("The same child cannot join twice")
        code, again = request("POST", f"/school/academics/activities/{aid}/members",
                              token=tok, body={"student_id": kids[0]})
        assert code == 400 and "already in" in again["detail"], again
        print(f"  refused: {again['detail']}")

        section("Leaving frees a place and keeps the record")
        code, left = request("POST", f"/school/academics/activities/{aid}/members/leave",
                             token=tok, body={"student_id": kids[0]})
        assert code == 200, left
        assert left["members"] == 1 and not left["is_full"], left
        gone = next(r for r in left["roster"] if r["student_id"] == kids[0])
        assert gone["left_on"] and not gone["is_current"], (
            "a child who was in the club last term still was")
        code, now_fits = request("POST", f"/school/academics/activities/{aid}/members",
                                 token=tok, body={"student_id": kids[2]})
        assert code == 200 and now_fits["members"] == 2, now_fits
        print("  one left, the record of them stayed, and the next child got the place")

        section("A requisition cannot be decided by whoever raised it")
        code, req = request("POST", "/school/hr-ops/requisitions", token=tok, body={
            "title": f"{TAG} Second maths teacher", "headcount": 1,
            "reason": "Two classes are sharing one teacher.",
            "needed_by": str(date.today() + timedelta(days=60))})
        assert code == 201 and req["status"] == "draft", req
        code, sent = request(f"POST", f"/school/hr-ops/requisitions/{req['id']}/submit",
                             token=tok)
        assert code == 200 and sent["status"] == "submitted", sent

        code, own = request(f"POST", f"/school/hr-ops/requisitions/{req['id']}/decide",
                            token=tok, body={"approve": True})
        assert code == 400 and "Somebody else" in own["detail"], own
        print(f"  refused: {own['detail']}")

        code, decided = request(
            "POST", f"/school/hr-ops/requisitions/{req['id']}/decide", token=ptok,
            body={"approve": True, "note": "Agreed for September."})
        assert code == 200 and decided["status"] == "approved", decided
        assert decided["decided_by"] and decided["decided_at"], decided
        print(f"  the principal agreed, and the record names them: {decided['decided_by']}")

        section("Only an approved post can be filled")
        code, other = request("POST", "/school/hr-ops/requisitions", token=tok, body={
            "title": f"{TAG} Unapproved post", "reason": "Not yet agreed."})
        code, err = request(f"POST", f"/school/hr-ops/requisitions/{other['id']}/status",
                            token=tok, body={"status": "filled"})
        assert code == 400 and "nobody approved" in err["detail"], err
        print(f"  refused: {err['detail']}")

        section("A new starter's checklist is not empty")
        db = SessionLocal()
        try:
            staff = onboarding_fixture_staff(db)
        finally:
            db.close()
        if staff is None:
            print("  (every staff member already has a checklist; skipped)")
        else:
            created_staff_id = staff.id
            code, before = request(f"GET", f"/school/hr-ops/onboarding/{staff.id}",
                                   token=tok)
            assert code == 200 and before["total"] == 0 and not before["started"], before

            code, started = request(
                "POST", f"/school/hr-ops/onboarding/{staff.id}", token=tok,
                body={"due_on": str(date.today() + timedelta(days=7))})
            assert code == 201, started
            assert started["total"] >= 7, (
                "a checklist arrives with the standard set, not empty")
            assert started["done"] == 0 and started["outstanding"] == started["total"]
            areas = {t["area"] for t in started["tasks"]}
            assert len(areas) >= 5, areas
            print(f"  {started['total']} task(s) across {len(areas)} area(s), none ticked")

            code, dup = request(f"POST", f"/school/hr-ops/onboarding/{staff.id}",
                                token=tok, body={})
            assert code == 400 and "already has" in dup["detail"], dup

            first_task = started["tasks"][0]
            code, ticked = request(
                "POST", f"/school/hr-ops/onboarding/tasks/{first_task['id']}",
                token=tok, body={"is_done": True})
            assert code == 200 and ticked["done"] == 1, ticked
            done_row = next(t for t in ticked["tasks"] if t["id"] == first_task["id"])
            assert done_row["done_by"] and done_row["done_at"], done_row
            print(f"  one ticked by {done_row['done_by']}; "
                  f"{ticked['outstanding']} still outstanding")

            code, out = request("GET", "/school/hr-ops/onboarding/outstanding", token=tok)
            assert code == 200, out
            assert any(s["staff_id"] == staff.id for s in out["starters"]), out
            print(f"  {out['count']} starter(s) with work left, "
                  f"{out['with_overdue']} overdue")

        section("A teacher cannot reach any of it")
        ttok = login("teacher", devdata.TEACHER_EMAIL, "TeacherPass123!")
        for path in ("/school/academics/groups", "/school/academics/curricula",
                     "/school/hr-ops/requisitions",
                     "/school/hr-ops/onboarding/outstanding"):
            code, err = request("GET", path, token=ttok)
            assert code == 403, f"a teacher reached {path}: {code}"
        print("  refused the groups, the curricula, the requisitions and the checklists")

        print("\nALL ACADEMICS-AND-HR CHECKS PASSED")
    finally:
        if created_staff_id is not None:
            db = SessionLocal()
            try:
                db.execute(OnboardingTask.__table__.delete().where(
                    OnboardingTask.staff_id == created_staff_id))
                db.commit()
            finally:
                db.close()
        cleanup()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
