from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.events import (
    PtmSessionDetail,
    PtmSessionIn,
    SlotOutcomeIn,
    SlotRead,
    TeacherPtm,
)
from app.services import event_ops_service as ops
from app.services import events_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[TeacherPtm], summary="My parent-teacher meeting slots")
def my_meetings(current_user: TeacherUser, db: Db):
    return svc.teacher_sessions(db, current_user.id, current_user.school_id)


@router.put("/slots/{slot_id}", response_model=SlotRead, summary="Mark a meeting done / no-show with notes")
def record(slot_id: int, payload: SlotOutcomeIn, current_user: TeacherUser, db: Db):
    return svc.record_outcome(db, current_user.id, slot_id, payload)


@router.get("/my-classes", summary="Classes you may arrange a meeting for")
def my_scopes(current_user: TeacherUser, db: Db):
    """Empty for a teacher who is nobody's class teacher, which is the
    honest answer rather than an empty dropdown with no explanation."""
    return ops.teacher_scopes(db, current_user)


@router.post("/sessions", response_model=PtmSessionDetail,
             summary="Arrange a meeting for your own class")
def create_session(section_id: int, payload: PtmSessionIn,
                   current_user: TeacherUser, db: Db):
    session = ops.create_teacher_session(db, current_user, section_id, payload)
    return svc.session_detail(db, session)


@router.post("/sessions/{session_id}/publish", response_model=PtmSessionDetail,
             summary="Open your meeting for parents to book")
def publish(session_id: int, current_user: TeacherUser, db: Db):
    session = svc.get_session(db, session_id, current_user.school_id)
    if session.created_by_user_id != current_user.id:
        from fastapi import HTTPException, status

        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "You can only publish a meeting you arranged.",
        )
    return svc.session_detail(db, svc.publish_session(db, session))
