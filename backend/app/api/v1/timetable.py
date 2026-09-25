"""Timetable workspace shared by school admin, principal and teachers.

Admin / principal manage every section; an HOD manages the sections assigned
to them; every teacher can read their own teacher timetable.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import TimetableUser
from app.database import get_db
from app.schemas.timetable import (
    CopyTimetableRequest,
    SectionTimetableRead,
    TeacherLite,
    TeacherWeekRead,
    TimetableClash,
    TimetableEntrySet,
    TimetableScopeRead,
)
from app.services import timetable_access, timetable_service


router = APIRouter()


@router.get(
    "/scope",
    response_model=TimetableScopeRead,
    summary="Years, classes and sections the current user can manage",
)
def scope(current_user: TimetableUser, db: Annotated[Session, Depends(get_db)]):
    return TimetableScopeRead.model_validate(
        timetable_service.get_scope(db, current_user)
    )


@router.get(
    "/sections/{section_id}",
    response_model=SectionTimetableRead,
    summary="Read a section's timetable (periods + assignments)",
)
def get_section(
    section_id: int,
    current_user: TimetableUser,
    db: Annotated[Session, Depends(get_db)],
):
    timetable_access.assert_can_manage_section(db, current_user, section_id)
    return SectionTimetableRead.model_validate(
        timetable_service.get_section_timetable(
            db, section_id, current_user.school_id
        )
    )


@router.put(
    "/sections/{section_id}/slots/{period_id}",
    response_model=SectionTimetableRead,
    summary="Set (or replace) the entry at this section+period slot",
)
def set_slot(
    section_id: int,
    period_id: int,
    payload: TimetableEntrySet,
    current_user: TimetableUser,
    db: Annotated[Session, Depends(get_db)],
):
    timetable_access.assert_can_manage_section(db, current_user, section_id)
    data = timetable_service.set_entry(
        db,
        current_user.tenant_id,
        current_user.school_id,
        section_id,
        period_id,
        payload,
    )
    return SectionTimetableRead.model_validate(data)


@router.delete(
    "/sections/{section_id}/slots/{period_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def clear_slot(
    section_id: int,
    period_id: int,
    current_user: TimetableUser,
    db: Annotated[Session, Depends(get_db)],
):
    timetable_access.assert_can_manage_section(db, current_user, section_id)
    timetable_service.clear_entry(
        db, current_user.school_id, section_id, period_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/sections/{section_id}/copy",
    response_model=SectionTimetableRead,
    summary="Copy timetable from another section of the same class",
)
def copy(
    section_id: int,
    payload: CopyTimetableRequest,
    current_user: TimetableUser,
    db: Annotated[Session, Depends(get_db)],
):
    # Reading the source section is also access-controlled.
    timetable_access.assert_can_manage_section(db, current_user, section_id)
    timetable_access.assert_can_manage_section(
        db, current_user, payload.source_section_id
    )
    data = timetable_service.copy_timetable(
        db,
        current_user.tenant_id,
        current_user.school_id,
        section_id,
        payload,
    )
    return SectionTimetableRead.model_validate(data)


def _set_published(
    section_id: int, current_user, db: Session, *, published: bool
) -> SectionTimetableRead:
    timetable_access.assert_can_manage_section(db, current_user, section_id)
    timetable_service.set_published(
        db, section_id, current_user.school_id, published=published
    )
    return SectionTimetableRead.model_validate(
        timetable_service.get_section_timetable(
            db, section_id, current_user.school_id
        )
    )


@router.post("/sections/{section_id}/publish", response_model=SectionTimetableRead)
def publish(
    section_id: int,
    current_user: TimetableUser,
    db: Annotated[Session, Depends(get_db)],
):
    return _set_published(section_id, current_user, db, published=True)


@router.post("/sections/{section_id}/unpublish", response_model=SectionTimetableRead)
def unpublish(
    section_id: int,
    current_user: TimetableUser,
    db: Annotated[Session, Depends(get_db)],
):
    return _set_published(section_id, current_user, db, published=False)


@router.get(
    "/teachers",
    response_model=list[TeacherLite],
    summary="Teachers whose timetable the current user can view",
)
def teachers(current_user: TimetableUser, db: Annotated[Session, Depends(get_db)]):
    return [
        TeacherLite.model_validate(t)
        for t in timetable_service.list_teachers(db, current_user)
    ]


@router.get(
    "/teachers/{teacher_user_id}",
    response_model=TeacherWeekRead,
    summary="A teacher's weekly timetable across all sections",
)
def teacher_week(
    teacher_user_id: int,
    current_user: TimetableUser,
    db: Annotated[Session, Depends(get_db)],
):
    timetable_access.assert_can_view_teacher(db, current_user, teacher_user_id)
    # A teacher looking at their own week sees only published timetables;
    # admins, principals and HODs also see drafts.
    published_only = teacher_user_id == current_user.id and not (
        timetable_access.is_school_wide(current_user)
    )
    return TeacherWeekRead.model_validate(
        timetable_service.get_teacher_week(
            db,
            current_user.school_id,
            teacher_user_id,
            published_only=published_only,
        )
    )


@router.get(
    "/clashes",
    response_model=list[TimetableClash],
    summary="Teacher clashes (school-wide, or within an HOD's sections)",
)
def clashes(current_user: TimetableUser, db: Annotated[Session, Depends(get_db)]):
    allowed = timetable_access.manageable_section_ids(db, current_user)
    items = timetable_service.detect_clashes(
        db, current_user.school_id, section_ids=allowed
    )
    return [TimetableClash.model_validate(c) for c in items]
