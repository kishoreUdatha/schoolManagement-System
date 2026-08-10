from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.academic import SchoolClass, Section
from app.models.subject import ClassSubject, Subject
from app.models.timetable import Period, TimetableEntry
from app.models.user import User
from app.schemas.timetable import (
    CopyTimetableRequest,
    PeriodCreate,
    PeriodUpdate,
    TimetableEntrySet,
)


# --- Period CRUD ---

def _get_period(db: Session, period_id: int, school_id: int) -> Period:
    p = db.get(Period, period_id)
    if not p or p.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Period not found"
        )
    return p


def create_period(
    db: Session, tenant_id: int, school_id: int, data: PeriodCreate
) -> Period:
    p = Period(
        tenant_id=tenant_id,
        school_id=school_id,
        day_of_week=data.day_of_week,
        period_number=data.period_number,
        start_time=data.start_time,
        end_time=data.end_time,
        label=data.label,
        is_break=data.is_break,
    )
    db.add(p)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Period {data.period_number} on day {data.day_of_week} "
                "already exists"
            ),
        )
    db.refresh(p)
    return p


def list_periods(db: Session, school_id: int) -> list[Period]:
    stmt = (
        select(Period)
        .where(Period.school_id == school_id)
        .order_by(Period.day_of_week, Period.period_number)
    )
    return list(db.execute(stmt).scalars().all())


def update_period(
    db: Session, period_id: int, school_id: int, data: PeriodUpdate
) -> Period:
    p = _get_period(db, period_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(p, field, value)
    if p.end_time <= p.start_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_time must be after start_time",
        )
    db.commit()
    db.refresh(p)
    return p


def delete_period(db: Session, period_id: int, school_id: int) -> None:
    p = _get_period(db, period_id, school_id)
    db.delete(p)
    db.commit()


# --- Section + timetable helpers ---

def _get_section(db: Session, section_id: int, school_id: int) -> Section:
    sec = db.get(Section, section_id)
    if not sec or sec.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
        )
    return sec


def _section_label(db: Session, sec: Section) -> str:
    cls = db.get(SchoolClass, sec.class_id)
    return f"{cls.name} {sec.name}" if cls else sec.name


def _entries_for_section(db: Session, section_id: int) -> list[dict]:
    rows = db.execute(
        select(TimetableEntry, ClassSubject, Subject, User)
        .join(ClassSubject, TimetableEntry.class_subject_id == ClassSubject.id)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .outerjoin(User, ClassSubject.teacher_user_id == User.id)
        .where(TimetableEntry.section_id == section_id)
    ).all()
    out = []
    for entry, cs, subj, teacher in rows:
        out.append(
            {
                "id": entry.id,
                "section_id": entry.section_id,
                "period_id": entry.period_id,
                "class_subject_id": entry.class_subject_id,
                "subject_name": subj.name,
                "subject_code": subj.code,
                "teacher_user_id": teacher.id if teacher else None,
                "teacher_name": teacher.full_name if teacher else None,
                "notes": entry.notes,
            }
        )
    return out


def get_section_timetable(
    db: Session, section_id: int, school_id: int
) -> dict:
    sec = _get_section(db, section_id, school_id)
    periods = list_periods(db, school_id)
    entries = _entries_for_section(db, section_id)
    return {
        "section_id": sec.id,
        "section_label": _section_label(db, sec),
        "timetable_published_at": sec.timetable_published_at,
        "periods": periods,
        "entries": entries,
    }


def _check_teacher_clash(
    db: Session,
    school_id: int,
    section_id: int,
    period_id: int,
    teacher_user_id: Optional[int],
) -> None:
    if teacher_user_id is None:
        return
    # Same teacher already booked for THIS period_id in any OTHER section?
    clash = db.execute(
        select(TimetableEntry, Section, SchoolClass, Subject, ClassSubject)
        .join(Section, TimetableEntry.section_id == Section.id)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .join(ClassSubject, TimetableEntry.class_subject_id == ClassSubject.id)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .where(
            TimetableEntry.period_id == period_id,
            TimetableEntry.section_id != section_id,
            ClassSubject.teacher_user_id == teacher_user_id,
            TimetableEntry.school_id == school_id,
        )
    ).first()
    if clash:
        _, other_sec, other_cls, other_subj, _ = clash
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Teacher clash: already teaching {other_subj.name} in "
                f"{other_cls.name} {other_sec.name} during this period. "
                "Pick a different period or change the teacher on one of the assignments."
            ),
        )


def set_entry(
    db: Session,
    tenant_id: int,
    school_id: int,
    section_id: int,
    period_id: int,
    data: TimetableEntrySet,
) -> dict:
    sec = _get_section(db, section_id, school_id)
    period = _get_period(db, period_id, school_id)

    cs = db.get(ClassSubject, data.class_subject_id)
    if not cs or cs.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class-subject assignment not found",
        )
    if cs.class_id != sec.class_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This subject is not assigned to the section's class. "
                "Assign it from Classes → Subjects first."
            ),
        )

    if cs.teacher_user_id:
        _check_teacher_clash(
            db, school_id, section_id, period.id, cs.teacher_user_id
        )

    existing = db.execute(
        select(TimetableEntry).where(
            TimetableEntry.section_id == section_id,
            TimetableEntry.period_id == period_id,
        )
    ).scalar_one_or_none()

    if existing:
        existing.class_subject_id = cs.id
        existing.notes = data.notes
        db.commit()
        db.refresh(existing)
    else:
        new = TimetableEntry(
            tenant_id=tenant_id,
            school_id=school_id,
            section_id=section_id,
            period_id=period_id,
            class_subject_id=cs.id,
            notes=data.notes,
        )
        db.add(new)
        db.commit()

    return get_section_timetable(db, section_id, school_id)


def clear_entry(
    db: Session, school_id: int, section_id: int, period_id: int
) -> None:
    _get_section(db, section_id, school_id)
    db.execute(
        TimetableEntry.__table__.delete().where(
            TimetableEntry.section_id == section_id,
            TimetableEntry.period_id == period_id,
        )
    )
    db.commit()


def copy_timetable(
    db: Session,
    tenant_id: int,
    school_id: int,
    dest_section_id: int,
    data: CopyTimetableRequest,
) -> dict:
    dest = _get_section(db, dest_section_id, school_id)
    source = _get_section(db, data.source_section_id, school_id)
    if source.class_id != dest.class_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Source section must belong to the same class as the destination. "
                "Subjects differ across classes so a direct copy isn't safe."
            ),
        )
    if source.id == dest.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and destination are the same section",
        )

    if data.overwrite:
        db.execute(
            TimetableEntry.__table__.delete().where(
                TimetableEntry.section_id == dest.id
            )
        )
        db.flush()

    source_entries = db.execute(
        select(TimetableEntry).where(TimetableEntry.section_id == source.id)
    ).scalars().all()
    if not source_entries:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source section has no timetable entries to copy",
        )

    for src in source_entries:
        existing = db.execute(
            select(TimetableEntry).where(
                TimetableEntry.section_id == dest.id,
                TimetableEntry.period_id == src.period_id,
            )
        ).scalar_one_or_none()
        if existing and not data.overwrite:
            continue  # leave dest as-is
        # Clash check for dest section
        cs = db.get(ClassSubject, src.class_subject_id)
        if cs and cs.teacher_user_id:
            try:
                _check_teacher_clash(
                    db, school_id, dest.id, src.period_id, cs.teacher_user_id
                )
            except HTTPException:
                # Skip this slot to avoid blowing up the whole copy.
                continue
        if existing:
            existing.class_subject_id = src.class_subject_id
            existing.notes = src.notes
        else:
            db.add(
                TimetableEntry(
                    tenant_id=tenant_id,
                    school_id=school_id,
                    section_id=dest.id,
                    period_id=src.period_id,
                    class_subject_id=src.class_subject_id,
                    notes=src.notes,
                )
            )
    db.commit()
    return get_section_timetable(db, dest.id, school_id)


def detect_clashes(db: Session, school_id: int) -> list[dict]:
    """Return any teacher clashes across the whole school's timetable.

    Useful as a sanity-check panel for the school admin.
    """
    rows = db.execute(
        select(
            ClassSubject.teacher_user_id,
            User.full_name,
            Period.day_of_week,
            Period.period_number,
            Section.id,
            SchoolClass.name,
            Section.name,
            Subject.name,
        )
        .join(TimetableEntry, TimetableEntry.class_subject_id == ClassSubject.id)
        .join(Period, TimetableEntry.period_id == Period.id)
        .join(Section, TimetableEntry.section_id == Section.id)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .join(User, ClassSubject.teacher_user_id == User.id)
        .where(
            TimetableEntry.school_id == school_id,
            ClassSubject.teacher_user_id.is_not(None),
        )
        .order_by(Period.day_of_week, Period.period_number)
    ).all()

    by_slot: dict[tuple[int, int, int], list] = {}
    for (
        teacher_id,
        teacher_name,
        day,
        pnum,
        sec_id,
        cls_name,
        sec_name,
        subj_name,
    ) in rows:
        key = (teacher_id, day, pnum)
        by_slot.setdefault(
            key, []
        ).append(
            {
                "section_id": sec_id,
                "section_label": f"{cls_name} {sec_name}",
                "subject_name": subj_name,
                "teacher_name": teacher_name,
            }
        )

    clashes = []
    for (teacher_id, day, pnum), placements in by_slot.items():
        if len(placements) > 1:
            clashes.append(
                {
                    "teacher_user_id": teacher_id,
                    "teacher_name": placements[0]["teacher_name"],
                    "day_of_week": day,
                    "period_number": pnum,
                    "sections": [
                        {
                            "section_id": p["section_id"],
                            "section_label": p["section_label"],
                            "subject_name": p["subject_name"],
                        }
                        for p in placements
                    ],
                }
            )
    return clashes


def set_published(
    db: Session, section_id: int, school_id: int, *, published: bool
) -> Section:
    sec = _get_section(db, section_id, school_id)
    sec.timetable_published_at = (
        datetime.now(timezone.utc) if published else None
    )
    db.commit()
    db.refresh(sec)
    return sec


# --- Parent-facing ---

def get_child_timetable_for_parent(
    db: Session, parent_user_id: int, student_id: int
) -> dict:
    from app.models.parent import ParentStudent  # local to avoid cycle
    from app.models.student import Student

    link = db.execute(
        select(ParentStudent, Student)
        .join(Student, ParentStudent.student_id == Student.id)
        .where(
            ParentStudent.parent_user_id == parent_user_id,
            ParentStudent.student_id == student_id,
        )
    ).one_or_none()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child not found or not linked to this parent",
        )
    _, student = link
    sec = db.get(Section, student.section_id)
    if not sec or sec.timetable_published_at is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Timetable is not published yet",
        )
    return get_section_timetable(db, sec.id, sec.school_id)
