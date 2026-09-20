"""Lesson attendance, register corrections, and chasing persistent absence."""
from __future__ import annotations

from datetime import date, time
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, SchoolAdminOrPrincipal, TeacherUser
from app.core.enums import AttendanceStatus, ContactMethod, CorrectionStatus
from app.database import get_db
from app.services import attendance_ops_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class PeriodEntry(BaseModel):
    student_id: int
    status: AttendanceStatus
    remark: Optional[str] = Field(None, max_length=300)


class SavePeriodIn(BaseModel):
    section_id: int
    date: date
    period_id: int
    entries: list[PeriodEntry]


class TimesIn(BaseModel):
    student_id: int
    date: date
    arrived_at: Optional[time] = None
    left_at: Optional[time] = None
    remark: Optional[str] = Field(None, max_length=300)


class CorrectionIn(BaseModel):
    student_id: int
    date: date
    to_status: AttendanceStatus
    reason: str = Field(..., min_length=3, max_length=2000)


class DecideIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(None, max_length=300)


class ContactIn(BaseModel):
    student_id: int
    method: ContactMethod
    note: str = Field(..., min_length=3, max_length=4000)
    spoke_to: Optional[str] = Field(None, max_length=120)
    agreed_action: Optional[str] = Field(None, max_length=4000)
    follow_up_on: Optional[date] = None
    contacted_on: Optional[date] = None


# ----- one lesson; a teacher marks their own -----


@router.get("/periods", summary="The roster for one lesson")
def period_grid(current_user: CurrentUser, db: Db,
                section_id: int = Query(...), date_: date = Query(..., alias="date"),
                period_id: int = Query(...)):
    return svc.period_grid(db, current_user.school_id, section_id, date_, period_id)


@router.post("/periods", summary="Mark one lesson")
def save_period(payload: SavePeriodIn, current_user: CurrentUser, db: Db):
    return svc.save_period(
        db, current_user.school_id, current_user.tenant_id, current_user.id,
        payload.section_id, payload.date, payload.period_id,
        [e.model_dump() for e in payload.entries],
    )


@router.get("/periods/gaps", summary="In school, but missing from a lesson")
def gaps(current_user: CurrentUser, db: Db,
         section_id: int = Query(...), date_: date = Query(..., alias="date")):
    return svc.period_gaps(db, current_user.school_id, section_id, date_)


# ----- late in, early out -----


@router.put("/times", summary="Record a late arrival or an early departure")
def set_times(payload: TimesIn, current_user: CurrentUser, db: Db):
    return svc.set_times(
        db, current_user.school_id, payload.student_id, payload.date,
        arrived_at=payload.arrived_at, left_at=payload.left_at, remark=payload.remark,
    )


@router.get("/times", summary="Everybody late or away early, over a window")
def late_and_early(user: SchoolAdminOrPrincipal, db: Db,
                   frm: date = Query(..., alias="from"), to: date = Query(...)):
    return svc.late_and_early(db, user.school_id, frm=frm, to=to)


# ----- disputing a mark -----


@router.get("/corrections", summary="Corrections asked for")
def list_corrections(user: SchoolAdminOrPrincipal, db: Db,
                     state: Optional[CorrectionStatus] = None):
    return svc.list_corrections(db, user.school_id, state=state)


@router.post("/corrections", status_code=status.HTTP_201_CREATED,
             summary="Say the register is wrong, and why")
def request_correction(payload: CorrectionIn, current_user: CurrentUser, db: Db):
    return svc.request_correction(
        db, current_user.school_id, current_user.tenant_id, current_user.id,
        payload.student_id, payload.date, payload.to_status, payload.reason,
    )


@router.post("/corrections/{correction_id}/decide",
             summary="Agree or refuse — never the person who asked")
def decide(correction_id: int, payload: DecideIn,
           user: SchoolAdminOrPrincipal, db: Db):
    return svc.decide_correction(
        db, user.school_id, user.id, correction_id, payload.approve, payload.note
    )


# ----- persistent absence -----


@router.get("/at-risk", summary="Who is slipping, and who has spoken to them")
def at_risk(user: SchoolAdminOrPrincipal, db: Db,
            below: float = Query(75.0, ge=0, le=100),
            days: int = Query(120, ge=14, le=365),
            min_days: int = Query(10, ge=1)):
    return svc.at_risk(db, user.school_id, below=below, days=days, min_days=min_days)


@router.post("/contacts", status_code=status.HTTP_201_CREATED,
             summary="Record that somebody rang home")
def log_contact(payload: ContactIn, user: SchoolAdminOrPrincipal, db: Db):
    return svc.log_contact(
        db, user.school_id, user.tenant_id, user.id, payload.student_id,
        method=payload.method, note=payload.note, spoke_to=payload.spoke_to,
        agreed_action=payload.agreed_action, follow_up_on=payload.follow_up_on,
        contacted_on=payload.contacted_on,
    )


@router.get("/contacts/{student_id}", summary="What has been tried for this child")
def contact_history(student_id: int, user: SchoolAdminOrPrincipal, db: Db):
    return svc.contact_history(db, user.school_id, student_id)
