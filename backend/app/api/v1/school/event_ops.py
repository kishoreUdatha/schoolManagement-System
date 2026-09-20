"""Event registers, notice campaigns and communication history."""
from __future__ import annotations

from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.school.directory import _school_staff
from app.core.deps import SchoolAdminOrPrincipal
from app.core.enums import NoticeChannel, NoticeStatus
from app.database import get_db
from app.models.user import User
from app.services import event_ops_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
# A trip register is marked by whoever is at the coach door, which is a
# teacher far more often than an administrator.
Staff = Annotated[User, Depends(_school_staff)]


class AttendanceEntry(BaseModel):
    student_id: int
    attended: bool
    note: Optional[str] = Field(None, max_length=300)


class SaveAttendanceIn(BaseModel):
    entries: list[AttendanceEntry]


@router.get("/events/{event_id}/register",
            summary="Who may go, who said yes, and who boarded")
def register(event_id: int, current_user: Staff, db: Db):
    return svc.attendance_register(db, current_user.school_id, event_id)


@router.post("/events/{event_id}/register", summary="Mark who boarded")
def mark(event_id: int, payload: SaveAttendanceIn, current_user: Staff, db: Db):
    return svc.save_attendance(
        db, current_user.school_id, current_user.tenant_id, current_user.id,
        event_id, [e.model_dump() for e in payload.entries],
    )


@router.get("/campaigns", summary="Every notice and what became of it")
def campaigns(user: SchoolAdminOrPrincipal, db: Db,
              state: Optional[NoticeStatus] = None,
              limit: int = Query(100, ge=1, le=500)):
    return svc.campaigns(db, user.school_id, state=state, limit=limit)


@router.get("/history", summary="Every message that reached a person")
def history(user: SchoolAdminOrPrincipal, db: Db,
            frm: Optional[date] = Query(None, alias="from"),
            to: Optional[date] = None,
            channel: Optional[NoticeChannel] = None,
            limit: int = Query(500, ge=1, le=2000)):
    return svc.history(db, user.school_id, frm=frm, to=to, channel=channel, limit=limit)


@router.get("/conversations", summary="Who is talking to whom — not what they said")
def conversations(user: SchoolAdminOrPrincipal, db: Db,
                  limit: int = Query(200, ge=1, le=500)):
    return svc.conversation_overview(db, user.school_id, limit=limit)
