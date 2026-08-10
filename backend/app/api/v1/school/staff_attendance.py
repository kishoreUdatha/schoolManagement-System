from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.schemas.staff_attendance import OverrideRequest, StaffAttendanceRead
from app.services import staff_attendance_service


router = APIRouter()


@router.get(
    "",
    response_model=list[StaffAttendanceRead],
    summary="List staff attendance records — filter by user, date, or month",
)
def list_(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    user_id: Optional[int] = Query(None),
    on_date: Optional[date] = Query(None, alias="date"),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
):
    rows = staff_attendance_service.list_for_admin(
        db,
        current_user.school_id,
        user_id=user_id,
        on_date=on_date,
        year=year,
        month=month,
    )
    return [StaffAttendanceRead.model_validate(r) for r in rows]


@router.post(
    "/override",
    response_model=StaffAttendanceRead,
    summary="Override a staff member's status for a specific date (on-leave, sick, etc.)",
)
def override(
    payload: OverrideRequest,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    rec = staff_attendance_service.override(
        db,
        current_user,
        current_user.school_id,
        payload.user_id,
        payload.date,
        payload.status,
        payload.remark,
    )
    return StaffAttendanceRead.model_validate(
        staff_attendance_service._to_read_dict(db, rec)
    )
