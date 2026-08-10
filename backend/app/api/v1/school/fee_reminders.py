"""Story 13.3 — Fee reminder endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminOrAccountant
from app.database import get_db
from app.models.fee import StudentFee
from app.models.student import Student
from app.schemas.fee_reminder import ReminderLogRead, ReminderRunResult
from app.services import fee_reminder_service


router = APIRouter()


@router.post(
    "/run",
    response_model=ReminderRunResult,
    summary="Run the fee-reminder check now for this school",
)
def run_now(
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
):
    return fee_reminder_service.run_daily(db, current_user.school_id)


@router.get(
    "",
    response_model=list[ReminderLogRead],
    summary="Recent reminder history (most recent first)",
)
def history(
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(100, ge=1, le=500),
):
    logs = fee_reminder_service.list_history(
        db, current_user.school_id, limit=limit
    )
    out = []
    # batch-load student names via the linked fee for nicer UI
    fee_ids = {l.student_fee_id for l in logs}
    fees_by_id = {
        f.id: f
        for f in db.execute(
            select(StudentFee).where(StudentFee.id.in_(fee_ids))
        ).scalars().all()
    } if fee_ids else {}
    student_ids = {f.student_id for f in fees_by_id.values()}
    students_by_id = {
        s.id: s
        for s in db.execute(
            select(Student).where(Student.id.in_(student_ids))
        ).scalars().all()
    } if student_ids else {}
    for l in logs:
        fee = fees_by_id.get(l.student_fee_id)
        student = students_by_id.get(fee.student_id) if fee else None
        out.append(
            {
                "id": l.id,
                "student_fee_id": l.student_fee_id,
                "student_name": student.full_name if student else None,
                "student_admission_no": student.admission_no if student else None,
                "kind": l.kind,
                "send_date": l.send_date,
                "sent_at": l.sent_at,
                "notice_id": l.notice_id,
            }
        )
    return [ReminderLogRead.model_validate(r) for r in out]
