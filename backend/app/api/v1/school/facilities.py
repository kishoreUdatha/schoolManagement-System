"""Rooms, labs and lab bookings."""
from datetime import date, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, allow
from app.core.enums import RoomKind, UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.facility import (
    Availability,
    BookingIn,
    BookingRead,
    LabIn,
    LabRead,
    RoomIn,
    RoomRead,
)
from app.services import facility_service as svc


def _school_staff(current_user: CurrentUser) -> User:
    if current_user.role in (UserRole.parent, UserRole.student, UserRole.super_admin) or current_user.school_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
    return current_user


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Staff = Annotated[User, Depends(_school_staff)]
# setting rooms and labs up is an admin job; a school can delegate it
Setup = Annotated[User, Depends(allow(UserRole.school_admin, permission="settings.manage"))]


# ---------- rooms ----------


@router.get("/rooms", response_model=list[RoomRead])
def list_rooms(current_user: Staff, db: Db, kind: Optional[RoomKind] = None, branch_id: Optional[int] = None):
    return svc.room_to_read(db, svc.list_rooms(db, current_user.school_id, kind, branch_id))


@router.post("/rooms", response_model=RoomRead, status_code=status.HTTP_201_CREATED)
def create_room(payload: RoomIn, current_user: Setup, db: Db):
    return svc.room_to_read(db, [svc.create_room(db, current_user, payload)])[0]


@router.put("/rooms/{room_id}", response_model=RoomRead)
def update_room(room_id: int, payload: RoomIn, current_user: Setup, db: Db):
    return svc.room_to_read(db, [svc.update_room(db, current_user, room_id, payload)])[0]


@router.delete("/rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(room_id: int, current_user: Setup, db: Db):
    svc.delete_room(db, current_user, room_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- labs ----------


@router.get("/labs", response_model=list[LabRead])
def list_labs(current_user: Staff, db: Db, active_only: bool = False):
    return svc.labs_to_read(db, svc.list_labs(db, current_user.school_id, active_only))


@router.post("/labs", response_model=LabRead, status_code=status.HTTP_201_CREATED)
def create_lab(payload: LabIn, current_user: Setup, db: Db):
    return svc.labs_to_read(db, [svc.create_lab(db, current_user, payload)])[0]


@router.put("/labs/{lab_id}", response_model=LabRead)
def update_lab(lab_id: int, payload: LabIn, current_user: Setup, db: Db):
    return svc.labs_to_read(db, [svc.update_lab(db, current_user, lab_id, payload)])[0]


@router.delete("/labs/{lab_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lab(lab_id: int, current_user: Setup, db: Db):
    svc.delete_lab(db, current_user, lab_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- bookings ----------


@router.get("/lab-bookings", response_model=list[BookingRead])
def list_bookings(
    current_user: Staff,
    db: Db,
    lab_id: Optional[int] = None,
    frm: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = None,
    mine: bool = False,
    include_cancelled: bool = False,
):
    frm = frm or date.today()
    to = to or frm + timedelta(days=30)
    items = svc.list_bookings(db, current_user.school_id, lab_id=lab_id, frm=frm, to=to,
                              teacher_user_id=current_user.id if mine else None,
                              include_cancelled=include_cancelled)
    return svc.bookings_to_read(db, items)


@router.post("/lab-bookings", response_model=BookingRead, status_code=status.HTTP_201_CREATED)
def book(payload: BookingIn, current_user: Staff, db: Db):
    return svc.bookings_to_read(db, [svc.book(db, current_user, payload)])[0]


@router.post("/lab-bookings/{booking_id}/cancel", response_model=BookingRead)
def cancel(booking_id: int, current_user: Staff, db: Db, reason: Optional[str] = None):
    return svc.bookings_to_read(db, [svc.cancel(db, current_user, booking_id, reason)])[0]


@router.get("/lab-availability", response_model=Availability, summary="Which labs are free in each period")
def availability(current_user: Staff, db: Db, on: date = Query(..., alias="date")):
    return svc.availability(db, current_user.school_id, on)
