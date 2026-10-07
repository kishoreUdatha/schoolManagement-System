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



@router.get("/class-overview", summary="A class teacher's own section: the month's register, children below the mark, today's absentees")
def class_overview(
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
    section_id: int = Query(...),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    below: float = Query(75, ge=1, le=100),
):
    from app.core.scoping import school_today
    from app.services import attendance_ops_service, attendance_report_service

    sec = attendance_service._check_class_teacher_access(db, current_user.id, section_id, current_user.school_id)
    register = attendance_report_service.student_monthly(db, current_user.school_id, sec.id, year, month)
    ids = {r["student_id"] for r in register["rows"]}
    risk = attendance_ops_service.at_risk(db, current_user.school_id, below=below)
    today = school_today(db, current_user.school_id)
    absent = attendance_report_service.daily_absent(db, current_user.school_id, today)
    return {
        "register": register,
        "below": below,
        "at_risk": [x for x in risk["students"] if x["student_id"] in ids],
        "today": today,
        "absent_today": [x for x in absent if x.get("section_id") == sec.id],
    }
