"""What a signed-in child can see and do.

Note what is missing from every path below: a student id. The child is taken
from the token, so there is no number in a URL for anybody to change. A
portal where /student/exams/12 works is a portal where a curious fourteen
year old finds out what number 12 got.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import StudentUser
from app.database import get_db
from app.models.homework import Homework
from app.schemas.events import CalendarItem
from app.schemas.homework import SubmissionCreate, SubmissionRead, SubmissionUpdate
from app.schemas.result import ExamResultRead, ExamSummaryForList
from app.schemas.timetable import SectionTimetableRead
from app.schemas.student_portal import (
    HomeworkItem,
    StudentDashboard,
    StudentProfile,
)
from app.services import (
    homework_service,
    insight_service,
    result_service,
    student_portal_service,
    timetable_service,
)


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/me", response_model=StudentProfile, summary="Who you are")
def me(current_user: StudentUser, db: Db):
    return student_portal_service.profile(db, student_portal_service.me(db, current_user))


@router.get("/dashboard", response_model=StudentDashboard,
            summary="Homework due, today's lessons, attendance")
def dashboard(current_user: StudentUser, db: Db):
    return student_portal_service.dashboard(db, student_portal_service.me(db, current_user))


# ----- timetable and calendar -----


@router.get("/timetable", response_model=SectionTimetableRead,
            summary="Your class's published week")
def timetable(current_user: StudentUser, db: Db):
    """The same published timetable a parent sees for this child; a draft the
    office is still working on stays hidden here too."""
    from app.models.academic import Section

    student = student_portal_service.me(db, current_user)
    sec = db.get(Section, student.section_id) if student.section_id else None
    if not sec:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "You are not in a class yet")
    if sec.timetable_published_at is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Timetable is not published yet")
    return SectionTimetableRead.model_validate(timetable_service.get_section_timetable(db, sec.id, sec.school_id))


@router.get("/calendar", response_model=list[CalendarItem],
            summary="Holidays, exams and school events for your class")
def calendar(current_user: StudentUser, db: Db, start: Optional[date] = None, end: Optional[date] = None):
    start = start or date.today()
    end = end or start + timedelta(days=41)
    if (end - start).days > 400:
        end = start + timedelta(days=400)
    student = student_portal_service.me(db, current_user)
    return insight_service.student_calendar(db, student, start, end)


# ----- homework -----


@router.get("/homework", response_model=list[HomeworkItem], summary="Your homework")
def homework(current_user: StudentUser, db: Db):
    student = student_portal_service.me(db, current_user)
    items = homework_service.list_for_student(db, student)
    return [homework_service._to_read_dict(db, h, viewer_id=current_user.id) for h in items]


@router.get("/homework/{homework_id}/submission", response_model=Optional[SubmissionRead],
            summary="What you handed in, if anything")
def get_submission(homework_id: int, current_user: StudentUser, db: Db):
    student = student_portal_service.me(db, current_user)
    sub = homework_service.get_submission_for_student(db, student.id, homework_id)
    return homework_service.submission_to_dict(db, sub) if sub else None


@router.post("/homework/{homework_id}/submission", response_model=SubmissionRead,
             status_code=status.HTTP_201_CREATED, summary="Hand work in")
def submit(homework_id: int, payload: SubmissionCreate, current_user: StudentUser, db: Db):
    student = student_portal_service.me(db, current_user)
    sub = homework_service.submit_for_student(
        db, student, homework_id, payload, by_user_id=current_user.id
    )
    return homework_service.submission_to_dict(db, sub)


@router.patch("/homework/{homework_id}/submission", response_model=SubmissionRead,
              summary="Change what you handed in")
def edit_submission(homework_id: int, payload: SubmissionUpdate, current_user: StudentUser, db: Db):
    student = student_portal_service.me(db, current_user)
    sub = homework_service.edit_submission_for_student(
        db, student.id, homework_id, payload, by_user_id=current_user.id
    )
    return homework_service.submission_to_dict(db, sub)


# ----- results -----


@router.get("/exams", response_model=list[ExamSummaryForList], summary="Your published results")
def exams(current_user: StudentUser, db: Db):
    return student_portal_service.exams(db, student_portal_service.me(db, current_user))


@router.get("/exams/{exam_id}", response_model=ExamResultRead, summary="One result, subject by subject")
def exam_result(exam_id: int, current_user: StudentUser, db: Db):
    return student_portal_service.exam_result(
        db, student_portal_service.me(db, current_user), exam_id
    )


@router.get("/exams/{exam_id}/report-card.pdf", summary="Your report card")
def report_card(exam_id: int, current_user: StudentUser, db: Db):
    student = student_portal_service.me(db, current_user)
    # The same result the parent portal builds and the same renderer the
    # school uses, so a child is never holding a different document from the
    # one at home — including when the school has withheld the result.
    result = result_service.get_published_result_for_student(db, student, exam_id)
    body = result_service.generate_report_card_pdf(db, [result], student.school_id)
    name = f"report-card-{student.admission_no}-{result['exam_name'].replace(' ', '_')}.pdf"
    return Response(
        body, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{name}"'},
    )
