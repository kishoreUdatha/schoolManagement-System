"""Locking the attendance register, and the visitor master."""
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, allow
from app.core.enums import UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.register import (
    BlockIn,
    LockDayResult,
    LockIn,
    RegisterRow,
    ReopenIn,
    VisitorIn,
    VisitorRead,
    VisitorVisit,
)
from app.services import register_service as svc


def _school_staff(current_user: CurrentUser) -> User:
    if current_user.role in (UserRole.parent, UserRole.student, UserRole.super_admin) or current_user.school_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
    return current_user


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Staff = Annotated[User, Depends(_school_staff)]
# locking is the office's job, but a school can delegate it
Locker = Annotated[
    User, Depends(allow(UserRole.school_admin, UserRole.principal, permission="attendance.correct"))
]
FrontDesk = Annotated[
    User, Depends(allow(UserRole.school_admin, UserRole.principal, UserRole.staff, permission="frontdesk.manage"))
]


# ---------- attendance registers ----------


@router.get("/attendance/registers", response_model=list[RegisterRow], summary="Every class register for a day")
def registers(current_user: Staff, db: Db, on: date = Query(..., alias="date")):
    return svc.day_overview(db, current_user.school_id, on)


@router.post("/attendance/registers/lock", response_model=RegisterRow)
def lock(payload: LockIn, current_user: Locker, db: Db):
    svc.lock(db, current_user, payload.section_id, payload.date)
    return next(r for r in svc.day_overview(db, current_user.school_id, payload.date) if r["section_id"] == payload.section_id)


@router.post("/attendance/registers/reopen", response_model=RegisterRow, summary="Reopen a locked register")
def reopen(payload: ReopenIn, current_user: Locker, db: Db):
    svc.reopen(db, current_user, payload.section_id, payload.date, payload.reason)
    return next(r for r in svc.day_overview(db, current_user.school_id, payload.date) if r["section_id"] == payload.section_id)


@router.post("/attendance/registers/lock-day", response_model=LockDayResult, summary="Lock every marked register that day")
def lock_day(current_user: Locker, db: Db, on: date = Query(..., alias="date")):
    return svc.lock_day(db, current_user, on)


# ---------- visitor master ----------


@router.get("/front-desk/visitors", response_model=list[VisitorRead])
def visitors(current_user: FrontDesk, db: Db, search: Optional[str] = None, blocked_only: bool = False):
    return svc.visitors_to_read(db, svc.list_visitors(db, current_user.school_id, search, blocked_only))


@router.get("/front-desk/visitors/{visitor_id}", response_model=VisitorRead)
def visitor(visitor_id: int, current_user: FrontDesk, db: Db):
    return svc.visitors_to_read(db, [svc.get_visitor(db, visitor_id, current_user.school_id)])[0]


@router.get("/front-desk/visitors/{visitor_id}/visits", response_model=list[VisitorVisit])
def history(visitor_id: int, current_user: FrontDesk, db: Db):
    return svc.visitor_history(db, current_user.school_id, visitor_id)


@router.put("/front-desk/visitors/{visitor_id}", response_model=VisitorRead)
def update(visitor_id: int, payload: VisitorIn, current_user: FrontDesk, db: Db):
    return svc.visitors_to_read(db, [svc.update_visitor(db, current_user, visitor_id, payload)])[0]


@router.post("/front-desk/visitors/{visitor_id}/block", response_model=VisitorRead,
             summary="Bar someone from the school, or lift it")
def block(visitor_id: int, payload: BlockIn, current_user: FrontDesk, db: Db):
    return svc.visitors_to_read(db, [svc.set_blocked(db, current_user, visitor_id, payload.blocked, payload.reason)])[0]


@router.post("/front-desk/visitors/backfill", summary="Create master records for older visits")
def backfill(current_user: FrontDesk, db: Db):
    return {"created": svc.backfill_visitors(db, current_user.school_id)}
