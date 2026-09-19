from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.events import SlotOutcomeIn, SlotRead, TeacherPtm
from app.services import events_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[TeacherPtm], summary="My parent-teacher meeting slots")
def my_meetings(current_user: TeacherUser, db: Db):
    return svc.teacher_sessions(db, current_user.id, current_user.school_id)


@router.put("/slots/{slot_id}", response_model=SlotRead, summary="Mark a meeting done / no-show with notes")
def record(slot_id: int, payload: SlotOutcomeIn, current_user: TeacherUser, db: Db):
    return svc.record_outcome(db, current_user.id, slot_id, payload)
