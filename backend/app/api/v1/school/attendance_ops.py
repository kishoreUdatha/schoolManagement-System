"""Lesson attendance, register corrections, and chasing persistent absence."""
from __future__ import annotations

from datetime import date, time
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, SchoolAdminOrPrincipal, TeacherUser
from app.core.enums import AttendanceStatus, ContactMethod, CorrectionStatus, UserRole
from app.core.scoping import require_linked_child
from app.database import get_db
from app.models.user import User
from app.services import attendance_ops_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]

# Who may say a register is wrong. Anyone who works here, for any child in
# the school; a parent, only for a child they are actually linked to.
_SCHOOL_SIDE = {
    UserRole.school_admin,
    UserRole.principal,
    UserRole.teacher,
    UserRole.staff,
    UserRole.accountant,
}


def _may_dispute(db: Session, user: User, student_id: int) -> None:
    """Guard the one route on this file that is not staff-only.

    It has to stay open to parents — the whole design is that a parent asks
    and the office decides, rather than a parent editing the register. But
    "open to parents" was implemented as open to anyone signed in, with no
    check that the child was theirs, so any account could dispute any
    student in the school.
    """
    if user.role in _SCHOOL_SIDE:
        return
    if user.role == UserRole.parent:
        require_linked_child(db, user.id, student_id)
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only school staff or the child's parent can dispute a register",
    )


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
    authorised_by: Optional[str] = Field(None, max_length=120)


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
        authorised_by=payload.authorised_by, recorded_by=current_user.id,
    )


@router.get("/times", summary="Everybody late or away early, over a window")
def late_and_early(user: SchoolAdminOrPrincipal, db: Db,
                   frm: date = Query(..., alias="from"), to: date = Query(...)):
    return svc.late_and_early(db, user.school_id, frm=frm, to=to)


# ----- disputing a mark -----


@router.get("/corrections", summary="Corrections asked for")
def list_corrections(user: CurrentUser, db: Db,
                     state: Optional[CorrectionStatus] = None):
    # the office and the principal see every request; a teacher, the ones they made
    if user.role in (UserRole.school_admin, UserRole.principal):
        return svc.list_corrections(db, user.school_id, state=state)
    if user.role == UserRole.teacher:
        return svc.list_corrections(db, user.school_id, state=state, requested_by=user.id)
    raise HTTPException(status.HTTP_403_FORBIDDEN, "School admin, principal or teacher access required")


@router.post("/corrections", status_code=status.HTTP_201_CREATED,
             summary="Say the register is wrong, and why")
def request_correction(payload: CorrectionIn, current_user: CurrentUser, db: Db):
    _may_dispute(db, current_user, payload.student_id)
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
