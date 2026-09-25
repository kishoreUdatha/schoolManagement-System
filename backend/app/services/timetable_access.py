"""Who may see or edit which timetable.

* School admin, principal -> every section in their school.
* Teacher with HOD assignments -> only the assigned sections.
* Any teacher -> their own teacher timetable (read-only).
"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import UserRole
from app.models.subject import ClassSubject
from app.models.timetable import HodAssignment, TimetableEntry
from app.models.user import User


def is_school_wide(user: User) -> bool:
    return user.role in (UserRole.school_admin, UserRole.principal)


def hod_section_ids(db: Session, user: User) -> set[int]:
    if user.role != UserRole.teacher:
        return set()
    return set(
        db.execute(
            select(HodAssignment.section_id).where(
                HodAssignment.teacher_user_id == user.id,
                HodAssignment.school_id == user.school_id,
            )
        ).scalars()
    )


def manageable_section_ids(db: Session, user: User) -> set[int] | None:
    """None means "every section in the school"."""
    if is_school_wide(user):
        return None
    return hod_section_ids(db, user)


def assert_can_manage_section(db: Session, user: User, section_id: int) -> None:
    allowed = manageable_section_ids(db, user)
    if allowed is not None and section_id not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage timetables of sections assigned to you",
        )


def visible_teacher_ids(db: Session, user: User) -> set[int] | None:
    """Teachers whose timetable this user may view. None = all in school."""
    if is_school_wide(user):
        return None
    ids = {user.id}
    sections = hod_section_ids(db, user)
    if sections:
        ids |= set(
            db.execute(
                select(ClassSubject.teacher_user_id)
                .join(
                    TimetableEntry,
                    TimetableEntry.class_subject_id == ClassSubject.id,
                )
                .where(
                    TimetableEntry.section_id.in_(sections),
                    ClassSubject.teacher_user_id.is_not(None),
                )
            ).scalars()
        )
    return ids


def assert_can_view_teacher(db: Session, user: User, teacher_user_id: int) -> None:
    allowed = visible_teacher_ids(db, user)
    if allowed is not None and teacher_user_id not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own timetable",
        )
