"""A linked child's days: attendance by day and period, the dated timetable
with cover, and the datesheet (with admit card) for exams still to come."""
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.parent_learning import AttendanceDay, AttendanceMonth, ExamSchedule, TimetableDay
from app.services import parent_learning_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get(
    "/{student_id}/attendance/month",
    response_model=AttendanceMonth,
    summary="A linked child's day-by-day attendance for one month",
)
def attendance_month(
    student_id: int,
    current_user: ParentUser,
    db: Db,
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$", description="YYYY-MM; this month when empty"),
):
    return svc.attendance_month(db, current_user.id, student_id, month or date.today().strftime("%Y-%m"))


@router.get(
    "/{student_id}/attendance/day",
    response_model=AttendanceDay,
    summary="One day's attendance for a linked child, with arrival time and lessons",
)
def attendance_day(
    student_id: int,
    current_user: ParentUser,
    db: Db,
    on: Optional[date] = Query(None, alias="date", description="today when empty"),
):
    return svc.attendance_day(db, current_user.id, student_id, on or date.today())


@router.get(
    "/{student_id}/timetable/day",
    response_model=TimetableDay,
    summary="A linked child's timetable for one date, with any cover arranged",
)
def timetable_day(
    student_id: int,
    current_user: ParentUser,
    db: Db,
    on: Optional[date] = Query(None, alias="date", description="today when empty"),
):
    return svc.timetable_day(db, current_user.id, student_id, on or date.today())


@router.get(
    "/{student_id}/exam-schedule",
    response_model=list[ExamSchedule],
    summary="Datesheets of a linked child's exams that are still to come",
)
def upcoming_schedules(student_id: int, current_user: ParentUser, db: Db):
    return svc.upcoming_exam_schedules(db, current_user.id, student_id)


@router.get(
    "/{student_id}/exam-schedule/{exam_id}",
    response_model=ExamSchedule,
    summary="One exam's datesheet for a linked child",
)
def one_schedule(student_id: int, exam_id: int, current_user: ParentUser, db: Db):
    return svc.exam_schedule(db, current_user.id, student_id, exam_id)


@router.get(
    "/{student_id}/exam-schedule/{exam_id}/admit-card.pdf",
    summary="A linked child's admit card for an exam that has not finished",
)
def admit_card(student_id: int, exam_id: int, current_user: ParentUser, db: Db):
    body, name = svc.admit_card_pdf(db, current_user.id, student_id, exam_id)
    return Response(
        body,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
