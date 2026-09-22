"""Subject groups, curricula and co-curricular activities.

Three registers that describe the shape of what a school teaches. Each is
optional — nothing here is a precondition for a class, a timetable or a mark
— and each is deliberately incapable of damaging the thing it describes:
removing a subject from a group leaves the subject alone, retiring a
curriculum leaves the timetable alone.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import ActivityKind, CurriculumStatus
from app.models.academic import AcademicYear, SchoolClass
from app.models.academics_ops import (
    Activity,
    ActivityMember,
    Curriculum,
    CurriculumSubject,
    SubjectGroup,
    SubjectGroupMember,
)
from app.models.student import Student
from app.models.subject import Subject
from app.models.user import User


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _400(why: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, why)


# ---------- subject groups ----------


def _group(db: Session, school_id: int, group_id: int) -> SubjectGroup:
    g = db.get(SubjectGroup, group_id)
    if not g or g.school_id != school_id:
        raise _404("Subject group")
    return g


def group_to_dict(db: Session, g: SubjectGroup) -> dict:
    rows = db.execute(
        select(SubjectGroupMember, Subject)
        .join(Subject, Subject.id == SubjectGroupMember.subject_id)
        .where(SubjectGroupMember.group_id == g.id)
        .order_by(Subject.display_order, Subject.name)
    ).all()
    return {
        "id": g.id,
        "name": g.name,
        "code": g.code,
        "description": g.description,
        "is_active": g.is_active,
        "class_id": g.class_id,
        "class_name": db.get(SchoolClass, g.class_id).name if g.class_id else None,
        "min_picks": g.min_picks,
        "max_picks": g.max_picks,
        "subjects": [
            {
                "member_id": m.id,
                "subject_id": s.id,
                "subject_name": s.name,
                "subject_code": s.code,
                "is_elective": m.is_elective,
            }
            for m, s in rows
        ],
        "subject_count": len(rows),
        "elective_count": sum(1 for m, _ in rows if m.is_elective),
    }


def _check_picks(db: Session, school_id: int, class_id, lo, hi) -> None:
    if class_id is not None:
        c = db.get(SchoolClass, class_id)
        if not c or c.school_id != school_id:
            raise _404("Class")
    if lo is not None and hi is not None and lo > hi:
        raise _400("The minimum can't be more than the maximum.")


def list_groups(db: Session, school_id: int) -> list[dict]:
    groups = db.execute(
        select(SubjectGroup)
        .where(SubjectGroup.school_id == school_id)
        .order_by(SubjectGroup.name)
    ).scalars()
    return [group_to_dict(db, g) for g in groups]


def create_group(db: Session, school_id: int, tenant_id: int, data: dict) -> dict:
    code = str(data["code"]).strip().upper()
    clash = db.execute(
        select(SubjectGroup).where(
            SubjectGroup.school_id == school_id, SubjectGroup.code == code
        )
    ).scalar_one_or_none()
    if clash:
        raise _400(f"A group with the code {code} already exists.")
    _check_picks(db, school_id, data.get("class_id"), data.get("min_picks"), data.get("max_picks"))
    g = SubjectGroup(
        tenant_id=tenant_id, school_id=school_id,
        name=str(data["name"]).strip(), code=code,
        description=data.get("description"),
        is_active=bool(data.get("is_active", True)),
        class_id=data.get("class_id"),
        min_picks=data.get("min_picks"),
        max_picks=data.get("max_picks"),
    )
    db.add(g)
    db.commit()
    return group_to_dict(db, g)


def update_group(db: Session, school_id: int, group_id: int, data: dict) -> dict:
    g = _group(db, school_id, group_id)
    for field in ("name", "description", "is_active"):
        if field in data and data[field] is not None:
            setattr(g, field, data[field])
    nullable = ("class_id", "min_picks", "max_picks")
    merged = {f: data[f] if f in data else getattr(g, f) for f in nullable}
    _check_picks(db, school_id, merged["class_id"], merged["min_picks"], merged["max_picks"])
    for f in nullable:
        setattr(g, f, merged[f])
    db.commit()
    return group_to_dict(db, g)


def delete_group(db: Session, school_id: int, group_id: int) -> None:
    """Removing the grouping leaves every subject in it untouched."""
    g = _group(db, school_id, group_id)
    db.execute(
        SubjectGroupMember.__table__.delete().where(
            SubjectGroupMember.group_id == g.id
        )
    )
    db.delete(g)
    db.commit()


def add_to_group(db: Session, school_id: int, group_id: int, subject_id: int,
                 is_elective: bool = False) -> dict:
    g = _group(db, school_id, group_id)
    subject = db.get(Subject, subject_id)
    if not subject or subject.school_id != school_id:
        raise _404("Subject")
    existing = db.execute(
        select(SubjectGroupMember).where(
            SubjectGroupMember.group_id == g.id,
            SubjectGroupMember.subject_id == subject_id,
        )
    ).scalar_one_or_none()
    if existing:
        raise _400(f"{subject.name} is already in {g.name}.")
    db.add(SubjectGroupMember(
        tenant_id=g.tenant_id, school_id=school_id, group_id=g.id,
        subject_id=subject_id, is_elective=is_elective,
    ))
    db.commit()
    return group_to_dict(db, g)


def remove_from_group(db: Session, school_id: int, group_id: int,
                      subject_id: int) -> dict:
    """Takes the subject out of the group. The subject itself is untouched —
    a grouping is an editorial decision and must not be able to delete the
    master record it happens to mention."""
    g = _group(db, school_id, group_id)
    row = db.execute(
        select(SubjectGroupMember).where(
            SubjectGroupMember.group_id == g.id,
            SubjectGroupMember.subject_id == subject_id,
        )
    ).scalar_one_or_none()
    if not row:
        raise _404("That subject in this group")
    db.delete(row)
    db.commit()
    return group_to_dict(db, g)


# ---------- curricula ----------


def _curriculum(db: Session, school_id: int, curriculum_id: int) -> Curriculum:
    c = db.get(Curriculum, curriculum_id)
    if not c or c.school_id != school_id:
        raise _404("Curriculum")
    return c


def curriculum_to_dict(db: Session, c: Curriculum) -> dict:
    year = db.get(AcademicYear, c.academic_year_id)
    cls = db.get(SchoolClass, c.class_id) if c.class_id else None
    rows = db.execute(
        select(CurriculumSubject, Subject)
        .join(Subject, Subject.id == CurriculumSubject.subject_id)
        .where(CurriculumSubject.curriculum_id == c.id)
        .order_by(Subject.display_order, Subject.name)
    ).all()
    return {
        "id": c.id,
        "name": c.name,
        "board": c.board,
        "academic_year_id": c.academic_year_id,
        "academic_year_name": year.name if year else None,
        "class_id": c.class_id,
        "class_name": cls.name if cls else None,
        "status": c.status.value,
        "effective_from": c.effective_from,
        "notes": c.notes,
        "subjects": [
            {
                "id": cs.id,
                "subject_id": s.id,
                "subject_name": s.name,
                "subject_code": s.code,
                "periods_per_week": cs.periods_per_week,
                "is_core": cs.is_core,
            }
            for cs, s in rows
        ],
        "subject_count": len(rows),
        "periods_per_week": sum(cs.periods_per_week for cs, _ in rows),
    }


def list_curricula(db: Session, school_id: int, *,
                   academic_year_id: Optional[int] = None,
                   status_filter: Optional[CurriculumStatus] = None) -> list[dict]:
    stmt = select(Curriculum).where(Curriculum.school_id == school_id)
    if academic_year_id:
        stmt = stmt.where(Curriculum.academic_year_id == academic_year_id)
    if status_filter:
        stmt = stmt.where(Curriculum.status == status_filter)
    rows = db.execute(stmt.order_by(Curriculum.name)).scalars()
    return [curriculum_to_dict(db, c) for c in rows]


def create_curriculum(db: Session, school_id: int, tenant_id: int, data: dict) -> dict:
    year = db.get(AcademicYear, data["academic_year_id"])
    if not year or year.school_id != school_id:
        raise _404("Academic year")
    if data.get("class_id"):
        cls = db.get(SchoolClass, data["class_id"])
        if not cls or cls.school_id != school_id:
            raise _404("Class")
    c = Curriculum(
        tenant_id=tenant_id, school_id=school_id,
        name=str(data["name"]).strip(), board=data.get("board"),
        academic_year_id=data["academic_year_id"], class_id=data.get("class_id"),
        status=CurriculumStatus.draft,
        effective_from=data.get("effective_from"), notes=data.get("notes"),
    )
    db.add(c)
    db.commit()
    return curriculum_to_dict(db, c)


def activate_curriculum(db: Session, school_id: int, curriculum_id: int) -> dict:
    """Put a curriculum in force, retiring whatever held that slot.

    Done in one transaction rather than asking the caller to retire the old
    one first. A gap where a class has no active curriculum — or worse, a
    moment where it has two — is a state nobody should be able to reach by
    forgetting a second click.
    """
    c = _curriculum(db, school_id, curriculum_id)
    if c.status == CurriculumStatus.active:
        return curriculum_to_dict(db, c)

    previous = list(db.execute(
        select(Curriculum).where(
            Curriculum.school_id == school_id,
            Curriculum.academic_year_id == c.academic_year_id,
            Curriculum.class_id.is_(None) if c.class_id is None
            else Curriculum.class_id == c.class_id,
            Curriculum.status == CurriculumStatus.active,
            Curriculum.id != c.id,
        )
    ).scalars())
    for old in previous:
        old.status = CurriculumStatus.retired
    c.status = CurriculumStatus.active
    db.commit()

    out = curriculum_to_dict(db, c)
    out["retired"] = [{"id": p.id, "name": p.name} for p in previous]
    return out


def retire_curriculum(db: Session, school_id: int, curriculum_id: int) -> dict:
    c = _curriculum(db, school_id, curriculum_id)
    c.status = CurriculumStatus.retired
    db.commit()
    return curriculum_to_dict(db, c)


def set_curriculum_subject(db: Session, school_id: int, curriculum_id: int,
                           subject_id: int, periods_per_week: int,
                           is_core: bool = True) -> dict:
    c = _curriculum(db, school_id, curriculum_id)
    subject = db.get(Subject, subject_id)
    if not subject or subject.school_id != school_id:
        raise _404("Subject")
    if periods_per_week < 0 or periods_per_week > 40:
        raise _400("That is not a plausible number of periods a week.")
    row = db.execute(
        select(CurriculumSubject).where(
            CurriculumSubject.curriculum_id == c.id,
            CurriculumSubject.subject_id == subject_id,
        )
    ).scalar_one_or_none()
    if row is None:
        row = CurriculumSubject(
            tenant_id=c.tenant_id, school_id=school_id,
            curriculum_id=c.id, subject_id=subject_id,
        )
        db.add(row)
    row.periods_per_week = periods_per_week
    row.is_core = is_core
    db.commit()
    return curriculum_to_dict(db, c)


def remove_curriculum_subject(db: Session, school_id: int, curriculum_id: int,
                              subject_id: int) -> dict:
    c = _curriculum(db, school_id, curriculum_id)
    row = db.execute(
        select(CurriculumSubject).where(
            CurriculumSubject.curriculum_id == c.id,
            CurriculumSubject.subject_id == subject_id,
        )
    ).scalar_one_or_none()
    if not row:
        raise _404("That subject in this curriculum")
    db.delete(row)
    db.commit()
    return curriculum_to_dict(db, c)


# ---------- activities ----------


def _activity(db: Session, school_id: int, activity_id: int) -> Activity:
    a = db.get(Activity, activity_id)
    if not a or a.school_id != school_id:
        raise _404("Activity")
    return a


def _open_members(db: Session, activity_id: int) -> int:
    return db.execute(
        select(func.count(ActivityMember.id)).where(
            ActivityMember.activity_id == activity_id,
            ActivityMember.left_on.is_(None),
        )
    ).scalar_one()


def activity_to_dict(db: Session, a: Activity, *, with_members: bool = False) -> dict:
    in_charge = db.get(User, a.in_charge_user_id) if a.in_charge_user_id else None
    members = _open_members(db, a.id)
    out = {
        "id": a.id,
        "name": a.name,
        "kind": a.kind.value,
        "description": a.description,
        "in_charge_user_id": a.in_charge_user_id,
        "in_charge_name": in_charge.full_name if in_charge else None,
        "day_of_week": a.day_of_week,
        "start_time": a.start_time,
        "end_time": a.end_time,
        "venue": a.venue,
        "capacity": a.capacity,
        "is_active": a.is_active,
        "members": members,
        "places_left": max(a.capacity - members, 0) if a.capacity else None,
        "is_full": bool(a.capacity and members >= a.capacity),
    }
    if with_members:
        rows = db.execute(
            select(ActivityMember, Student)
            .join(Student, Student.id == ActivityMember.student_id)
            .where(ActivityMember.activity_id == a.id)
            .order_by(ActivityMember.left_on.is_not(None), Student.full_name)
        ).all()
        out["roster"] = [
            {
                "member_id": m.id,
                "student_id": s.id,
                "student_name": s.full_name,
                "admission_no": s.admission_no,
                "joined_on": m.joined_on,
                "left_on": m.left_on,
                "role": m.role,
                "is_current": m.left_on is None,
            }
            for m, s in rows
        ]
    return out


def list_activities(db: Session, school_id: int, *,
                    active_only: bool = False) -> list[dict]:
    stmt = select(Activity).where(Activity.school_id == school_id)
    if active_only:
        stmt = stmt.where(Activity.is_active.is_(True))
    rows = db.execute(stmt.order_by(Activity.name)).scalars()
    return [activity_to_dict(db, a) for a in rows]


def get_activity(db: Session, school_id: int, activity_id: int) -> dict:
    return activity_to_dict(db, _activity(db, school_id, activity_id), with_members=True)


def create_activity(db: Session, school_id: int, tenant_id: int, data: dict) -> dict:
    name = str(data["name"]).strip()
    clash = db.execute(
        select(Activity).where(Activity.school_id == school_id, Activity.name == name)
    ).scalar_one_or_none()
    if clash:
        raise _400(f"There is already an activity called {name}.")
    if data.get("capacity") is not None and int(data["capacity"]) < 1:
        raise _400("An activity with a capacity needs room for at least one child.")
    a = Activity(
        tenant_id=tenant_id, school_id=school_id, name=name,
        kind=ActivityKind(data.get("kind") or ActivityKind.club.value),
        description=data.get("description"),
        in_charge_user_id=data.get("in_charge_user_id"),
        day_of_week=data.get("day_of_week"),
        start_time=data.get("start_time"), end_time=data.get("end_time"),
        venue=data.get("venue"), capacity=data.get("capacity"),
        is_active=bool(data.get("is_active", True)),
    )
    db.add(a)
    db.commit()
    return activity_to_dict(db, a)


def update_activity(db: Session, school_id: int, activity_id: int, data: dict) -> dict:
    a = _activity(db, school_id, activity_id)
    if data.get("capacity") is not None:
        joined = _open_members(db, a.id)
        if int(data["capacity"]) < joined:
            raise _400(
                f"{joined} children are already in {a.name}. Take some out before "
                "lowering the capacity below that."
            )
    for field in ("name", "description", "in_charge_user_id", "day_of_week",
                  "start_time", "end_time", "venue", "capacity", "is_active"):
        if field in data:
            setattr(a, field, data[field])
    if data.get("kind"):
        a.kind = ActivityKind(data["kind"])
    db.commit()
    return activity_to_dict(db, a)


def join_activity(db: Session, school_id: int, activity_id: int, student_id: int,
                  *, role: Optional[str] = None,
                  joined_on: Optional[date] = None) -> dict:
    """Add a child, refusing once the activity is full.

    Capacity is checked here rather than trusted to the screen: a club with
    fifteen chairs that somehow has nineteen members is discovered on the day,
    by the person who has to turn four children away.
    """
    a = _activity(db, school_id, activity_id)
    if not a.is_active:
        raise _400(f"{a.name} is not running at the moment.")
    student = db.get(Student, student_id)
    if not student or student.school_id != school_id:
        raise _404("Student")

    already = db.execute(
        select(ActivityMember).where(
            ActivityMember.activity_id == a.id,
            ActivityMember.student_id == student_id,
            ActivityMember.left_on.is_(None),
        )
    ).scalar_one_or_none()
    if already:
        raise _400(f"{student.full_name} is already in {a.name}.")

    if a.capacity is not None and _open_members(db, a.id) >= a.capacity:
        raise _400(f"{a.name} is full — it takes {a.capacity}.")

    db.add(ActivityMember(
        tenant_id=a.tenant_id, school_id=school_id, activity_id=a.id,
        student_id=student_id, joined_on=joined_on or date.today(), role=role,
    ))
    db.commit()
    return activity_to_dict(db, a, with_members=True)


def leave_activity(db: Session, school_id: int, activity_id: int, student_id: int,
                   *, left_on: Optional[date] = None) -> dict:
    """Closes the membership rather than deleting it — a child who was in the
    choir last year still was."""
    a = _activity(db, school_id, activity_id)
    row = db.execute(
        select(ActivityMember).where(
            ActivityMember.activity_id == a.id,
            ActivityMember.student_id == student_id,
            ActivityMember.left_on.is_(None),
        )
    ).scalar_one_or_none()
    if not row:
        raise _404("An open membership for that child")
    row.left_on = left_on or date.today()
    db.commit()
    return activity_to_dict(db, a, with_members=True)


def student_activities(db: Session, school_id: int, student_id: int) -> list[dict]:
    rows = db.execute(
        select(ActivityMember, Activity)
        .join(Activity, Activity.id == ActivityMember.activity_id)
        .where(
            ActivityMember.school_id == school_id,
            ActivityMember.student_id == student_id,
        )
        .order_by(ActivityMember.left_on.is_not(None), Activity.name)
    ).all()
    return [
        {
            "activity_id": a.id,
            "name": a.name,
            "kind": a.kind.value,
            "joined_on": m.joined_on,
            "left_on": m.left_on,
            "role": m.role,
            "is_current": m.left_on is None,
        }
        for m, a in rows
    ]
