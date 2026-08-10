"""Story 12.1 — Teacher-side weekly report endpoints."""
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.weekly_report import (
    WeeklyReportGenerateRequest,
    WeeklyReportRead,
    WeeklyReportSetRemark,
)
from app.services import weekly_report_service


router = APIRouter()


@router.post(
    "/generate",
    response_model=list[WeeklyReportRead],
    status_code=status.HTTP_201_CREATED,
    summary="Generate weekly reports for every student in a section",
)
def generate(
    payload: WeeklyReportGenerateRequest,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    rows = weekly_report_service.generate_for_section(
        db, current_user.tenant_id, current_user.school_id, current_user.id, payload
    )
    return [
        WeeklyReportRead.model_validate(weekly_report_service.to_read_dict(db, r))
        for r in rows
    ]


@router.get(
    "",
    response_model=list[WeeklyReportRead],
    summary="Existing weekly reports for a section + week",
)
def list_(
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
    section_id: int = Query(...),
    week_start: date = Query(...),
):
    rows = weekly_report_service.list_for_section_week(
        db, section_id, week_start, current_user.school_id
    )
    return [
        WeeklyReportRead.model_validate(weekly_report_service.to_read_dict(db, r))
        for r in rows
    ]


@router.patch(
    "/{report_id}",
    response_model=WeeklyReportRead,
    summary="Edit teacher remark / share flag",
)
def set_remark(
    report_id: int,
    payload: WeeklyReportSetRemark,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    r = weekly_report_service.set_remark(
        db, report_id, current_user.id, current_user.school_id, payload
    )
    return WeeklyReportRead.model_validate(weekly_report_service.to_read_dict(db, r))
