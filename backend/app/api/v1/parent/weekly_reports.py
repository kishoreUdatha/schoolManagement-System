"""Story 12.2 — Parent-side weekly report listing."""
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.weekly_report import WeeklyReportRead
from app.services import weekly_report_service


router = APIRouter()


@router.get(
    "/{student_id}/weekly-reports",
    response_model=list[WeeklyReportRead],
    summary="Shared weekly reports for a linked child (latest first)",
)
def list_for_child(
    student_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(12, ge=1, le=52),
):
    rows = weekly_report_service.list_for_child(
        db, current_user.id, student_id, limit=limit
    )
    return [
        WeeklyReportRead.model_validate(weekly_report_service.to_read_dict(db, r))
        for r in rows
    ]
