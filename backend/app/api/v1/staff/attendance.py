from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import StaffUser
from app.database import get_db
from app.schemas.staff_attendance import (
    MonthHistoryRead,
    StaffAttendanceRead,
    StaffTodayRead,
)
from app.services import staff_attendance_service


router = APIRouter()


@router.get(
    "/today",
    response_model=StaffTodayRead,
    summary="Current user's check-in state for today",
)
def today(
    current_user: StaffUser,
    db: Annotated[Session, Depends(get_db)],
):
    return staff_attendance_service.get_today(db, current_user)


@router.post(
    "/check-in",
    response_model=StaffAttendanceRead,
    summary="Record today's check-in (computes present vs late from school start time)",
)
def check_in(
    current_user: StaffUser,
    db: Annotated[Session, Depends(get_db)],
):
    rec = staff_attendance_service.check_in(db, current_user)
    return StaffAttendanceRead.model_validate(
        staff_attendance_service._to_read_dict(db, rec)
    )


@router.post(
    "/check-out",
    response_model=StaffAttendanceRead,
    summary="Record today's check-out",
)
def check_out(
    current_user: StaffUser,
    db: Annotated[Session, Depends(get_db)],
):
    rec = staff_attendance_service.check_out(db, current_user)
    return StaffAttendanceRead.model_validate(
        staff_attendance_service._to_read_dict(db, rec)
    )


@router.get(
    "/history",
    response_model=MonthHistoryRead,
    summary="Own attendance for a given month",
)
def history(
    current_user: StaffUser,
    db: Annotated[Session, Depends(get_db)],
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
):
    return staff_attendance_service.list_history(
        db, current_user, year=year, month=month
    )
