from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.attendance import (
    AttendanceSaveRequest,
    AttendanceSaveResult,
    AttendanceViewRead,
)
from app.services import attendance_service


router = APIRouter()


@router.get(
    "",
    response_model=AttendanceViewRead,
    summary="Roster + existing attendance for (section, date)",
)
def view(
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
    section_id: int = Query(...),
    on_date: date = Query(..., alias="date"),
):
    data = attendance_service.get_view(
        db, current_user.id, current_user.school_id, section_id, on_date
    )
    return AttendanceViewRead.model_validate(data)


@router.post(
    "/save",
    response_model=AttendanceSaveResult,
    summary="Upsert attendance for a list of students on a given date",
)
def save(
    payload: AttendanceSaveRequest,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    result = attendance_service.save(
        db,
        current_user.tenant_id,
        current_user.school_id,
        current_user.id,
        payload.section_id,
        payload.date,
        payload.entries,
    )
    return AttendanceSaveResult.model_validate(result)
