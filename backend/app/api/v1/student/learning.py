"""More of a student's school life, for the student themselves: online tests,
notices, attendance, library books and study material. The child comes from
the token, as everywhere in the student portal; the services are the ones the
parent app uses (core.scoping lets a student's own login reach their record).
"""
from __future__ import annotations

from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core import storage
from app.core.deps import StudentUser
from app.core.enums import NoticeAudience, NoticeStatus
from app.database import get_db
from app.models.academic import Section
from app.models.notice import Notice
from app.schemas.curriculum import ResourceRead
from app.schemas.library import LoanRead
from app.schemas.online_exam import AnswersIn, AttemptResult, ChildTest, Paper
from app.schemas.parent_learning import AttendanceMonth
from app.services import curriculum_service, library_service, online_exam_service, parent_learning_service
from app.services.student_portal_service import me

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


# ---------- online tests ----------


@router.get("/tests", response_model=list[ChildTest], summary="Online tests set for your class")
def tests(current_user: StudentUser, db: Db):
    return online_exam_service.child_tests(db, current_user.id, me(db, current_user).id)


@router.post("/tests/{test_id}/start", response_model=Paper, summary="Start (or resume) a test")
def start(test_id: int, current_user: StudentUser, db: Db):
    return online_exam_service.start(db, current_user.id, me(db, current_user).id, test_id)


@router.get("/test-attempts/{attempt_id}", response_model=Paper)
def paper(attempt_id: int, current_user: StudentUser, db: Db):
    return online_exam_service.paper(db, current_user.id, attempt_id)


@router.put("/test-attempts/{attempt_id}/answers", response_model=Paper, summary="Save answers (autosave)")
def save(attempt_id: int, payload: AnswersIn, current_user: StudentUser, db: Db):
    return online_exam_service.save_answers(db, current_user.id, attempt_id, payload.answers)


@router.post("/test-attempts/{attempt_id}/submit", response_model=AttemptResult)
def submit(attempt_id: int, current_user: StudentUser, db: Db):
    return online_exam_service.submit(db, current_user.id, attempt_id)


@router.get("/test-attempts/{attempt_id}/result", response_model=AttemptResult)
def result(attempt_id: int, current_user: StudentUser, db: Db):
    return online_exam_service.child_result(db, current_user.id, attempt_id)


# ---------- attendance, library, study material ----------


@router.get("/attendance/month", response_model=AttendanceMonth, summary="Your attendance, day by day, for a month")
def attendance_month(current_user: StudentUser, db: Db, month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$")):
    return parent_learning_service.attendance_month(db, current_user.id, me(db, current_user).id, month or date.today().strftime("%Y-%m"))


@router.get("/library", response_model=list[LoanRead], summary="Books you have borrowed")
def library(current_user: StudentUser, db: Db):
    st = me(db, current_user)
    return [LoanRead.model_validate(library_service.loan_to_read(db, l)) for l in library_service.child_loans(db, current_user.id, st.id)]


@router.get("/resources", response_model=list[ResourceRead], summary="Study material for your class")
def resources(current_user: StudentUser, db: Db, subject_id: Optional[int] = None):
    return curriculum_service.child_resources(db, current_user, me(db, current_user).id, subject_id)


@router.get("/resources/{resource_id}/file")
def resource_file(resource_id: int, current_user: StudentUser, db: Db):
    r = curriculum_service.child_resource_file(db, current_user.id, me(db, current_user).id, resource_id)
    return Response(
        content=storage.read(r.file_key), media_type=r.content_type or "application/octet-stream",
        headers={"Content-Disposition": storage.content_disposition(r.file_name or "resource")},
    )


# ---------- notices ----------


@router.get("/notices", summary="Notices for the whole school, your class or your section")
def notices(current_user: StudentUser, db: Db, limit: int = Query(50, ge=1, le=200)):
    """What the school sent to every family, or to your class or section. A
    notice about one child alone (a fee reminder, say) goes to that family
    and is not shown here."""
    st = me(db, current_user)
    sec = db.get(Section, st.section_id)
    rows = db.execute(
        select(Notice).where(
            Notice.school_id == st.school_id, Notice.status == NoticeStatus.sent,
            or_(
                Notice.audience == NoticeAudience.all_parents,
                (Notice.audience == NoticeAudience.class_parents) & (Notice.audience_class_id == (sec.class_id if sec else -1)),
                (Notice.audience == NoticeAudience.section_parents) & (Notice.audience_section_id == st.section_id),
            ),
        ).order_by(Notice.sent_at.desc().nullslast()).limit(limit)
    ).scalars().all()
    return [{"id": n.id, "title": n.title, "body": n.body, "category": n.category.value, "sent_at": n.sent_at,
             "event_date": n.event_date, "event_venue": n.event_venue, "attachment_url": n.attachment_url, "link": n.link}
            for n in rows]
