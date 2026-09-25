from datetime import datetime, time, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.enums import UserRole
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.subject import ClassSubject, Subject
from app.models.timetable import HodAssignment, Period, TimetableEntry
from app.models.user import User
from app.schemas.timetable import (
    CopyTimetableRequest,
    PeriodCreate,
    PeriodUpdate,
    TimetableEntrySet,
)
from app.services import timetable_access
from app.services.staff_service import validate_teacher_for_school


# --- Period CRUD ---

def _get_period(db: Session, period_id: int, school_id: int) -> Period:
    p = db.get(Period, period_id)
    if not p or p.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Period not found"
        )
    return p


def _check_period_overlap(
    db: Session,
    school_id: int,
    day_of_week: int,
    start: time,
    end: time,
    exclude_id: Optional[int] = None,
) -> None:
    stmt = select(Period).where(
        Period.school_id == school_id,
        Period.day_of_week == day_of_week,
        Period.start_time < end,
        Period.end_time > start,
    )
    if exclude_id is not None:
        stmt = stmt.where(Period.id != exclude_id)
    other = db.execute(stmt).scalars().first()
    if other:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Overlaps period {other.period_number} "
                f"({other.start_time:%H:%M}-{other.end_time:%H:%M}) on the same day"
            ),
        )


def create_period(
    db: Session, tenant_id: int, school_id: int, data: PeriodCreate
) -> Period:
    _check_period_overlap(
        db, school_id, data.day_of_week, data.start_time, data.end_time
    )
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
    _check_period_overlap(
        db, school_id, p.day_of_week, p.start_time, p.end_time, exclude_id=p.id
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


def _class_subjects(db: Session, class_id: int) -> list[dict]:
    rows = db.execute(
        select(ClassSubject, Subject, User)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .outerjoin(User, ClassSubject.teacher_user_id == User.id)
        .where(ClassSubject.class_id == class_id)
        .order_by(Subject.name)
    ).all()
    return [
        {
            "id": cs.id,
            "subject_id": subj.id,
            "subject_name": subj.name,
            "subject_code": subj.code,
            "teacher_user_id": teacher.id if teacher else None,
            "teacher_name": teacher.full_name if teacher else None,
        }
        for cs, subj, teacher in rows
    ]


def get_section_timetable(
    db: Session, section_id: int, school_id: int
) -> dict:
    sec = _get_section(db, section_id, school_id)
    cls = db.get(SchoolClass, sec.class_id)
    periods = list_periods(db, school_id)
    entries = _entries_for_section(db, section_id)
    return {
        "section_id": sec.id,
        "section_label": _section_label(db, sec),
        "class_id": sec.class_id,
        "class_name": cls.name if cls else None,
        "section_name": sec.name,
        "timetable_published_at": sec.timetable_published_at,
        "periods": periods,
        "entries": entries,
        "class_subjects": _class_subjects(db, sec.class_id),
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
    if period.is_break:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subjects can't be assigned to a break period",
        )

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

    source_entries = db.execute(
        select(TimetableEntry, Period)
        .join(Period, TimetableEntry.period_id == Period.id)
        .where(TimetableEntry.section_id == source.id)
    ).all()
    if not source_entries:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source section has no timetable entries to copy",
        )

    if data.overwrite:
        db.execute(
            TimetableEntry.__table__.delete().where(
                TimetableEntry.section_id == dest.id
            )
        )
        db.flush()

    skipped: list[str] = []
    for src, period in source_entries:
        slot = f"day {period.day_of_week} period {period.period_number}"
        if period.is_break:
            continue
        existing = db.execute(
            select(TimetableEntry).where(
                TimetableEntry.section_id == dest.id,
                TimetableEntry.period_id == src.period_id,
            )
        ).scalar_one_or_none()
        if existing and not data.overwrite:
            continue  # leave dest as-is
        cs = db.get(ClassSubject, src.class_subject_id)
        if cs and cs.teacher_user_id:
            try:
                _check_teacher_clash(
                    db, school_id, dest.id, src.period_id, cs.teacher_user_id
                )
            except HTTPException as exc:
                # Skip the slot rather than fail the whole copy, but report it.
                skipped.append(f"{slot}: {exc.detail}")
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
    out = get_section_timetable(db, dest.id, school_id)
    out["skipped"] = skipped
    return out


def detect_clashes(
    db: Session, school_id: int, section_ids: Optional[set[int]] = None
) -> list[dict]:
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
        if section_ids is not None and not any(
            p["section_id"] in section_ids for p in placements
        ):
            continue
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


# --- Workspace scope (admin / principal / HOD) ---

def get_scope(db: Session, user: User) -> dict:

    allowed = timetable_access.manageable_section_ids(db, user)
    stmt = (
        select(Section, SchoolClass)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .where(Section.school_id == user.school_id)
        .order_by(SchoolClass.display_order, SchoolClass.name, Section.name)
    )
    if allowed is not None:
        stmt = stmt.where(Section.id.in_(allowed or {-1}))

    classes: dict[int, dict] = {}
    for sec, cls in db.execute(stmt).all():
        c = classes.setdefault(
            cls.id,
            {
                "id": cls.id,
                "name": cls.name,
                "academic_year_id": cls.academic_year_id,
                "sections": [],
            },
        )
        c["sections"].append(
            {
                "id": sec.id,
                "name": sec.name,
                "published": sec.timetable_published_at is not None,
            }
        )

    year_ids = {c["academic_year_id"] for c in classes.values()}
    years = []
    if allowed is None or year_ids:
        ystmt = select(AcademicYear).where(
            AcademicYear.school_id == user.school_id
        )
        if allowed is not None:
            ystmt = ystmt.where(AcademicYear.id.in_(year_ids))
        years = [
            {"id": y.id, "name": y.name, "is_current": y.is_current}
            for y in db.execute(
                ystmt.order_by(AcademicYear.start_date.desc())
            ).scalars()
        ]

    return {
        "role": user.role.value,
        "school_wide": allowed is None,
        "is_hod": allowed is not None and len(allowed) > 0,
        "academic_years": years,
        "classes": list(classes.values()),
    }


def list_teachers(db: Session, user: User) -> list[dict]:

    visible = timetable_access.visible_teacher_ids(db, user)
    stmt = select(User).where(
        User.school_id == user.school_id,
        User.role == UserRole.teacher,
        User.is_active.is_(True),
    )
    if visible is not None:
        stmt = stmt.where(User.id.in_(visible))
    return [
        {"id": u.id, "full_name": u.full_name}
        for u in db.execute(stmt.order_by(User.full_name)).scalars()
    ]


def get_teacher_week(
    db: Session, school_id: int, teacher_user_id: int, *, published_only: bool
) -> dict:

    teacher = db.get(User, teacher_user_id)
    if (
        not teacher
        or teacher.school_id != school_id
        or teacher.role != UserRole.teacher
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found"
        )
    stmt = (
        select(TimetableEntry, Section, SchoolClass, ClassSubject, Subject)
        .join(Section, TimetableEntry.section_id == Section.id)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .join(ClassSubject, TimetableEntry.class_subject_id == ClassSubject.id)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .where(
            TimetableEntry.school_id == school_id,
            ClassSubject.teacher_user_id == teacher_user_id,
        )
    )
    if published_only:
        stmt = stmt.where(Section.timetable_published_at.is_not(None))
    entries = [
        {
            "id": te.id,
            "section_id": sec.id,
            "section_label": f"{cls.name} {sec.name}",
            "period_id": te.period_id,
            "class_subject_id": cs.id,
            "subject_name": subj.name,
            "subject_code": subj.code,
            "notes": te.notes,
            "published": sec.timetable_published_at is not None,
        }
        for te, sec, cls, cs, subj in db.execute(stmt).all()
    ]
    return {
        "teacher_user_id": teacher.id,
        "teacher_name": teacher.full_name,
        "periods": list_periods(db, school_id),
        "entries": entries,
    }


# --- HOD assignments (school admin) ---

def list_hod_assignments(db: Session, school_id: int) -> list[dict]:

    rows = db.execute(
        select(HodAssignment, User, Section, SchoolClass)
        .join(User, HodAssignment.teacher_user_id == User.id)
        .join(Section, HodAssignment.section_id == Section.id)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .where(HodAssignment.school_id == school_id)
        .order_by(User.full_name, SchoolClass.display_order, SchoolClass.name, Section.name)
    ).all()
    out: dict[int, dict] = {}
    for _, teacher, sec, cls in rows:
        item = out.setdefault(
            teacher.id,
            {
                "teacher_user_id": teacher.id,
                "teacher_name": teacher.full_name,
                "sections": [],
            },
        )
        item["sections"].append(
            {"section_id": sec.id, "section_label": f"{cls.name} {sec.name}"}
        )
    return list(out.values())


def set_hod_sections(
    db: Session,
    tenant_id: int,
    school_id: int,
    teacher_user_id: int,
    section_ids: list[int],
) -> None:
    """Replace the teacher's HOD sections. An empty list removes the HOD role."""

    validate_teacher_for_school(db, teacher_user_id, school_id)
    wanted = set(section_ids)
    if wanted:
        found = set(
            db.execute(
                select(Section.id).where(
                    Section.id.in_(wanted), Section.school_id == school_id
                )
            ).scalars()
        )
        if found != wanted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="One or more sections not found",
            )
    existing = {
        a.section_id: a
        for a in db.execute(
            select(HodAssignment).where(
                HodAssignment.teacher_user_id == teacher_user_id,
                HodAssignment.school_id == school_id,
            )
        ).scalars()
    }
    for sid, a in existing.items():
        if sid not in wanted:
            db.delete(a)
    for sid in wanted - existing.keys():
        db.add(
            HodAssignment(
                tenant_id=tenant_id,
                school_id=school_id,
                teacher_user_id=teacher_user_id,
                section_id=sid,
            )
        )
    db.commit()
