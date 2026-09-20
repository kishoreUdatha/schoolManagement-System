"""A notice inbox for anybody on the staff.

The inbox service was already written against a user id rather than a parent,
so this is the same three functions with a different door on them. Nothing
new is stored: a staff notice already creates the recipient rows, there was
simply nowhere to read them.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.v1.school.directory import _school_staff
from app.database import get_db
from app.models.user import User
from app.schemas.notice import InboxNotice
from app.services import notice_service


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Staff = Annotated[User, Depends(_school_staff)]


@router.get("", response_model=list[InboxNotice], summary="Notices addressed to you")
def list_inbox(current_user: Staff, db: Db,
               unread_only: bool = Query(False),
               limit: int = Query(50, ge=1, le=200)):
    items = notice_service.list_inbox(
        db, current_user.id, unread_only=unread_only, limit=limit
    )
    return [InboxNotice.model_validate(i) for i in items]


@router.get("/unread-count", response_model=dict[str, int],
            summary="Unread count for the header badge")
def unread(current_user: Staff, db: Db):
    return {"unread": notice_service.unread_count(db, current_user.id)}


@router.post("/{recipient_id}/mark-read", status_code=status.HTTP_204_NO_CONTENT,
             summary="Mark one as read")
def mark_read(recipient_id: int, current_user: Staff, db: Db):
    # The service checks the row belongs to this user, so one staff member
    # cannot mark another's post as read by guessing an id.
    notice_service.mark_read(db, recipient_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
