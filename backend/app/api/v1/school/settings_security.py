"""Password policy, two-factor, and the wording a school reuses."""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.core.enums import NoticeChannel, NotificationCategory, TwoFactorScope
from app.database import get_db
from app.services import comms_settings_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class PolicyIn(BaseModel):
    min_password_length: Optional[int] = Field(None, ge=8, le=64)
    require_mixed_case: Optional[bool] = None
    require_number: Optional[bool] = None
    require_symbol: Optional[bool] = None
    password_expiry_days: Optional[int] = Field(None, ge=0, le=3650)
    max_failed_attempts: Optional[int] = Field(None, ge=0, le=100)
    lockout_minutes: Optional[int] = Field(None, ge=0, le=1440)
    session_timeout_minutes: Optional[int] = Field(None, ge=0, le=10080)
    require_2fa_for: Optional[TwoFactorScope] = None


class TemplateIn(BaseModel):
    code: str = Field(..., min_length=2, max_length=60)
    name: str = Field(..., min_length=2, max_length=120)
    channel: NoticeChannel
    category: NotificationCategory = NotificationCategory.general
    subject: Optional[str] = Field(None, max_length=200)
    body: str = Field(..., min_length=2)
    description: Optional[str] = Field(None, max_length=300)
    is_active: bool = True


class TemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    channel: Optional[NoticeChannel] = None
    category: Optional[NotificationCategory] = None
    subject: Optional[str] = Field(None, max_length=200)
    body: Optional[str] = Field(None, min_length=2)
    description: Optional[str] = Field(None, max_length=300)
    is_active: Optional[bool] = None


class PreviewIn(BaseModel):
    values: dict[str, Optional[str]] = {}


# ----- security policy -----


@router.get("/security", summary="The school's password and sign-in rules")
def get_policy(current_user: SchoolAdminUser, db: Db):
    return svc.policy_summary(db, current_user.school_id)


@router.put("/security", summary="Change them; both password paths obey at once")
def put_policy(payload: PolicyIn, current_user: SchoolAdminUser, db: Db):
    svc.update_policy(db, current_user.school_id, payload.model_dump(exclude_unset=True))
    return svc.policy_summary(db, current_user.school_id)


# ----- what may be sent -----


@router.get("/notifications/categories", summary="Channels, categories and what is locked")
def categories(current_user: SchoolAdminUser):
    return {
        "channels": [c.value for c in NoticeChannel],
        "categories": [c.value for c in NotificationCategory],
        "locked_categories": sorted(c.value for c in svc.LOCKED),
        "locked_channels": sorted(c.value for c in svc.LOCKED_CHANNELS),
    }


@router.get("/notifications/templates", summary="Wording the school reuses")
def list_templates(current_user: SchoolAdminUser, db: Db):
    return svc.list_templates(db, current_user.school_id)


@router.post("/notifications/templates", status_code=status.HTTP_201_CREATED)
def create_template(payload: TemplateIn, current_user: SchoolAdminUser, db: Db):
    return svc.create_template(
        db, current_user.tenant_id, current_user.school_id, payload.model_dump()
    )


@router.patch("/notifications/templates/{template_id}")
def update_template(template_id: int, payload: TemplateUpdate,
                    current_user: SchoolAdminUser, db: Db):
    return svc.update_template(
        db, current_user.school_id, template_id,
        payload.model_dump(exclude_unset=True),
    )


@router.delete("/notifications/templates/{template_id}",
               status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: int, current_user: SchoolAdminUser, db: Db):
    svc.delete_template(db, current_user.school_id, template_id)


@router.post("/notifications/templates/{template_id}/preview",
             summary="Fill it in, and say which placeholders went unfilled")
def preview(template_id: int, payload: PreviewIn,
            current_user: SchoolAdminUser, db: Db):
    row = svc._get_template(db, current_user.school_id, template_id)
    return svc.render(row, payload.values)
