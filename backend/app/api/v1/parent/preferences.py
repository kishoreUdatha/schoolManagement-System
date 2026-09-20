"""What a parent is willing to be sent."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.core.enums import NoticeChannel, NotificationCategory
from app.database import get_db
from app.services import comms_settings_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class PreferenceIn(BaseModel):
    channel: NoticeChannel
    category: NotificationCategory
    is_enabled: bool


@router.get("", summary="Every channel and category, and what you have chosen")
def get_preferences(current_user: ParentUser, db: Db):
    return svc.preferences(db, current_user)


@router.put("", summary="Change one; some cannot be switched off")
def put_preference(payload: PreferenceIn, current_user: ParentUser, db: Db):
    return svc.set_preference(
        db, current_user, payload.channel, payload.category, payload.is_enabled
    )
