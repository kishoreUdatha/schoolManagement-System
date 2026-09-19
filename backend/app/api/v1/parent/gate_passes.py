from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.visitor import GatePassRead, ParentGatePassIn
from app.services import visitor_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/{student_id}/gate-passes", response_model=list[GatePassRead])
def list_passes(student_id: int, current_user: ParentUser, db: Db):
    return [GatePassRead.model_validate(svc.pass_to_read(db, g)) for g in svc.parent_passes(db, current_user.id, student_id)]


@router.post(
    "/{student_id}/gate-passes",
    response_model=GatePassRead,
    status_code=status.HTTP_201_CREATED,
    summary="Ask to pick your child up early",
)
def request_pass(student_id: int, payload: ParentGatePassIn, current_user: ParentUser, db: Db):
    return GatePassRead.model_validate(svc.pass_to_read(db, svc.parent_request(db, current_user, student_id, payload)))


@router.post("/{student_id}/gate-passes/{pass_id}/cancel", response_model=GatePassRead)
def cancel_pass(student_id: int, pass_id: int, current_user: ParentUser, db: Db):
    return GatePassRead.model_validate(svc.pass_to_read(db, svc.parent_cancel(db, current_user, student_id, pass_id)))
