from typing import Annotated, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.hostel import ChildHostel, ComplaintIn, ComplaintRead, OutingRead, ParentOutingIn
from app.services import hostel_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/{student_id}/hostel", response_model=Optional[ChildHostel])
def child_hostel(student_id: int, current_user: ParentUser, db: Db):
    data = svc.child_hostel(db, current_user.id, student_id)
    return ChildHostel.model_validate(data) if data else None


@router.get("/{student_id}/hostel/outings", response_model=list[OutingRead])
def outings(student_id: int, current_user: ParentUser, db: Db):
    return [OutingRead.model_validate(svc.outing_to_read(db, o)) for o in svc.parent_outings(db, current_user.id, student_id)]


@router.post("/{student_id}/hostel/outings", response_model=OutingRead, status_code=status.HTTP_201_CREATED,
             summary="Ask for home leave / an outing")
def request_outing(student_id: int, payload: ParentOutingIn, current_user: ParentUser, db: Db):
    return OutingRead.model_validate(svc.outing_to_read(db, svc.parent_request_outing(db, current_user, student_id, payload)))


@router.post("/{student_id}/hostel/outings/{outing_id}/cancel", response_model=OutingRead)
def cancel_outing(student_id: int, outing_id: int, current_user: ParentUser, db: Db):
    return OutingRead.model_validate(svc.outing_to_read(db, svc.parent_cancel_outing(db, current_user, student_id, outing_id)))


@router.post("/{student_id}/hostel/complaints", response_model=ComplaintRead, status_code=status.HTTP_201_CREATED)
def complain(student_id: int, payload: ComplaintIn, current_user: ParentUser, db: Db):
    return ComplaintRead.model_validate(svc.complaint_to_read(db, svc.parent_complaint(db, current_user, student_id, payload)))
