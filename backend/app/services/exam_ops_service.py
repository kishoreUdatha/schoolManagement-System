"""Running the exam: the datesheet, the halls, the invigilators, the parts a
subject is assessed in, and the decision at the end of the year.

exam_service.py owns the exam itself — what exists, what it is out of, when
marks may be entered, whether results are published. This owns the week the
exam actually happens in.

Nothing here is required. A school that never allocates a hall still runs
exams; every table behind this file is an optional layer, and every read
below copes with it being empty. That is deliberate: an exam module that
refuses to publish results because nobody filled in a seating plan would be
worse than one without seating plans at all.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import MarkStatus, RoomKind, UserRole
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.exam import Exam, ExamSubject
from app.models.exam_ops import (
    ExamRoomAllocation,
    ExamSubjectComponent,
    Invigilation,
    MarkComponent,
)
from app.models.facility import Room
from app.models.mark import Mark
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.tenant import School
from app.models.user import User

# A paper with no time on it is assumed to start here, so a datesheet that
# predates start_time still sorts and still detects an overlap.
ASSUMED_START = time(9, 0)
ASSUMED_MINUTES = 120

# The rooms a school actually sits an exam in. A staff room is a room; it is
# not somewhere thirty children write a paper.
EXAM_ROOM_KINDS = (RoomKind.classroom, RoomKind.hall, RoomKind.lab, RoomKind.computer_lab)


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _400(why: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, why)


def _exam(db: Session, exam_id: int, school_id: int) -> Exam:
    e = db.get(Exam, exam_id)
    if not e or e.school_id != school_id:
        raise _404("Exam")
    return e


def _paper(db: Session, paper_id: int, school_id: int) -> ExamSubject:
    p = db.get(ExamSubject, paper_id)
    if not p or p.school_id != school_id:
        raise _404("Paper")
    return p


def _window(p: ExamSubject) -> tuple[datetime, datetime]:
    """When a paper starts and finishes, filling in what was never recorded."""
    start = datetime.combine(p.exam_date, p.start_time or ASSUMED_START)
    return start, start + timedelta(minutes=p.duration_minutes or ASSUMED_MINUTES)


def _overlap(a: ExamSubject, b: ExamSubject) -> bool:
    if a.exam_date != b.exam_date:
        return False
    a_start, a_end = _window(a)
    b_start, b_end = _window(b)
    return a_start < b_end and b_start < a_end


def _paper_label(db: Session, p: ExamSubject) -> dict:
    cs = db.get(ClassSubject, p.class_subject_id)
    subject = db.get(Subject, cs.subject_id) if cs else None
    cls = db.get(SchoolClass, cs.class_id) if cs else None
    return {
        "paper_id": p.id,
        "class_subject_id": p.class_subject_id,
        "subject_name": subject.name if subject else "Unknown subject",
        "subject_code": subject.code if subject else None,
        "class_id": cls.id if cls else None,
        "class_name": cls.name if cls else None,
        "exam_date": p.exam_date,
        "start_time": p.start_time,
        "duration_minutes": p.duration_minutes,
        "max_marks": p.max_marks,
        "pass_marks": p.pass_marks,
    }


def _candidates(db: Session, p: ExamSubject) -> list[Student]:
    """Everybody sitting one paper: the active children of the class it is set
    for. A paper belongs to a class, not a section, so every section of that
    class sits it."""
    cs = db.get(ClassSubject, p.class_subject_id)
    if not cs:
        return []
    return list(db.execute(
        select(Student)
        .join(Section, Student.section_id == Section.id)
        .where(
            Section.class_id == cs.class_id,
            Student.is_active.is_(True),
            Student.school_id == p.school_id,
        )
        .order_by(Section.name, Student.roll_no, Student.id)
    ).scalars())


# ---------- the exam at a glance ----------


def dashboard(db: Session, school_id: int, exam_id: int) -> dict:
    """Is this exam ready, and if not, what is missing.

    Written as a checklist rather than a percentage. "72% ready" tells the
    office nothing it can act on; "three papers have no invigilator" does.
    """
    exam = _exam(db, exam_id, school_id)
    papers = list(db.execute(
        select(ExamSubject).where(ExamSubject.exam_id == exam_id).order_by(ExamSubject.exam_date)
    ).scalars())

    rows = []
    for p in papers:
        entered = db.execute(
            select(func.count(Mark.id)).where(Mark.exam_subject_id == p.id)
        ).scalar_one()
        expected = len(_candidates(db, p))
        allocated = db.execute(
            select(func.count(ExamRoomAllocation.id))
            .where(ExamRoomAllocation.exam_subject_id == p.id)
        ).scalar_one()
        invigilators = db.execute(
            select(func.count(Invigilation.id)).where(Invigilation.exam_subject_id == p.id)
        ).scalar_one()
        rooms_used = db.execute(
            select(func.count(func.distinct(ExamRoomAllocation.room_id)))
            .where(ExamRoomAllocation.exam_subject_id == p.id)
        ).scalar_one()

        row = _paper_label(db, p)
        row.update({
            "candidates": expected,
            "marks_entered": entered,
            "marks_complete": expected > 0 and entered >= expected,
            "verified": p.marks_verified_at is not None,
            "allocated": allocated,
            "rooms_used": rooms_used,
            "fully_allocated": expected > 0 and allocated >= expected,
            "invigilators": invigilators,
            "invigilators_missing": rooms_used > 0 and invigilators < rooms_used,
        })
        rows.append(row)

    total_expected = sum(r["candidates"] for r in rows)
    total_entered = sum(r["marks_entered"] for r in rows)

    # What actually stands between this exam and published results.
    blockers = []
    unmarked = [r for r in rows if not r["marks_complete"]]
    if unmarked:
        blockers.append({
            "kind": "marks",
            "count": len(unmarked),
            "detail": f"{len(unmarked)} paper(s) still missing marks",
        })
    unverified = [r for r in rows if r["marks_complete"] and not r["verified"]]
    if unverified:
        blockers.append({
            "kind": "verification",
            "count": len(unverified),
            "detail": f"{len(unverified)} paper(s) marked but not signed off",
        })
    if not exam.results_approved_at and not exam.is_published:
        blockers.append({
            "kind": "approval",
            "count": 1,
            "detail": "Results have not been approved by the principal",
        })

    return {
        "exam_id": exam.id,
        "exam_name": exam.name,
        "kind": exam.kind.value,
        "start_date": exam.start_date,
        "end_date": exam.end_date,
        "is_published": exam.is_published,
        "marks_open": exam.marks_open,
        "results_approved_at": exam.results_approved_at,
        "papers": len(rows),
        "candidates": total_expected,
        "marks_entered": total_entered,
        "marks_percent": round(total_entered / total_expected * 100, 1) if total_expected else 0.0,
        "papers_verified": sum(1 for r in rows if r["verified"]),
        "papers_allocated": sum(1 for r in rows if r["fully_allocated"]),
        "rows": rows,
        "blockers": blockers,
        "ready_to_publish": not blockers,
    }


# ---------- the datesheet ----------


def datesheet(db: Session, school_id: int, exam_id: int) -> dict:
    """Every paper by day, and any two that a child would have to sit at once.

    A clash is only a clash if the same children are in both rooms, so it is
    computed per class rather than across the whole exam — Grade 1 and Grade 8
    sitting at the same hour is a timetable, not a problem.
    """
    exam = _exam(db, exam_id, school_id)
    papers = list(db.execute(
        select(ExamSubject).where(ExamSubject.exam_id == exam_id)
    ).scalars())

    by_class: dict[int, list[ExamSubject]] = {}
    for p in papers:
        cs = db.get(ClassSubject, p.class_subject_id)
        if cs:
            by_class.setdefault(cs.class_id, []).append(p)

    clashes = []
    for class_id, group in by_class.items():
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                if _overlap(a, b):
                    cls = db.get(SchoolClass, class_id)
                    clashes.append({
                        "class_id": class_id,
                        "class_name": cls.name if cls else None,
                        "exam_date": a.exam_date,
                        "papers": [_paper_label(db, a), _paper_label(db, b)],
                    })

    days: dict[date, list[dict]] = {}
    for p in sorted(papers, key=lambda x: (x.exam_date, x.start_time or ASSUMED_START)):
        row = _paper_label(db, p)
        row["ends_at"] = _window(p)[1].time()
        row["has_time"] = p.start_time is not None
        days.setdefault(p.exam_date, []).append(row)

    return {
        "exam_id": exam.id,
        "exam_name": exam.name,
        "start_date": exam.start_date,
        "end_date": exam.end_date,
        "days": [{"date": d, "papers": rows} for d, rows in sorted(days.items())],
        "clashes": clashes,
        "papers_without_time": sum(1 for p in papers if p.start_time is None),
    }


# ---------- halls ----------


def exam_rooms(db: Session, school_id: int) -> list[dict]:
    """Rooms a paper can be sat in, with the capacity allocation respects."""
    rooms = list(db.execute(
        select(Room).where(
            Room.school_id == school_id,
            Room.is_active.is_(True),
            Room.kind.in_(EXAM_ROOM_KINDS),
        ).order_by(Room.name)
    ).scalars())
    return [
        {
            "id": r.id, "name": r.name, "code": r.code, "kind": r.kind.value,
            "capacity": r.capacity or 0, "building": r.building, "floor": r.floor,
        }
        for r in rooms
    ]


def allocation(db: Session, school_id: int, paper_id: int) -> dict:
    """Who sits where for one paper, and who has nowhere to sit yet."""
    p = _paper(db, paper_id, school_id)
    seated = {
        a.student_id: a for a in db.execute(
            select(ExamRoomAllocation).where(ExamRoomAllocation.exam_subject_id == paper_id)
        ).scalars()
    }
    candidates = _candidates(db, p)

    rooms: dict[int, dict] = {}
    unplaced = []
    for student in candidates:
        section = db.get(Section, student.section_id) if student.section_id else None
        row = {
            "student_id": student.id,
            "admission_no": student.admission_no,
            "student_name": student.full_name,
            "roll_no": student.roll_no,
            "section_name": section.name if section else None,
        }
        seat = seated.get(student.id)
        if seat is None:
            unplaced.append(row)
            continue
        room = db.get(Room, seat.room_id)
        bucket = rooms.setdefault(seat.room_id, {
            "room_id": seat.room_id,
            "room_name": room.name if room else "Unknown room",
            "capacity": (room.capacity or 0) if room else 0,
            "students": [],
        })
        bucket["students"].append(row)

    for bucket in rooms.values():
        bucket["seated"] = len(bucket["students"])
        bucket["over_capacity"] = bucket["capacity"] > 0 and bucket["seated"] > bucket["capacity"]

    return {
        **_paper_label(db, p),
        "candidates": len(candidates),
        "seated": len(candidates) - len(unplaced),
        "rooms": sorted(rooms.values(), key=lambda r: r["room_name"]),
        "unplaced": unplaced,
    }


def auto_allocate(db: Session, school_id: int, paper_id: int, room_ids: list[int]) -> dict:
    """Fill the chosen rooms in order, splitting sections across rooms only
    when a room runs out.

    Children are placed in section and roll order, which is the order the
    office already thinks in and the order an invigilator can check a room
    against without a computer.
    """
    p = _paper(db, paper_id, school_id)
    if not room_ids:
        raise _400("Choose at least one room.")

    rooms = list(db.execute(
        select(Room).where(Room.id.in_(room_ids), Room.school_id == school_id)
    ).scalars())
    if len(rooms) != len(set(room_ids)):
        raise _404("Room")
    ordered = sorted(rooms, key=lambda r: room_ids.index(r.id))

    candidates = _candidates(db, p)
    seats = sum(r.capacity or 0 for r in ordered)
    if seats and seats < len(candidates):
        raise _400(
            f"{len(candidates)} children sit this paper but the chosen rooms hold {seats}. "
            "Add another room, or the ones at the end will have nowhere to sit."
        )

    db.execute(
        ExamRoomAllocation.__table__.delete().where(
            ExamRoomAllocation.exam_subject_id == paper_id
        )
    )

    placed = 0
    room_iter = iter(ordered)
    current = next(room_iter, None)
    left = (current.capacity or len(candidates)) if current else 0
    for student in candidates:
        while current is not None and left <= 0:
            current = next(room_iter, None)
            left = (current.capacity or len(candidates)) if current else 0
        if current is None:
            break
        db.add(ExamRoomAllocation(
            tenant_id=p.tenant_id, school_id=school_id, exam_subject_id=paper_id,
            room_id=current.id, student_id=student.id,
        ))
        left -= 1
        placed += 1

    db.commit()
    return allocation(db, school_id, paper_id)


def clear_allocation(db: Session, school_id: int, paper_id: int) -> dict:
    _paper(db, paper_id, school_id)
    db.execute(
        ExamRoomAllocation.__table__.delete().where(
            ExamRoomAllocation.exam_subject_id == paper_id
        )
    )
    db.commit()
    return allocation(db, school_id, paper_id)


def move_student(db: Session, school_id: int, paper_id: int, student_id: int,
                 room_id: int) -> dict:
    """Move one child to another room — the late arrival, the broken desk."""
    p = _paper(db, paper_id, school_id)
    room = db.get(Room, room_id)
    if not room or room.school_id != school_id:
        raise _404("Room")
    existing = db.execute(
        select(ExamRoomAllocation).where(
            ExamRoomAllocation.exam_subject_id == paper_id,
            ExamRoomAllocation.student_id == student_id,
        )
    ).scalar_one_or_none()
    if existing:
        existing.room_id = room_id
    else:
        db.add(ExamRoomAllocation(
            tenant_id=p.tenant_id, school_id=school_id, exam_subject_id=paper_id,
            room_id=room_id, student_id=student_id,
        ))
    db.commit()
    return allocation(db, school_id, paper_id)


# ---------- invigilation ----------


def invigilators(db: Session, school_id: int, paper_id: int) -> dict:
    """Who is watching which room for one paper."""
    p = _paper(db, paper_id, school_id)
    rows = db.execute(
        select(Invigilation, User, Room)
        .join(User, User.id == Invigilation.user_id)
        .join(Room, Room.id == Invigilation.room_id)
        .where(Invigilation.exam_subject_id == paper_id)
        .order_by(Room.name, Invigilation.is_chief.desc(), User.full_name)
    ).all()

    rooms_in_use = list(db.execute(
        select(func.distinct(ExamRoomAllocation.room_id))
        .where(ExamRoomAllocation.exam_subject_id == paper_id)
    ).scalars())

    by_room: dict[int, dict] = {}
    for room_id in rooms_in_use:
        room = db.get(Room, room_id)
        seated = db.execute(
            select(func.count(ExamRoomAllocation.id)).where(
                ExamRoomAllocation.exam_subject_id == paper_id,
                ExamRoomAllocation.room_id == room_id,
            )
        ).scalar_one()
        by_room[room_id] = {
            "room_id": room_id,
            "room_name": room.name if room else "Unknown room",
            "seated": seated,
            "staff": [],
        }
    for inv, user, room in rows:
        bucket = by_room.setdefault(room.id, {
            "room_id": room.id, "room_name": room.name, "seated": 0, "staff": [],
        })
        bucket["staff"].append({
            "invigilation_id": inv.id, "user_id": user.id,
            "name": user.full_name, "role": user.role.value, "is_chief": inv.is_chief,
        })

    return {
        **_paper_label(db, p),
        "rooms": sorted(by_room.values(), key=lambda r: r["room_name"]),
        "unwatched": [r for r in by_room.values() if not r["staff"]],
    }


def available_invigilators(db: Session, school_id: int, paper_id: int) -> list[dict]:
    """Staff who could watch this paper, and why some of them cannot.

    A teacher already on duty elsewhere at that hour is listed with the reason
    rather than hidden, because the office needs to know the person is busy —
    not merely that their name has gone missing from a dropdown.
    """
    p = _paper(db, paper_id, school_id)
    staff = list(db.execute(
        select(User).where(
            User.school_id == school_id,
            User.is_active.is_(True),
            User.role.in_([UserRole.teacher, UserRole.staff, UserRole.principal]),
        ).order_by(User.full_name)
    ).scalars())

    # every other paper this person is already watching, whenever it sits
    busy: dict[int, ExamSubject] = {}
    for inv, other in db.execute(
        select(Invigilation, ExamSubject)
        .join(ExamSubject, ExamSubject.id == Invigilation.exam_subject_id)
        .where(Invigilation.school_id == school_id, Invigilation.exam_subject_id != paper_id)
    ).all():
        if _overlap(p, other):
            busy[inv.user_id] = other

    here = set(db.execute(
        select(Invigilation.user_id).where(Invigilation.exam_subject_id == paper_id)
    ).scalars())

    out = []
    for u in staff:
        clash = busy.get(u.id)
        out.append({
            "user_id": u.id,
            "name": u.full_name,
            "role": u.role.value,
            "assigned_here": u.id in here,
            "clash": _paper_label(db, clash)["subject_name"] if clash else None,
            "available": clash is None,
        })
    return out


def assign_invigilator(db: Session, school_id: int, paper_id: int, room_id: int,
                       user_id: int, is_chief: bool = False) -> dict:
    """Put somebody on duty, refusing to put them in two places at once."""
    p = _paper(db, paper_id, school_id)
    room = db.get(Room, room_id)
    if not room or room.school_id != school_id:
        raise _404("Room")
    user = db.get(User, user_id)
    if not user or user.school_id != school_id:
        raise _404("Staff member")

    for inv, other in db.execute(
        select(Invigilation, ExamSubject)
        .join(ExamSubject, ExamSubject.id == Invigilation.exam_subject_id)
        .where(Invigilation.user_id == user_id, Invigilation.exam_subject_id != paper_id)
    ).all():
        if _overlap(p, other):
            label = _paper_label(db, other)
            raise _400(
                f"{user.full_name} is already invigilating {label['subject_name']} "
                f"for {label['class_name']} at that hour."
            )

    existing = db.execute(
        select(Invigilation).where(
            Invigilation.exam_subject_id == paper_id,
            Invigilation.room_id == room_id,
            Invigilation.user_id == user_id,
        )
    ).scalar_one_or_none()
    if existing:
        existing.is_chief = is_chief
    else:
        db.add(Invigilation(
            tenant_id=p.tenant_id, school_id=school_id, exam_subject_id=paper_id,
            room_id=room_id, user_id=user_id, is_chief=is_chief,
        ))
    db.commit()
    return invigilators(db, school_id, paper_id)


def remove_invigilator(db: Session, school_id: int, paper_id: int, invigilation_id: int) -> dict:
    _paper(db, paper_id, school_id)
    row = db.get(Invigilation, invigilation_id)
    if not row or row.school_id != school_id or row.exam_subject_id != paper_id:
        raise _404("Duty")
    db.delete(row)
    db.commit()
    return invigilators(db, school_id, paper_id)


def duty_roster(db: Session, school_id: int, exam_id: int) -> dict:
    """The whole exam's duties, per person — what a staff room pins up."""
    _exam(db, exam_id, school_id)
    rows = db.execute(
        select(Invigilation, ExamSubject, User, Room)
        .join(ExamSubject, ExamSubject.id == Invigilation.exam_subject_id)
        .join(User, User.id == Invigilation.user_id)
        .join(Room, Room.id == Invigilation.room_id)
        .where(ExamSubject.exam_id == exam_id)
    ).all()

    people: dict[int, dict] = {}
    for inv, paper, user, room in rows:
        person = people.setdefault(user.id, {
            "user_id": user.id, "name": user.full_name, "role": user.role.value, "duties": [],
        })
        label = _paper_label(db, paper)
        person["duties"].append({
            "paper_id": paper.id,
            "subject_name": label["subject_name"],
            "class_name": label["class_name"],
            "exam_date": paper.exam_date,
            "start_time": paper.start_time,
            "room_name": room.name,
            "is_chief": inv.is_chief,
        })
    for person in people.values():
        person["duties"].sort(key=lambda d: (d["exam_date"], d["start_time"] or ASSUMED_START))
        person["count"] = len(person["duties"])

    return {
        "exam_id": exam_id,
        "staff": sorted(people.values(), key=lambda p: -p["count"]),
        "total_duties": len(rows),
    }


# ---------- admit cards ----------


def admit_card(db: Session, school_id: int, exam_id: int, student_id: int) -> dict:
    """One child's card: who they are, and every paper with where to be.

    Refuses when the exam has no papers, rather than printing a card with an
    empty table on it — a card that says nothing is worse than no card, since
    the child turns up holding proof they were told nothing.
    """
    exam = _exam(db, exam_id, school_id)
    student = db.get(Student, student_id)
    if not student or student.school_id != school_id:
        raise _404("Student")

    section = db.get(Section, student.section_id) if student.section_id else None
    cls = db.get(SchoolClass, section.class_id) if section else None
    school = db.get(School, school_id)

    papers = list(db.execute(
        select(ExamSubject).where(ExamSubject.exam_id == exam_id)
    ).scalars())
    sittings = []
    for p in sorted(papers, key=lambda x: (x.exam_date, x.start_time or ASSUMED_START)):
        cs = db.get(ClassSubject, p.class_subject_id)
        if not cs or not cls or cs.class_id != cls.id:
            continue  # a paper for another class is not on this child's card
        seat = db.execute(
            select(ExamRoomAllocation).where(
                ExamRoomAllocation.exam_subject_id == p.id,
                ExamRoomAllocation.student_id == student_id,
            )
        ).scalar_one_or_none()
        room = db.get(Room, seat.room_id) if seat else None
        label = _paper_label(db, p)
        sittings.append({
            "paper_id": p.id,
            "subject_name": label["subject_name"],
            "subject_code": label["subject_code"],
            "exam_date": p.exam_date,
            "start_time": p.start_time,
            "ends_at": _window(p)[1].time(),
            "duration_minutes": p.duration_minutes,
            "max_marks": p.max_marks,
            "room_name": room.name if room else None,
            "building": room.building if room else None,
        })

    if not sittings:
        raise _400(
            f"{exam.name} has no papers for {cls.name if cls else 'this class'}, "
            "so there is nothing to put on a card."
        )

    return {
        "exam_id": exam.id,
        "exam_name": exam.name,
        "school_name": school.name if school else "",
        "school_address": school.address if school else None,
        "student_id": student.id,
        "student_name": student.full_name,
        "admission_no": student.admission_no,
        "roll_no": student.roll_no,
        "class_name": cls.name if cls else None,
        "section_name": section.name if section else None,
        "photo_url": student.photo_url,
        "sittings": sittings,
        "rooms_allocated": sum(1 for s in sittings if s["room_name"]),
    }


def admit_cards_for_class(db: Session, school_id: int, exam_id: int, class_id: int) -> list[dict]:
    """Every card for a class, for the print run the office actually does."""
    _exam(db, exam_id, school_id)
    students = list(db.execute(
        select(Student)
        .join(Section, Student.section_id == Section.id)
        .where(
            Section.class_id == class_id,
            Student.school_id == school_id,
            Student.is_active.is_(True),
        )
        .order_by(Section.name, Student.roll_no, Student.id)
    ).scalars())
    out = []
    for s in students:
        try:
            out.append(admit_card(db, school_id, exam_id, s.id))
        except HTTPException:
            continue
    return out


def admit_card_pdf(db: Session, school_id: int, exam_id: int, student_id: int) -> tuple[bytes, str]:
    """The card as a sheet of paper, because that is what a child carries in."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    import io

    card = admit_card(db, school_id, exam_id, student_id)
    styles = getSampleStyleSheet()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=1.5 * cm, bottomMargin=1.5 * cm,
                            leftMargin=1.6 * cm, rightMargin=1.6 * cm,
                            title=f"Admit card — {card['student_name']}")

    story = [
        Paragraph(f"<b>{card['school_name']}</b>", styles["Title"]),
        Paragraph(f"{card['exam_name']} — Admit card", styles["Heading2"]),
        Spacer(1, 0.4 * cm),
    ]

    who = [
        ["Name", card["student_name"], "Admission no", card["admission_no"]],
        ["Class", f"{card['class_name'] or ''} {card['section_name'] or ''}".strip(),
         "Roll no", str(card["roll_no"] or "—")],
    ]
    t = Table(who, colWidths=[3 * cm, 6.5 * cm, 3.2 * cm, 4.3 * cm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#DCE4EF")),
    ]))
    story += [t, Spacer(1, 0.5 * cm)]

    head = ["Date", "Time", "Subject", "Marks", "Room"]
    body = [[
        s["exam_date"].strftime("%d %b %Y"),
        f"{s['start_time']:%H:%M} – {s['ends_at']:%H:%M}" if s["start_time"] else "As announced",
        s["subject_name"],
        str(s["max_marks"]),
        s["room_name"] or "To be announced",
    ] for s in card["sittings"]]
    papers = Table([head] + body, colWidths=[2.8 * cm, 3.4 * cm, 6 * cm, 2 * cm, 2.8 * cm])
    papers.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F6F8FC")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#DCE4EF")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story += [papers, Spacer(1, 0.8 * cm)]

    story += [
        Paragraph(
            "Bring this card to every paper. Be seated ten minutes before the start. "
            "Mobile phones and smart watches are not allowed in the examination room.",
            styles["BodyText"],
        ),
        Spacer(1, 1.2 * cm),
        Paragraph("_______________________<br/>Controller of Examinations", styles["BodyText"]),
    ]

    doc.build(story)
    name = f"admit-card-{card['admission_no']}.pdf"
    return buf.getvalue(), name


# ---------- how a subject is assessed ----------


def components(db: Session, school_id: int, paper_id: int) -> dict:
    """The parts one paper is marked in, if it has any."""
    p = _paper(db, paper_id, school_id)
    rows = list(db.execute(
        select(ExamSubjectComponent)
        .where(ExamSubjectComponent.exam_subject_id == paper_id)
        .order_by(ExamSubjectComponent.sequence, ExamSubjectComponent.id)
    ).scalars())
    return {
        **_paper_label(db, p),
        "components": [
            {"id": c.id, "name": c.name, "max_marks": c.max_marks,
             "pass_marks": c.pass_marks, "sequence": c.sequence}
            for c in rows
        ],
        "allocated": sum(c.max_marks for c in rows),
        "unallocated": p.max_marks - sum(c.max_marks for c in rows),
    }


def set_components(db: Session, school_id: int, paper_id: int, parts: list[dict]) -> dict:
    """Define the parts a paper is assessed in.

    They must add up to the paper's own maximum. A theory-plus-practical split
    that sums to something else is not a split, it is a second opinion about
    what the paper is out of, and the report card can only print one of them.

    Clearing the list puts the paper back to being marked as a whole, which is
    why removing components also removes the marks recorded against them.
    """
    p = _paper(db, paper_id, school_id)

    if parts:
        total = sum(int(x["max_marks"]) for x in parts)
        if total != p.max_marks:
            raise _400(
                f"The parts add up to {total} but the paper is out of {p.max_marks}."
            )
        names = [str(x["name"]).strip() for x in parts]
        if len(set(n.lower() for n in names)) != len(names):
            raise _400("Two parts cannot share a name.")
        for x in parts:
            if int(x["max_marks"]) <= 0:
                raise _400("Every part must be worth at least one mark.")
            if int(x.get("pass_marks") or 0) > int(x["max_marks"]):
                raise _400(f"{x['name']} cannot need more marks to pass than it is out of.")

    existing = list(db.execute(
        select(ExamSubjectComponent).where(ExamSubjectComponent.exam_subject_id == paper_id)
    ).scalars())
    db.execute(
        MarkComponent.__table__.delete().where(
            MarkComponent.component_id.in_([c.id for c in existing] or [0])
        )
    )
    db.execute(
        ExamSubjectComponent.__table__.delete().where(
            ExamSubjectComponent.exam_subject_id == paper_id
        )
    )
    for n, x in enumerate(parts, start=1):
        db.add(ExamSubjectComponent(
            tenant_id=p.tenant_id, school_id=school_id, exam_subject_id=paper_id,
            name=str(x["name"]).strip(), max_marks=int(x["max_marks"]),
            pass_marks=int(x.get("pass_marks") or 0), sequence=n,
        ))
    db.commit()
    return components(db, school_id, paper_id)


def component_marks(db: Session, school_id: int, paper_id: int) -> dict:
    """The part-by-part grid for a paper, ready to be filled in."""
    p = _paper(db, paper_id, school_id)
    parts = list(db.execute(
        select(ExamSubjectComponent)
        .where(ExamSubjectComponent.exam_subject_id == paper_id)
        .order_by(ExamSubjectComponent.sequence, ExamSubjectComponent.id)
    ).scalars())
    if not parts:
        raise _400("This paper is marked as a whole. Define its parts first.")

    marks = {
        m.student_id: m for m in db.execute(
            select(Mark).where(Mark.exam_subject_id == paper_id)
        ).scalars()
    }
    scored: dict[tuple[int, int], Optional[int]] = {}
    for mc, mark in db.execute(
        select(MarkComponent, Mark)
        .join(Mark, Mark.id == MarkComponent.mark_id)
        .where(Mark.exam_subject_id == paper_id)
    ).all():
        scored[(mark.student_id, mc.component_id)] = mc.marks_obtained

    rows = []
    for student in _candidates(db, p):
        section = db.get(Section, student.section_id) if student.section_id else None
        mark = marks.get(student.id)
        rows.append({
            "student_id": student.id,
            "admission_no": student.admission_no,
            "student_name": student.full_name,
            "roll_no": student.roll_no,
            "section_name": section.name if section else None,
            "status": mark.status.value if mark else MarkStatus.scored.value,
            "total": mark.marks_obtained if mark else None,
            "values": {
                str(c.id): scored.get((student.id, c.id)) for c in parts
            },
        })

    return {
        **_paper_label(db, p),
        "components": [
            {"id": c.id, "name": c.name, "max_marks": c.max_marks, "pass_marks": c.pass_marks}
            for c in parts
        ],
        "rows": rows,
    }


def save_component_marks(db: Session, school_id: int, paper_id: int, user_id: int,
                         rows: list[dict]) -> dict:
    """Record the parts, and let the paper total follow from them.

    The total is never typed here. It is the sum of the parts, so a report
    card and a practical register can never disagree about what a child got.
    """
    from app.services import mark_service

    p = _paper(db, paper_id, school_id)
    exam = db.get(Exam, p.exam_id)
    if exam and not exam.marks_open:
        raise _400("Marks entry is closed for this exam.")

    parts = {
        c.id: c for c in db.execute(
            select(ExamSubjectComponent).where(ExamSubjectComponent.exam_subject_id == paper_id)
        ).scalars()
    }
    if not parts:
        raise _400("This paper is marked as a whole. Define its parts first.")

    for row in rows:
        student_id = int(row["student_id"])
        values = row.get("values") or {}
        status = MarkStatus(row.get("status") or MarkStatus.scored.value)

        mark = db.execute(
            select(Mark).where(Mark.exam_subject_id == paper_id, Mark.student_id == student_id)
        ).scalar_one_or_none()
        if mark is None:
            mark = Mark(tenant_id=p.tenant_id, school_id=school_id, exam_subject_id=paper_id,
                        student_id=student_id, status=status)
            db.add(mark)
            db.flush()
        mark.status = status

        total: Optional[int] = 0
        for key, raw in values.items():
            component_id = int(key)
            part = parts.get(component_id)
            if part is None:
                raise _404("Component")
            got = None if raw is None or raw == "" else int(raw)
            if got is not None and (got < 0 or got > part.max_marks):
                raise _400(f"{part.name} is out of {part.max_marks}.")

            existing = db.execute(
                select(MarkComponent).where(
                    MarkComponent.mark_id == mark.id,
                    MarkComponent.component_id == component_id,
                )
            ).scalar_one_or_none()
            if existing:
                existing.marks_obtained = got
            else:
                db.add(MarkComponent(mark_id=mark.id, component_id=component_id,
                                     marks_obtained=got))
            if got is None:
                total = None if total is not None and status == MarkStatus.scored else total
            elif total is not None:
                total += got

        if status != MarkStatus.scored:
            mark.marks_obtained = None
            mark.grade = None
            mark.is_pass = None
        else:
            mark.marks_obtained = total
            if total is not None:
                grade, passed = mark_service._grade_and_pass(
                    db, exam, total, p.max_marks, p.pass_marks
                )
                mark.grade, mark.is_pass = grade, passed
            else:
                mark.grade, mark.is_pass = None, None
        mark.marked_by_user_id = user_id
        mark.marked_at = datetime.now(timezone.utc)

    # marks that moved un-sign-off the paper, exactly as whole-paper entry does
    from app.services import exam_service
    exam_service.clear_verification(db, paper_id)
    db.commit()
    return component_marks(db, school_id, paper_id)


# ---------- the decision at the end of the year ----------


def promotion_preview(db: Session, school_id: int, exam_id: int) -> dict:
    """Who passed, and what the results suggest should happen to them.

    A suggestion, not a verdict. The school decides; this only makes sure the
    decision is taken in front of the marks rather than from memory, and it
    says plainly when a child has no marks at all, because "no result" and
    "failed" are different things that a blank cell hides.
    """
    exam = _exam(db, exam_id, school_id)
    papers = list(db.execute(
        select(ExamSubject).where(ExamSubject.exam_id == exam_id)
    ).scalars())
    by_class: dict[int, list[ExamSubject]] = {}
    for p in papers:
        cs = db.get(ClassSubject, p.class_subject_id)
        if cs:
            by_class.setdefault(cs.class_id, []).append(p)

    marks_by_student: dict[int, dict[int, Mark]] = {}
    for m in db.execute(
        select(Mark).where(Mark.exam_subject_id.in_([p.id for p in papers] or [0]))
    ).scalars():
        marks_by_student.setdefault(m.student_id, {})[m.exam_subject_id] = m

    rows = []
    for class_id, class_papers in by_class.items():
        cls = db.get(SchoolClass, class_id)
        students = list(db.execute(
            select(Student)
            .join(Section, Student.section_id == Section.id)
            .where(
                Section.class_id == class_id,
                Student.school_id == school_id,
                Student.is_active.is_(True),
            )
            .order_by(Section.name, Student.roll_no)
        ).scalars())
        for student in students:
            mine = marks_by_student.get(student.id, {})
            passed = failed = absent = missing = 0
            obtained = total_max = 0
            for p in class_papers:
                m = mine.get(p.id)
                if m is None:
                    missing += 1
                    continue
                if m.status == MarkStatus.absent:
                    absent += 1
                    continue
                if m.status == MarkStatus.exempt:
                    continue
                total_max += p.max_marks
                obtained += m.marks_obtained or 0
                if m.is_pass:
                    passed += 1
                else:
                    failed += 1

            section = db.get(Section, student.section_id) if student.section_id else None
            if missing or absent:
                suggestion = "review"
                because = (
                    f"{missing} paper(s) unmarked" if missing else f"absent for {absent} paper(s)"
                )
            elif failed:
                suggestion = "repeated"
                because = f"failed {failed} subject(s)"
            else:
                suggestion = "promoted"
                because = "passed every subject"

            rows.append({
                "student_id": student.id,
                "admission_no": student.admission_no,
                "student_name": student.full_name,
                "class_id": class_id,
                "class_name": cls.name if cls else None,
                "section_name": section.name if section else None,
                "subjects": len(class_papers),
                "passed": passed, "failed": failed,
                "absent": absent, "unmarked": missing,
                "obtained": obtained, "out_of": total_max,
                "percent": round(obtained / total_max * 100, 1) if total_max else 0.0,
                "suggestion": suggestion,
                "because": because,
            })

    counts = {"promoted": 0, "repeated": 0, "review": 0}
    for r in rows:
        counts[r["suggestion"]] += 1

    return {
        "exam_id": exam.id,
        "exam_name": exam.name,
        "is_published": exam.is_published,
        "students": sorted(rows, key=lambda r: (r["class_name"] or "", r["section_name"] or "",
                                                r["student_name"])),
        "counts": counts,
        "total": len(rows),
    }
