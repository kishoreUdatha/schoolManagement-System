"""Filling a timetable in, and seeing the state of all of them at once.

The generator is deliberately modest. It does not try to produce a perfect
timetable — that is a constraint problem a school solves with argument and
local knowledge, not an algorithm. What it does is the tedious part: put each
subject in the room it needs, the right number of times a week, without
double-booking a teacher, and then say plainly what it could not place.

A generator that silently produces a full grid by ignoring a constraint is
worse than one that leaves four slots empty and tells you which four.
"""
from __future__ import annotations

import random
from collections import defaultdict
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.academic import SchoolClass, Section
from app.models.cover import TeacherUnavailability
from app.models.facility import Room
from app.models.subject import ClassSubject, Subject
from app.models.timetable import Period, TimetableEntry
from app.models.user import User


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _400(why: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, why)


def _section(db: Session, section_id: int, school_id: int) -> Section:
    s = db.get(Section, section_id)
    if not s or s.school_id != school_id:
        raise _404("Section")
    return s


# ---------- the state of every timetable ----------


def dashboard(db: Session, school_id: int) -> dict:
    """How complete each section's week is, and what is wrong with it.

    A clash list on its own answers "is anything broken". The question before
    that is "is anything finished", which nothing could answer.
    """
    periods = list(db.execute(
        select(Period).where(Period.school_id == school_id, Period.is_break.is_(False))
    ).scalars())
    teaching_slots = len(periods)

    sections = list(db.execute(
        select(Section, SchoolClass)
        .join(SchoolClass, SchoolClass.id == Section.class_id)
        .where(Section.school_id == school_id)
        .order_by(SchoolClass.name, Section.name)
    ).all())

    filled_by_section = dict(db.execute(
        select(TimetableEntry.section_id, func.count(TimetableEntry.id))
        .where(TimetableEntry.school_id == school_id)
        .group_by(TimetableEntry.section_id)
    ).all())

    rows = []
    for sec, cls in sections:
        filled = filled_by_section.get(sec.id, 0)
        rows.append({
            "section_id": sec.id,
            "class_name": cls.name,
            "section_name": sec.name,
            "filled": filled,
            "slots": teaching_slots,
            "percent": round(filled / teaching_slots * 100, 1) if teaching_slots else 0.0,
            "empty": max(teaching_slots - filled, 0),
        })

    # A teacher standing in two rooms at once, counted once per collision.
    clashes = []
    seen: dict[tuple[int, int], list[int]] = defaultdict(list)
    for entry, cs in db.execute(
        select(TimetableEntry, ClassSubject)
        .join(ClassSubject, ClassSubject.id == TimetableEntry.class_subject_id)
        .where(TimetableEntry.school_id == school_id)
    ).all():
        if cs.teacher_user_id:
            seen[(cs.teacher_user_id, entry.period_id)].append(entry.section_id)
    for (teacher_id, period_id), section_ids in seen.items():
        if len(section_ids) > 1:
            teacher = db.get(User, teacher_id)
            period = db.get(Period, period_id)
            clashes.append({
                "teacher_id": teacher_id,
                "teacher_name": teacher.full_name if teacher else None,
                "day_of_week": period.day_of_week if period else None,
                "period_number": period.period_number if period else None,
                "sections": len(section_ids),
            })

    total_slots = teaching_slots * len(rows)
    total_filled = sum(r["filled"] for r in rows)
    return {
        "teaching_slots_per_week": teaching_slots,
        "sections": rows,
        "complete": sum(1 for r in rows if r["empty"] == 0 and teaching_slots),
        "not_started": sum(1 for r in rows if r["filled"] == 0),
        "percent": round(total_filled / total_slots * 100, 1) if total_slots else 0.0,
        "clashes": clashes,
    }


# ---------- what a section still needs ----------


def requirements(db: Session, school_id: int, section_id: int) -> dict:
    """Each subject's target for the week against what is already placed."""
    sec = _section(db, section_id, school_id)
    subjects = list(db.execute(
        select(ClassSubject, Subject, User.full_name)
        .join(Subject, Subject.id == ClassSubject.subject_id)
        .join(User, User.id == ClassSubject.teacher_user_id, isouter=True)
        .where(ClassSubject.class_id == sec.class_id)
        .order_by(Subject.display_order, Subject.name)
    ).all())

    placed = dict(db.execute(
        select(TimetableEntry.class_subject_id, func.count(TimetableEntry.id))
        .where(TimetableEntry.section_id == section_id)
        .group_by(TimetableEntry.class_subject_id)
    ).all())

    rows = []
    for cs, subject, teacher in subjects:
        have = placed.get(cs.id, 0)
        rows.append({
            "class_subject_id": cs.id,
            "subject_name": subject.name,
            "teacher_name": teacher,
            "has_teacher": cs.teacher_user_id is not None,
            "periods_per_week": cs.periods_per_week,
            "placed": have,
            "short_by": max(cs.periods_per_week - have, 0),
            "over_by": max(have - cs.periods_per_week, 0) if cs.periods_per_week else 0,
        })

    slots = db.execute(
        select(func.count(Period.id)).where(
            Period.school_id == school_id, Period.is_break.is_(False)
        )
    ).scalar_one()
    wanted = sum(r["periods_per_week"] for r in rows)

    return {
        "section_id": section_id,
        "teaching_slots_per_week": slots,
        "periods_wanted": wanted,
        # Said plainly rather than discovered halfway through generating.
        "fits": wanted <= slots,
        "over_by": max(wanted - slots, 0),
        "unset": [r["subject_name"] for r in rows if not r["periods_per_week"]],
        "subjects": rows,
    }


# ---------- filling it in ----------


def _preferred_room(db: Session, school_id: int, section_id: int, pref: Optional[str]) -> Optional[Room]:
    if not pref or pref == "none":
        return None
    if pref == "home":
        room = db.execute(
            select(Room).where(Room.school_id == school_id, Room.section_id == section_id).limit(1)
        ).scalar_one_or_none()
        if room is None:
            raise _400("This section has no home room. Set one under Rooms, or choose a room.")
        return room
    if not pref.isdigit():
        raise _400("Room preference must be none, home or a room")
    room = db.get(Room, int(pref))
    if not room or room.school_id != school_id:
        raise _404("Room")
    return room


def generate(db: Session, school_id: int, section_id: int, *,
             replace: bool = False, seed: Optional[int] = None,
             max_consecutive: Optional[int] = None, room_preference: Optional[str] = None) -> dict:
    """Place each subject its required number of times, and report the rest.

    Deliberately simple: shuffle the slots, walk the subjects hardest-first
    (the ones with the most periods to place and the least room to place
    them), and take the first slot that breaks nothing. No backtracking. A
    cleverer search would find a fuller grid, and would also be a great deal
    harder to explain to somebody staring at the four lessons it moved.

    Nothing is placed where a teacher is already busy, anywhere in the school,
    or where they have said they are unavailable.
    """
    sec = _section(db, section_id, school_id)
    room = _preferred_room(db, school_id, section_id, room_preference)

    # Clear first, then count. Asking what is still needed while last term's
    # timetable is still in the table says everything is already placed, so
    # the generator would put in almost nothing and call it complete.
    if replace:
        db.execute(
            TimetableEntry.__table__.delete().where(
                TimetableEntry.section_id == section_id
            )
        )
        db.flush()

    need = requirements(db, school_id, section_id)
    if not need["fits"]:
        raise _400(
            f"The subjects want {need['periods_wanted']} periods a week but there "
            f"are only {need['teaching_slots_per_week']}. Reduce something first."
        )

    periods = list(db.execute(
        select(Period).where(Period.school_id == school_id, Period.is_break.is_(False))
        .order_by(Period.day_of_week, Period.period_number)
    ).scalars())
    if not periods:
        raise _400("Set up the period grid before generating a timetable.")

    taken_here = {
        e.period_id for e in db.execute(
            select(TimetableEntry).where(TimetableEntry.section_id == section_id)
        ).scalars()
    }

    # Every teacher already busy in that slot, in any section of the school.
    busy: dict[int, set[int]] = defaultdict(set)
    for entry, cs in db.execute(
        select(TimetableEntry, ClassSubject)
        .join(ClassSubject, ClassSubject.id == TimetableEntry.class_subject_id)
        .where(TimetableEntry.school_id == school_id,
               TimetableEntry.section_id != section_id)
    ).all():
        if cs.teacher_user_id:
            busy[cs.teacher_user_id].add(entry.period_id)
    # This section's own kept lessons count against the teacher's run too.
    for entry, cs in db.execute(
        select(TimetableEntry, ClassSubject)
        .join(ClassSubject, ClassSubject.id == TimetableEntry.class_subject_id)
        .where(TimetableEntry.section_id == section_id)
    ).all():
        if cs.teacher_user_id:
            busy[cs.teacher_user_id].add(entry.period_id)

    # Which room is taken when, so the preferred room is not double-booked.
    room_busy: set[int] = set()
    if room is not None:
        room_busy = set(db.execute(
            select(TimetableEntry.period_id).where(TimetableEntry.room_id == room.id)
        ).scalars())
    by_id = {p.id: p for p in db.execute(select(Period).where(Period.school_id == school_id)).scalars()}
    # teaching periods per day, in order, for counting a run
    day_numbers: dict[int, list[int]] = defaultdict(list)
    for p in periods:
        day_numbers[p.day_of_week].append(p.period_number)

    def run_ok(teacher_id: Optional[int], p: Period) -> bool:
        """Would this slot give the teacher more than max_consecutive in a row?"""
        if not max_consecutive or teacher_id is None:
            return True
        mine = {(by_id[x].day_of_week, by_id[x].period_number) for x in busy[teacher_id] if x in by_id}
        mine.add((p.day_of_week, p.period_number))
        order = day_numbers[p.day_of_week]
        run = best = 0
        for n in order:  # breaks are not in the list, so a break does not end a run
            run = run + 1 if (p.day_of_week, n) in mine else 0
            best = max(best, run)
        return best <= max_consecutive

    # And the hours they have said they cannot teach.
    blocked: dict[int, set[tuple[int, Optional[int]]]] = defaultdict(set)
    for b in db.execute(
        select(TeacherUnavailability).where(TeacherUnavailability.school_id == school_id)
    ).scalars():
        blocked[b.user_id].add((b.day_of_week, b.period_number))

    def free_for(teacher_id: Optional[int], p: Period) -> bool:
        if teacher_id is None:
            return True
        if p.id in busy[teacher_id]:
            return False
        marks = blocked.get(teacher_id, set())
        return (p.day_of_week, None) not in marks and (p.day_of_week, p.period_number) not in marks

    rng = random.Random(seed)
    open_slots = [p for p in periods if p.id not in taken_here]
    rng.shuffle(open_slots)

    # Hardest first: most periods to place, and a teacher with least freedom.
    todo = [r for r in need["subjects"] if r["short_by"] > 0]
    todo.sort(key=lambda r: (-r["short_by"], r["has_teacher"]))

    placed_rows, unplaced = [], []
    no_room = 0  # lessons placed without the preferred room (it was taken)
    # one lesson of a subject per day where possible, so a subject is not
    # stacked into a single morning
    per_day: dict[tuple[int, int], int] = defaultdict(int)

    for row in todo:
        cs = db.get(ClassSubject, row["class_subject_id"])
        left = row["short_by"]
        for spread in (True, False):
            if left <= 0:
                break
            for p in list(open_slots):
                if left <= 0:
                    break
                if spread and per_day[(cs.id, p.day_of_week)] >= 1:
                    continue
                if not free_for(cs.teacher_user_id, p):
                    continue
                if not run_ok(cs.teacher_user_id, p):
                    continue
                room_id = room.id if room is not None and p.id not in room_busy else None
                db.add(TimetableEntry(
                    tenant_id=sec.tenant_id, school_id=school_id,
                    section_id=section_id, period_id=p.id, class_subject_id=cs.id,
                    room_id=room_id,
                ))
                if room_id:
                    room_busy.add(p.id)
                else:
                    no_room += 1 if room is not None else 0
                if cs.teacher_user_id:
                    busy[cs.teacher_user_id].add(p.id)
                per_day[(cs.id, p.day_of_week)] += 1
                open_slots.remove(p)
                left -= 1
                placed_rows.append({
                    "class_subject_id": cs.id,
                    "subject_name": row["subject_name"],
                    "day_of_week": p.day_of_week,
                    "period_number": p.period_number,
                })
        if left > 0:
            unplaced.append({
                "class_subject_id": cs.id,
                "subject_name": row["subject_name"],
                "still_short": left,
                # Why, in the terms somebody can act on.
                "because": (
                    "no free slot left in the week" if not open_slots
                    else f"{row['teacher_name'] or 'the teacher'} is busy, unavailable"
                         + (f" or past {max_consecutive} periods in a row" if max_consecutive else "")
                         + " in every remaining slot"
                ),
            })

    db.commit()
    return {
        "section_id": section_id,
        "placed": len(placed_rows),
        "entries": placed_rows,
        "unplaced": unplaced,
        "left_empty": len(open_slots),
        "room_name": room.name if room is not None else None,
        "without_room": no_room,
        # The honest headline: a generator that reports success while leaving
        # a subject short is one nobody checks afterwards.
        "complete": not unplaced,
    }


def set_periods_per_week(db: Session, school_id: int, class_subject_id: int,
                         periods: int) -> dict:
    cs = db.get(ClassSubject, class_subject_id)
    if not cs or cs.school_id != school_id:
        raise _404("Class subject")
    if periods < 0 or periods > 40:
        raise _400("That is not a plausible number of periods a week.")
    cs.periods_per_week = periods
    db.commit()
    return {"class_subject_id": cs.id, "periods_per_week": cs.periods_per_week}


# ---------- who is teaching what, across the school ----------


def coordinator_view(db: Session, school_id: int, day_of_week: int) -> dict:
    """One day, every section, so a coordinator can see the whole floor.

    A teacher can already see their own week. Nobody could see everybody's.
    """
    periods = list(db.execute(
        select(Period).where(
            Period.school_id == school_id, Period.day_of_week == day_of_week
        ).order_by(Period.period_number)
    ).scalars())

    rows = db.execute(
        select(TimetableEntry, Section, SchoolClass, Subject, User.full_name, Room.name)
        .join(Section, Section.id == TimetableEntry.section_id)
        .join(SchoolClass, SchoolClass.id == Section.class_id)
        .join(ClassSubject, ClassSubject.id == TimetableEntry.class_subject_id)
        .join(Subject, Subject.id == ClassSubject.subject_id)
        .join(User, User.id == ClassSubject.teacher_user_id, isouter=True)
        .join(Room, Room.id == TimetableEntry.room_id, isouter=True)
        .join(Period, Period.id == TimetableEntry.period_id)
        .where(TimetableEntry.school_id == school_id, Period.day_of_week == day_of_week)
    ).all()

    by_section: dict[int, dict] = {}
    for entry, sec, cls, subject, teacher, room in rows:
        bucket = by_section.setdefault(sec.id, {
            "section_id": sec.id,
            "label": f"{cls.name} {sec.name}",
            "lessons": {},
        })
        period = db.get(Period, entry.period_id)
        bucket["lessons"][period.period_number] = {
            "subject_name": subject.name,
            "teacher_name": teacher,
            "room_name": room,
        }

    return {
        "day_of_week": day_of_week,
        "periods": [
            {"period_number": p.period_number, "label": p.label,
             "start_time": p.start_time, "end_time": p.end_time, "is_break": p.is_break}
            for p in periods
        ],
        "sections": sorted(by_section.values(), key=lambda s: s["label"]),
    }
