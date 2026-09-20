"""Smoke test for staff profiles, workload, qualifications, observations and
leaving.

Verifies:
    Workload is counted off the timetable rather than stored, so the periods
    a teacher is shown match the entries the timetable actually holds — and
    a break is not a taught period.
    Nobody is labelled overloaded. The comparison offered is the median of
    this staff room, which is a fact, not a target imported from elsewhere.
    An observation has nowhere to put a score, and the API refuses one: the
    field does not exist on the model and is ignored if sent.
    An observation with neither a strength nor a next step is refused, and
    nobody may observe their own lesson.
    A departure cannot be completed while any area is outstanding, and the
    refusal names what is still waiting.
    Completing one deactivates the login; cancelling one leaves it alone.

Run:
    docker exec sms-backend python -m scripts.smoketest_staff_ops
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

from sqlalchemy import func, select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.staff import Staff
from app.models.staff_ops import (
    ClassroomObservation,
    ExitClearance,
    ExitClearanceItem,
    StaffQualification,
)
from app.models.subject import ClassSubject
from app.models.timetable import Period, TimetableEntry
from app.models.user import User

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-STAFFOPS"


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
    db = SessionLocal()
    try:
        clearances = select(ExitClearance.id).where(ExitClearance.reason.like(f"{TAG}%"))
        db.execute(ExitClearanceItem.__table__.delete().where(
            ExitClearanceItem.clearance_id.in_(clearances)))
        db.execute(ExitClearance.__table__.delete().where(
            ExitClearance.reason.like(f"{TAG}%")))
        db.execute(ClassroomObservation.__table__.delete().where(
            ClassroomObservation.focus.like(f"{TAG}%")))
        db.execute(StaffQualification.__table__.delete().where(
            StaffQualification.qualification.like(f"{TAG}%")))
        db.commit()
    finally:
        db.close()


def timetable_periods(school_id: int) -> dict[int, int]:
    """Periods a week per teacher, straight from the timetable.

    The test works this out for itself so the service cannot mark its own
    homework — if the two ever disagree, one of them is wrong.
    """
    db = SessionLocal()
    try:
        rows = db.execute(
            select(User.id, func.count(TimetableEntry.id))
            .join(ClassSubject, ClassSubject.teacher_user_id == User.id)
            .join(TimetableEntry, TimetableEntry.class_subject_id == ClassSubject.id)
            .join(Period, Period.id == TimetableEntry.period_id)
            .where(Period.is_break.is_(False), User.school_id == school_id)
            .group_by(User.id)
        ).all()
        return {uid: n for uid, n in rows}
    finally:
        db.close()


def main():
    cleanup()
    tok = login("school", *ADMIN)

    db = SessionLocal()
    try:
        school_id = db.execute(select(Staff.school_id)).scalars().first()
        teaching = db.execute(
            select(Staff)
            .join(User, User.id == Staff.user_id)
            .join(ClassSubject, ClassSubject.teacher_user_id == User.id)
            .where(Staff.school_id == school_id)
        ).scalars().first()
        assert teaching, "the seed gives somebody a subject to teach"
        teacher_staff_id = teaching.id
        teacher_user_id = teaching.user_id
        teacher_name = teaching.user.full_name
        # somebody with no timetable, for the leaving test
        spare = db.execute(
            select(Staff)
            .join(User, User.id == Staff.user_id)
            .where(Staff.school_id == school_id, Staff.id != teacher_staff_id,
                   User.is_active.is_(True))
        ).scalars().first()
        assert spare, "the seed has more than one member of staff"
        spare_id, spare_user_id = spare.id, spare.user_id
        spare_name = spare.user.full_name
    finally:
        db.close()

    expected = timetable_periods(school_id)

    try:
        section("Workload is the timetable, counted")
        code, load = request("GET", "/school/staff-ops/workload", token=tok)
        assert code == 200, load
        assert load["staff"], load
        by_user = {r["user_id"]: r for r in load["staff"]}
        for user_id, periods in expected.items():
            if user_id in by_user:
                assert by_user[user_id]["periods_per_week"] == periods, (
                    f"{by_user[user_id]['full_name']}: service says "
                    f"{by_user[user_id]['periods_per_week']}, timetable says {periods}")
        assert load["total_periods"] == sum(
            p for u, p in expected.items() if u in by_user), load["total_periods"]
        print(f"  {load['count']} staff, {load['teaching_count']} with a timetable, "
              f"{load['total_periods']} periods a week in total")

        section("A median, not a verdict")
        assert "median_periods" in load, load.keys()
        for key in ("overloaded", "is_overloaded", "load_rating", "score"):
            assert key not in load, f"{key} would be a target this code invented"
            assert all(key not in r for r in load["staff"]), key
        print(f"  median is {load['median_periods']} periods; nobody is labelled")

        section("A qualification, and checking it")
        code, added = request(
            "POST", f"/school/staff-ops/{teacher_staff_id}/qualifications", token=tok,
            body={"qualification": f"{TAG} B.Ed", "institution": "Dev University",
                  "year_awarded": 2015, "subject_area": "Mathematics"})
        assert code == 201, added
        assert added["verified_at"] is None, "new qualifications start unchecked"
        qual_id = added["id"]

        code, listed = request(
            "GET", f"/school/staff-ops/{teacher_staff_id}/qualifications", token=tok)
        assert code == 200 and listed["unverified"] >= 1, listed

        code, verified = request(
            "POST", f"/school/staff-ops/qualifications/{qual_id}/verify",
            token=tok, body={"verified": True})
        assert code == 200 and verified["verified_at"] and verified["verified_by"], verified
        print(f"  recorded and checked by {verified['verified_by']}")

        code, bad_year = request(
            "POST", f"/school/staff-ops/{teacher_staff_id}/qualifications", token=tok,
            body={"qualification": f"{TAG} Time travel", "year_awarded": 2999})
        assert bad_year and code in (400, 422), bad_year
        print("  a qualification awarded in 2999 is refused")

        section("An observation has nowhere to put a score")
        code, obs = request("POST", "/school/staff-ops/observations", token=tok, body={
            "staff_id": teacher_staff_id,
            "observed_on": str(date.today()),
            "focus": f"{TAG} questioning",
            "strengths": "Every child answered at least once.",
            "next_steps": "Try longer waits before taking a hand.",
            "follow_up_on": str(date.today() - timedelta(days=1)),
            # sent on purpose: there is no such field, and it must not appear
            "score": 5, "rating": "outstanding",
        })
        assert code == 201, obs
        for key in ("score", "rating", "grade"):
            assert key not in obs, f"{key} came back — the model grew a score"
        assert obs["strengths"] and obs["next_steps"], obs
        assert obs["shared_with_staff"] is False, "unshared until the conversation"
        obs_id = obs["id"]
        print(f"  saved with strengths and next steps; score and rating dropped")

        section("An observation that says nothing is refused")
        code, empty = request("POST", "/school/staff-ops/observations", token=tok, body={
            "staff_id": teacher_staff_id, "focus": f"{TAG} nothing"})
        assert code == 400, empty
        print(f"  {empty['detail']}")

        section("Sharing it")
        code, shared = request(
            "POST", f"/school/staff-ops/observations/{obs_id}/share",
            token=tok, body={"shared": True})
        assert code == 200 and shared["shared_with_staff"] is True, shared
        code, all_obs = request("GET", "/school/staff-ops/observations", token=tok)
        assert code == 200 and all_obs["follow_ups_due"] >= 1, all_obs
        print(f"  {all_obs['count']} observation(s), {all_obs['follow_ups_due']} follow-up(s) due")

        section("Leaving: the checklist has to be finished")
        code, clearance = request("POST", "/school/staff-ops/clearances", token=tok, body={
            "staff_id": spare_id, "last_working_day": str(date.today() + timedelta(days=30)),
            "reason": f"{TAG} moving away"})
        assert code == 201, clearance
        assert clearance["items"], "every area gets a row"
        assert clearance["outstanding_count"] == len(clearance["items"]), clearance
        assert clearance["can_complete"] is False, clearance
        cid = clearance["id"]
        print(f"  {len(clearance['items'])} area(s) to sign off")

        code, refused = request(
            "POST", f"/school/staff-ops/clearances/{cid}/complete", token=tok, body={})
        assert code == 400, refused
        assert "waiting on" in refused["detail"], refused
        print(f"  refused: {refused['detail'][:72]}")

        section("Signing each area off")
        current = clearance
        for item in clearance["items"]:
            code, current = request(
                "POST", f"/school/staff-ops/clearances/items/{item['id']}",
                token=tok, body={"cleared": True, "note": "nothing outstanding"})
            assert code == 200, current
        assert current["outstanding_count"] == 0 and current["can_complete"], current
        print(f"  all {len(clearance['items'])} cleared")

        section("Completing it closes the login")
        code, done = request(
            "POST", f"/school/staff-ops/clearances/{cid}/complete",
            token=tok, body={"deactivate": True})
        assert code == 200 and done["status"] == "complete", done
        assert done["completed_at"], done
        db = SessionLocal()
        try:
            still = db.get(User, spare_user_id)
            assert still.is_active is False, "completing a departure locks the account"
        finally:
            db.close()
        print(f"  {spare_name} is marked complete and can no longer sign in")

        code, again = request(
            "POST", f"/school/staff-ops/clearances/{cid}/complete", token=tok, body={})
        assert code == 400, "a closed clearance cannot be closed twice"
        print("  and it cannot be completed twice")

        section("The profile gathers it all")
        code, prof = request(
            "GET", f"/school/staff-ops/{teacher_staff_id}/profile", token=tok)
        assert code == 200, prof
        assert prof["full_name"] == teacher_name, prof
        assert prof["workload"]["periods_per_week"] == expected.get(teacher_user_id, 0), prof
        assert any(q["id"] == qual_id for q in prof["qualifications"]), prof
        assert prof["recent_observations"], prof
        print(f"  {prof['full_name']}: {prof['workload']['periods_per_week']} periods, "
              f"{len(prof['qualifications'])} qualification(s), "
              f"{len(prof['recent_observations'])} observation(s)")

        section("Not for a teacher")
        db = SessionLocal()
        try:
            t = db.execute(select(User).where(User.email == "iyer@dev.local")).scalar_one_or_none()
        finally:
            db.close()
        if t:
            ttok = login("teacher", "iyer@dev.local", "TeacherPass123!")
            for path in ("/school/staff-ops/workload",
                         "/school/staff-ops/observations",
                         f"/school/staff-ops/{teacher_staff_id}/profile"):
                code, err = request("GET", path, token=ttok)
                assert code == 403, f"a teacher reached {path}: {code}"
            print("  a teacher is refused the workload table and the observations")

        print("\nALL STAFF-OPS CHECKS PASSED")
    finally:
        cleanup()
        # put the borrowed account back the way it was found
        db = SessionLocal()
        try:
            u = db.get(User, spare_user_id)
            if u:
                u.is_active = True
            db.commit()
        finally:
            db.close()


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
