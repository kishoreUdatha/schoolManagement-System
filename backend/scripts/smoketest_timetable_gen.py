"""Smoke test for timetable generation and the school-wide timetable views.

Verifies:
    A generator that cannot fit the week says so before it starts, rather
    than filling what it can and leaving somebody to notice.
    It never double-books a teacher, anywhere in the school — not just within
    the section it is filling.
    It respects the hours a teacher has said they cannot teach.
    When it comes up short it names the subject and why, and does not report
    itself complete.
    Generating twice does not silently duplicate a week.

Run:
    docker exec sms-backend python -m scripts.smoketest_timetable_gen
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from sqlalchemy import func, select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.cover import TeacherUnavailability
from app.models.subject import ClassSubject
from app.models.timetable import Period, TimetableEntry
from app.models.user import User
from scripts import devdata

BASE = "http://localhost:8000/api/v1"
ADMIN = ("school@sms.local", "SchoolPass123!")
TAG = "SMOKE-TTGEN"


def request(method, path, *, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
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


def login():
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


def snapshot_entries(section_id):
    db = SessionLocal()
    try:
        return [
            (e.period_id, e.class_subject_id) for e in db.execute(
                select(TimetableEntry).where(TimetableEntry.section_id == section_id)
            ).scalars()
        ]
    finally:
        db.close()


def restore(section_id, rows, wants):
    """Put the section's week and the subject targets back as they were."""
    db = SessionLocal()
    try:
        db.execute(TimetableEntry.__table__.delete().where(
            TimetableEntry.section_id == section_id))
        ids = devdata.school()
        for period_id, cs_id in rows:
            db.add(TimetableEntry(**ids, section_id=section_id,
                                  period_id=period_id, class_subject_id=cs_id))
        for cs_id, n in wants.items():
            cs = db.get(ClassSubject, cs_id)
            if cs:
                cs.periods_per_week = n
        db.execute(TeacherUnavailability.__table__.delete().where(
            TeacherUnavailability.reason == f"{TAG} blocked"))
        db.commit()
    finally:
        db.close()


def main():
    tok = login()
    section_id = devdata.section_id("A")
    cs_ids = devdata.class_subject_ids()
    before = snapshot_entries(section_id)

    db = SessionLocal()
    try:
        wants_before = {
            cs.id: cs.periods_per_week for cs in db.execute(
                select(ClassSubject).where(ClassSubject.id.in_(cs_ids))
            ).scalars()
        }
        slots = db.execute(select(func.count(Period.id)).where(
            Period.school_id == devdata.school_id(), Period.is_break.is_(False)
        )).scalar_one()
        teacher_of = {
            cs.id: cs.teacher_user_id for cs in db.execute(
                select(ClassSubject).where(ClassSubject.id.in_(cs_ids))
            ).scalars()
        }
    finally:
        db.close()
    assert slots > 0, "the seed lays out a period grid"

    try:
        section("Asking for more than the week holds is refused up front")
        code, _ = request("PUT", f"/school/timetable-gen/class-subjects/{cs_ids[0]}/periods",
                          token=tok, body={"periods_per_week": slots + 5})
        assert code == 200, _
        code, err = request(f"POST", f"/school/timetable-gen/sections/{section_id}/generate",
                            token=tok, body={"replace": True})
        assert code == 400 and "only" in err["detail"], err
        print(f"  {err['detail'][:74]}…")

        section("A week that fits gets filled")
        # three subjects, a sensible share of the week each
        share = max(slots // (len(cs_ids) + 1), 1)
        for cs_id in cs_ids:
            request("PUT", f"/school/timetable-gen/class-subjects/{cs_id}/periods",
                    token=tok, body={"periods_per_week": share})
        code, req = request("GET", f"/school/timetable-gen/sections/{section_id}/requirements",
                            token=tok)
        assert code == 200 and req["fits"], req
        code, gen = request("POST", f"/school/timetable-gen/sections/{section_id}/generate",
                            token=tok, body={"replace": True, "seed": 7})
        assert code == 200, gen
        assert gen["placed"] == share * len(cs_ids), gen
        assert gen["complete"] and not gen["unplaced"], gen
        print(f"  placed {gen['placed']}, {gen['left_empty']} slot(s) left free")

        section("Every subject got exactly what it asked for")
        code, after = request("GET", f"/school/timetable-gen/sections/{section_id}/requirements",
                              token=tok)
        for row in after["subjects"]:
            if row["periods_per_week"]:
                assert row["placed"] == row["periods_per_week"], row
                assert row["short_by"] == 0, row
        print("  no subject short, none over")

        section("Nobody is in two rooms at once")
        db = SessionLocal()
        try:
            pairs = []
            for e, cs in db.execute(
                select(TimetableEntry, ClassSubject)
                .join(ClassSubject, ClassSubject.id == TimetableEntry.class_subject_id)
                .where(TimetableEntry.school_id == devdata.school_id())
            ).all():
                if cs.teacher_user_id:
                    pairs.append((cs.teacher_user_id, e.period_id))
            assert len(pairs) == len(set(pairs)), "a teacher is double-booked somewhere"
        finally:
            db.close()
        code, dash = request("GET", "/school/timetable-gen/dashboard", token=tok)
        assert code == 200 and not dash["clashes"], dash["clashes"]
        print(f"  {len(pairs)} lessons across the school, no teacher twice in a slot")

        section("An hour a teacher cannot teach is left alone")
        blocked_cs = next((c for c in cs_ids if teacher_of.get(c)), None)
        assert blocked_cs, "at least one subject has a teacher"
        teacher_id = teacher_of[blocked_cs]
        db = SessionLocal()
        try:
            ids = devdata.school()
            day = db.execute(select(Period.day_of_week).where(
                Period.school_id == ids["school_id"], Period.is_break.is_(False)
            ).order_by(Period.day_of_week)).scalars().first()
            # the whole of that day is off for them
            db.add(TeacherUnavailability(**ids, user_id=teacher_id, day_of_week=day,
                                         period_number=None, reason=f"{TAG} blocked"))
            db.commit()
        finally:
            db.close()

        code, gen2 = request("POST", f"/school/timetable-gen/sections/{section_id}/generate",
                             token=tok, body={"replace": True, "seed": 7})
        assert code == 200, gen2
        db = SessionLocal()
        try:
            on_blocked_day = 0
            for e, cs in db.execute(
                select(TimetableEntry, ClassSubject)
                .join(ClassSubject, ClassSubject.id == TimetableEntry.class_subject_id)
                .where(TimetableEntry.section_id == section_id)
            ).all():
                p = db.get(Period, e.period_id)
                if cs.teacher_user_id == teacher_id and p.day_of_week == day:
                    on_blocked_day += 1
            assert on_blocked_day == 0, (
                f"{on_blocked_day} lesson(s) placed on a day the teacher is unavailable")
        finally:
            db.close()
        print(f"  day {day} kept clear for that teacher")

        section("Coming up short is reported, not hidden")
        # demand the entire week for one subject whose teacher is blocked a day
        request("PUT", f"/school/timetable-gen/class-subjects/{blocked_cs}/periods",
                token=tok, body={"periods_per_week": slots})
        for other in cs_ids:
            if other != blocked_cs:
                request("PUT", f"/school/timetable-gen/class-subjects/{other}/periods",
                        token=tok, body={"periods_per_week": 0})
        code, gen3 = request("POST", f"/school/timetable-gen/sections/{section_id}/generate",
                             token=tok, body={"replace": True, "seed": 7})
        assert code == 200, gen3
        assert gen3["unplaced"], "it cannot fit a full week around a blocked day"
        assert not gen3["complete"], "and it must not call that complete"
        assert gen3["unplaced"][0]["because"], gen3["unplaced"][0]
        print(f"  short by {gen3['unplaced'][0]['still_short']}: "
              f"{gen3['unplaced'][0]['because'][:52]}…")

        section("Generating again does not double the week")
        code, gen4 = request("POST", f"/school/timetable-gen/sections/{section_id}/generate",
                             token=tok, body={"replace": False, "seed": 7})
        assert code == 200, gen4
        db = SessionLocal()
        try:
            rows = list(db.execute(select(TimetableEntry).where(
                TimetableEntry.section_id == section_id)).scalars())
            keys = [(r.period_id) for r in rows]
            assert len(keys) == len(set(keys)), "two lessons landed in one slot"
            assert len(rows) <= slots, (len(rows), slots)
        finally:
            db.close()
        print(f"  {len(rows)} entries, one per slot at most")

        section("The coordinator can see a whole day")
        code, co = request("GET", "/school/timetable-gen/coordinator?day_of_week=1", token=tok)
        assert code == 200 and "sections" in co and "periods" in co, co
        print(f"  Monday: {len(co['sections'])} section(s) across {len(co['periods'])} period(s)")

        print("\nALL TIMETABLE-GENERATION CHECKS PASSED")
    finally:
        restore(section_id, before, wants_before)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("\nFAILED:", e)
        sys.exit(1)
