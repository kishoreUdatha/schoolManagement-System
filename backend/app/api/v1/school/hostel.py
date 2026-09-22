"""Hostel endpoints for school admin / principal (everything) and wardens
(their own hostel: residents, roll call, outings, menu, complaints)."""
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, HostelFeeRaiser
from app.core.enums import UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.hostel import (
    TransferIn,
    AllocationIn,
    ComplaintIn,
    ComplaintRead,
    ComplaintUpdate,
    HostelFeeGenerate,
    HostelIn,
    HostelRead,
    MenuIn,
    MenuSlot,
    OutingDecision,
    OutingIn,
    OutingRead,
    Resident,
    RollCallIn,
    RoomIn,
    RoomRead,
    RoomUpdate,
)
from app.services import hostel_service as svc


def _hostel_staff(current_user: CurrentUser) -> User:
    if current_user.role in (UserRole.parent, UserRole.student, UserRole.super_admin) or current_user.school_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
    return current_user


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Staff = Annotated[User, Depends(_hostel_staff)]


@router.get("", response_model=list[HostelRead], summary="Hostels (wardens see only their own)")
def list_hostels(current_user: Staff, db: Db):
    return [HostelRead.model_validate(svc.hostel_to_read(db, h)) for h in svc.visible_hostels(db, current_user)]


@router.post("", response_model=HostelRead, status_code=status.HTTP_201_CREATED)
def create_hostel(payload: HostelIn, current_user: Staff, db: Db):
    return HostelRead.model_validate(svc.hostel_to_read(db, svc.create_hostel(db, current_user, payload)))


@router.put("/{hostel_id}", response_model=HostelRead)
def update_hostel(hostel_id: int, payload: HostelIn, current_user: Staff, db: Db):
    return HostelRead.model_validate(svc.hostel_to_read(db, svc.update_hostel(db, hostel_id, current_user, payload)))


@router.get("/{hostel_id}/rooms", response_model=list[RoomRead])
def rooms(hostel_id: int, current_user: Staff, db: Db):
    return [RoomRead.model_validate(r) for r in svc.rooms(db, hostel_id, current_user)]


@router.post("/{hostel_id}/rooms", response_model=list[RoomRead], status_code=status.HTTP_201_CREATED)
def add_room(hostel_id: int, payload: RoomIn, current_user: Staff, db: Db):
    svc.add_room(db, hostel_id, current_user, payload)
    return [RoomRead.model_validate(r) for r in svc.rooms(db, hostel_id, current_user)]


@router.patch("/rooms/{room_id}", response_model=list[RoomRead])
def update_room(room_id: int, payload: RoomUpdate, current_user: Staff, db: Db):
    r = svc.update_room(db, room_id, current_user, payload)
    return [RoomRead.model_validate(x) for x in svc.rooms(db, r.hostel_id, current_user)]


@router.post("/allocations", status_code=status.HTTP_201_CREATED, summary="Put a student in a bed (or move them)")
def allocate(payload: AllocationIn, current_user: Staff, db: Db):
    a = svc.allocate(db, current_user, payload)
    return {"id": a.id, "student_id": a.student_id, "bed_id": a.bed_id, "start_date": a.start_date}


@router.post("/allocations/{allocation_id}/transfer", status_code=status.HTTP_201_CREATED,
             summary="Move a resident to another bed in one step")
def transfer(allocation_id: int, payload: TransferIn, current_user: Staff, db: Db):
    a = svc.transfer(db, allocation_id, current_user, payload)
    return {"id": a.id, "student_id": a.student_id, "bed_id": a.bed_id, "start_date": a.start_date}


@router.post("/allocations/{allocation_id}/vacate")
def vacate(allocation_id: int, current_user: Staff, db: Db, end_date: Optional[date] = Query(None)):
    a = svc.vacate(db, allocation_id, current_user, end_date)
    return {"id": a.id, "end_date": a.end_date}


@router.get("/{hostel_id}/residents", response_model=list[Resident])
def residents(hostel_id: int, current_user: Staff, db: Db, on: Optional[date] = Query(None)):
    return [Resident.model_validate(r) for r in svc.residents(db, hostel_id, current_user, on)]


@router.post("/{hostel_id}/roll-call", summary="Mark morning / night roll call")
def roll_call(hostel_id: int, payload: RollCallIn, current_user: Staff, db: Db):
    return {"marked": svc.roll_call(db, hostel_id, current_user, payload)}


@router.get("/{hostel_id}/outings", response_model=list[OutingRead])
def outings(hostel_id: int, current_user: Staff, db: Db, active_only: bool = Query(True)):
    return [OutingRead.model_validate(svc.outing_to_read(db, o)) for o in svc.list_outings(db, hostel_id, current_user, active_only=active_only)]


@router.post("/outings", response_model=OutingRead, status_code=status.HTTP_201_CREATED)
def create_outing(payload: OutingIn, current_user: Staff, db: Db):
    return OutingRead.model_validate(svc.outing_to_read(db, svc.create_outing(db, current_user, payload)))


@router.post("/outings/{outing_id}/decide", response_model=OutingRead)
def decide_outing(outing_id: int, payload: OutingDecision, current_user: Staff, db: Db):
    return OutingRead.model_validate(svc.outing_to_read(db, svc.decide_outing(db, outing_id, current_user, payload)))


@router.post("/outings/{outing_id}/out", response_model=OutingRead)
def mark_out(outing_id: int, current_user: Staff, db: Db):
    return OutingRead.model_validate(svc.outing_to_read(db, svc.mark_out(db, outing_id, current_user)))


@router.post("/outings/{outing_id}/returned", response_model=OutingRead)
def mark_returned(outing_id: int, current_user: Staff, db: Db):
    return OutingRead.model_validate(svc.outing_to_read(db, svc.mark_returned(db, outing_id, current_user)))


@router.get("/{hostel_id}/menu", response_model=list[MenuSlot])
def get_menu(hostel_id: int, current_user: Staff, db: Db):
    svc._hostel(db, hostel_id, current_user)
    return [MenuSlot(day_of_week=m.day_of_week, meal=m.meal, items=m.items) for m in svc.get_menu(db, hostel_id)]


@router.put("/{hostel_id}/menu", response_model=list[MenuSlot])
def set_menu(hostel_id: int, payload: MenuIn, current_user: Staff, db: Db):
    return [MenuSlot(day_of_week=m.day_of_week, meal=m.meal, items=m.items) for m in svc.set_menu(db, hostel_id, current_user, payload)]


@router.get("/{hostel_id}/complaints", response_model=list[ComplaintRead])
def complaints(hostel_id: int, current_user: Staff, db: Db, open_only: bool = Query(True)):
    return [ComplaintRead.model_validate(svc.complaint_to_read(db, c)) for c in svc.list_complaints(db, hostel_id, current_user, open_only=open_only)]


@router.post("/{hostel_id}/complaints", response_model=ComplaintRead, status_code=status.HTTP_201_CREATED)
def raise_complaint(hostel_id: int, payload: ComplaintIn, current_user: Staff, db: Db):
    return ComplaintRead.model_validate(svc.complaint_to_read(db, svc.staff_complaint(db, hostel_id, current_user, payload)))


@router.patch("/complaints/{complaint_id}", response_model=ComplaintRead)
def update_complaint(complaint_id: int, payload: ComplaintUpdate, current_user: Staff, db: Db):
    return ComplaintRead.model_validate(svc.complaint_to_read(db, svc.update_complaint(db, complaint_id, current_user, payload)))


@router.post("/fees/generate", summary="Raise the month's hostel fee for every resident")
def generate_fees(payload: HostelFeeGenerate, current_user: HostelFeeRaiser, db: Db):
    return svc.generate_fees(db, current_user, payload)
