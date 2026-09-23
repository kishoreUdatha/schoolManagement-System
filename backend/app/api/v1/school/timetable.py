from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser, TimetableReader
from app.database import get_db
from app.schemas.timetable import (
    CopyTimetableRequest,
    SectionTimetableRead,
    TimetableClash,
    TimetableEntrySet,
)
from app.services import timetable_service


router = APIRouter()


@router.get(
    "/{section_id}/timetable",
    response_model=SectionTimetableRead,
    summary="Read a section's timetable (periods + assignments)",
)
def get_timetable(
    section_id: int,
    current_user: TimetableReader,
    db: Annotated[Session, Depends(get_db)],
):
    data = timetable_service.get_section_timetable(
        db, section_id, current_user.school_id
    )
    return SectionTimetableRead.model_validate(data)


@router.put(
    "/{section_id}/timetable/{period_id}",
    response_model=SectionTimetableRead,
    summary="Set (or replace) the entry at this section+period slot",
)
def set_entry(
    section_id: int,
    period_id: int,
    payload: TimetableEntrySet,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
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
    "/{section_id}/timetable/{period_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def clear_entry(
    section_id: int,
    period_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    timetable_service.clear_entry(
        db, current_user.school_id, section_id, period_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{section_id}/timetable/copy",
    response_model=SectionTimetableRead,
    summary="Copy timetable from another section of the same class",
)
def copy(
    section_id: int,
    payload: CopyTimetableRequest,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    data = timetable_service.copy_timetable(
        db,
        current_user.tenant_id,
        current_user.school_id,
        section_id,
        payload,
    )
    return SectionTimetableRead.model_validate(data)


@router.post(
    "/{section_id}/timetable/publish",
    response_model=SectionTimetableRead,
    summary="Publish (or unpublish with /unpublish) the section's timetable",
)
def publish(
    section_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    timetable_service.set_published(
        db, section_id, current_user.school_id, published=True
    )
    data = timetable_service.get_section_timetable(
        db, section_id, current_user.school_id
    )
    return SectionTimetableRead.model_validate(data)


@router.post(
    "/{section_id}/timetable/unpublish",
    response_model=SectionTimetableRead,
)
def unpublish(
    section_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    timetable_service.set_published(
        db, section_id, current_user.school_id, published=False
    )
    data = timetable_service.get_section_timetable(
        db, section_id, current_user.school_id
    )
    return SectionTimetableRead.model_validate(data)


# School-wide clash report
@router.get(
    "/clashes",
    response_model=list[TimetableClash],
    summary="School-wide teacher clash report",
)
def clashes(
    current_user: TimetableReader,
    db: Annotated[Session, Depends(get_db)],
):
    items = timetable_service.detect_clashes(db, current_user.school_id)
    return [TimetableClash.model_validate(c) for c in items]
