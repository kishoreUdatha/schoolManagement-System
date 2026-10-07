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
LabKeeper = Annotated[User, Depends(allow(UserRole.school_admin, any_of=("settings.manage", "inventory.manage")))]


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
def update_lab(lab_id: int, payload: LabIn, current_user: LabKeeper, db: Db):
    from app.services import rbac_service

    if current_user.role != UserRole.school_admin and not rbac_service.has_permission(db, current_user, "settings.manage"):
        # a lab assistant: equipment, capacity, safety notes and whether it is in use; the rest stays
        lab = svc.get_lab(db, lab_id, current_user.school_id)
        payload = LabIn(name=lab.name, code=lab.code, room_id=lab.room_id, subject_id=lab.subject_id,
                        in_charge_user_id=lab.in_charge_user_id, capacity=payload.capacity, equipment=payload.equipment,
                        safety_notes=payload.safety_notes, is_active=payload.is_active)
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



@router.get("/setup/classroom", summary="What is left of the classroom set-up: rooms, class and subject teachers, timetables")
def classroom_setup(current_user: Setup, db: Db):
    from sqlalchemy import func, select

    from app.models.academic import AcademicYear, SchoolClass, Section
    from app.models.facility import Room
    from app.models.subject import ClassSubject
    from app.models.timetable import TimetableEntry

    sid = current_user.school_id
    year = db.execute(select(AcademicYear).where(AcademicYear.school_id == sid, AcademicYear.is_current.is_(True))).scalars().first()
    if year is None:
        return {"rooms": 0, "sections": 0}
    rows = db.execute(select(Section, SchoolClass.name).join(SchoolClass, SchoolClass.id == Section.class_id)
                      .where(SchoolClass.academic_year_id == year.id).order_by(SchoolClass.display_order, Section.name)).all()
    label = {sec.id: f"{cls} {sec.name}" for sec, cls in rows}
    with_tt = set(db.execute(select(TimetableEntry.section_id).where(TimetableEntry.section_id.in_(list(label) or [-1])).distinct()).scalars())
    cs = db.execute(select(func.count(ClassSubject.id), func.count(ClassSubject.teacher_user_id))
                    .join(SchoolClass, SchoolClass.id == ClassSubject.class_id).where(SchoolClass.academic_year_id == year.id)).one()
    return {
        "rooms": db.execute(select(func.count(Room.id)).where(Room.school_id == sid, Room.is_active.is_(True))).scalar(),
        "sections": len(rows),
        "without_class_teacher": [label[sec.id] for sec, _ in rows if not sec.class_teacher_user_id],
        "class_subjects": cs[0], "without_teacher": cs[0] - cs[1],
        "without_timetable": [label[sec.id] for sec, _ in rows if sec.id not in with_tt],
        "unpublished": [label[sec.id] for sec, _ in rows if sec.id in with_tt and not sec.timetable_published_at],
    }
