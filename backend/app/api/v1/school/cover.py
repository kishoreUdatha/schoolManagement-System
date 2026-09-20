"""Timetable cover (substitutions) and student leave requests (school side)."""
from datetime import date, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, SchoolAdminOrPrincipal, allow
from app.core.enums import StudentLeaveStatus, UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.cover import (
    AssignIn,
    Candidate,
    CoverDay,
    CoverStat,
    DecideIn,
    MySubstitution,
    StudentLeaveRead,
    UnavailabilityIn,
    UnavailabilityRead,
)
from app.services import cover_service as svc


def _academic_staff(current_user: CurrentUser) -> User:
    if current_user.role not in (UserRole.school_admin, UserRole.principal, UserRole.teacher) or current_user.school_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teaching staff access required")
    return current_user


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Academic = Annotated[User, Depends(_academic_staff)]
# deciding student leave can be delegated with the studentleave.decide permission
LeaveDecider = Annotated[
    User, Depends(allow(UserRole.school_admin, UserRole.principal, UserRole.teacher, permission="studentleave.decide"))
]


def _ids(raw: Optional[str]) -> list[int]:
    if not raw:
        return []
    try:
        return [int(x) for x in raw.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="absent must be comma-separated ids")


# ---------- cover ----------


@router.get("/cover/day", response_model=CoverDay, summary="Slots needing cover on a date")
def cover_day(current_user: SchoolAdminOrPrincipal, db: Db, on: date = Query(..., alias="date"),
              absent: Optional[str] = Query(None, description="Extra absent teacher ids, comma-separated")):
    return svc.cover_day(db, current_user.school_id, on, _ids(absent))


@router.get("/cover/candidates", response_model=list[Candidate], summary="Who can cover a slot, best first")
def candidates(current_user: SchoolAdminOrPrincipal, db: Db, entry_id: int, on: date = Query(..., alias="date")):
    return svc.candidates(db, current_user.school_id, on, entry_id)


@router.post("/cover/assign", status_code=status.HTTP_204_NO_CONTENT, summary="Assign / change / clear a substitute")
def assign(payload: AssignIn, current_user: SchoolAdminOrPrincipal, db: Db):
    svc.assign(db, current_user, payload)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class AutoIn(BaseModel):
    date: date
    absent: list[int] = []


@router.post("/cover/auto-assign", summary="Fill every uncovered slot with the best free teacher")
def auto_assign(payload: AutoIn, current_user: SchoolAdminOrPrincipal, db: Db):
    return {"assigned": svc.auto_assign(db, current_user, payload.date, payload.absent)}


@router.delete("/cover/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove(sub_id: int, current_user: SchoolAdminOrPrincipal, db: Db):
    svc.remove(db, current_user, sub_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/cover/stats", response_model=list[CoverStat], summary="Covers per teacher in a date range")
def stats(current_user: SchoolAdminOrPrincipal, db: Db, start: Optional[date] = None, end: Optional[date] = None):
    end = end or date.today()
    start = start or end - timedelta(days=30)
    return svc.cover_stats(db, current_user.school_id, start, end)


@router.get("/cover/unavailability", response_model=list[UnavailabilityRead])
def list_blocks(current_user: SchoolAdminOrPrincipal, db: Db):
    return svc.list_unavailability(db, current_user.school_id)


@router.post("/cover/unavailability", response_model=list[UnavailabilityRead], status_code=status.HTTP_201_CREATED)
def add_block(payload: UnavailabilityIn, current_user: SchoolAdminOrPrincipal, db: Db):
    svc.add_unavailability(db, current_user, payload)
    return svc.list_unavailability(db, current_user.school_id)


@router.delete("/cover/unavailability/{block_id}", response_model=list[UnavailabilityRead])
def remove_block(block_id: int, current_user: SchoolAdminOrPrincipal, db: Db):
    svc.remove_unavailability(db, current_user, block_id)
    return svc.list_unavailability(db, current_user.school_id)


@router.get("/cover/mine", response_model=list[MySubstitution], summary="Periods I'm covering")
def mine(current_user: Academic, db: Db, start: Optional[date] = None, end: Optional[date] = None):
    start = start or date.today() - timedelta(days=1)
    end = end or start + timedelta(days=14)
    return svc.my_substitutions(db, current_user, start, end)


# ---------- student leave ----------


@router.get("/student-leaves", response_model=list[StudentLeaveRead],
            summary="Class teachers see their sections; admin/principal see all")
def student_leaves(current_user: Academic, db: Db, status_: Optional[StudentLeaveStatus] = Query(None, alias="status"),
                   section_id: Optional[int] = None, start: Optional[date] = None, end: Optional[date] = None):
    return svc.leaves_to_read(db, current_user, svc.staff_leaves(db, current_user, status_, section_id, start, end))


@router.post("/student-leaves/{leave_id}/decide", response_model=StudentLeaveRead)
def decide(leave_id: int, payload: DecideIn, current_user: LeaveDecider, db: Db):
    return svc.leaves_to_read(db, current_user, [svc.decide(db, current_user, leave_id, payload)])[0]
