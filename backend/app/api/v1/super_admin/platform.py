"""Platform operations: billing, quotas, operator accounts, tickets,
announcements, settings and health.

Every route requires a platform administrator. Tickets are read with internal
notes included here because only a super admin can reach these paths at all —
the service still takes the flag explicitly rather than assuming, so a
tenant-facing route can be added later without having to remember.
"""
from __future__ import annotations

from datetime import date
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import SuperAdminUser
from app.core.enums import AnnouncementAudience, TicketPriority, TicketStatus
from app.database import get_db
from app.services import platform_service


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


# ----- payloads -----


class PlatformUserIn(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=160)
    email: str = Field(..., min_length=3, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)


class ActiveIn(BaseModel):
    is_active: bool


class TicketIn(BaseModel):
    subject: str = Field(..., min_length=3, max_length=200)
    body: str = Field(..., min_length=3, max_length=8000)
    tenant_id: Optional[int] = None
    priority: TicketPriority = TicketPriority.normal


class TicketUpdateIn(BaseModel):
    status: Optional[TicketStatus] = None
    priority: Optional[TicketPriority] = None
    assigned_to_user_id: Optional[int] = None


class ReplyIn(BaseModel):
    body: str = Field(..., min_length=2, max_length=8000)
    is_internal: bool = False


class AnnouncementIn(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    body: str = Field(..., min_length=3, max_length=8000)
    audience: AnnouncementAudience = AnnouncementAudience.all
    starts_on: date
    ends_on: Optional[date] = None
    is_active: bool = True


class AnnouncementUpdateIn(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    body: Optional[str] = Field(None, min_length=3, max_length=8000)
    audience: Optional[AnnouncementAudience] = None
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None
    is_active: Optional[bool] = None


class SettingIn(BaseModel):
    key: str = Field(..., min_length=1, max_length=80)
    value: Any
    description: Optional[str] = Field(None, max_length=300)


# ----- billing and usage -----


@router.get("/billing", summary="Subscriptions and payments across tenants")
def billing(_: SuperAdminUser, db: Db):
    return platform_service.billing_overview(db)


@router.get("/usage-overview", summary="Usage against quota, tenant by tenant")
def usage_overview(_: SuperAdminUser, db: Db):
    return platform_service.usage_overview(db)


# ----- operator accounts -----


@router.get("/platform-users", summary="Platform administrators")
def list_users(_: SuperAdminUser, db: Db):
    return platform_service.list_platform_users(db)


@router.post("/platform-users", status_code=status.HTTP_201_CREATED,
             summary="Add a platform administrator; the password is shown once")
def create_user(payload: PlatformUserIn, _: SuperAdminUser, db: Db):
    return platform_service.create_platform_user(
        db, payload.full_name, payload.email, payload.phone
    )


@router.patch("/platform-users/{user_id}",
              summary="Switch an account on or off; never the last one")
def set_active(user_id: int, payload: ActiveIn, _: SuperAdminUser, db: Db):
    return platform_service.set_platform_user_active(db, user_id, payload.is_active)


@router.post("/platform-users/{user_id}/reset-password",
             summary="Issue a new password, shown once")
def reset_password(user_id: int, _: SuperAdminUser, db: Db):
    return platform_service.reset_platform_password(db, user_id)


# ----- tickets -----


@router.get("/tickets", summary="The support queue")
def list_tickets(_: SuperAdminUser, db: Db,
                 state: Optional[TicketStatus] = Query(None, alias="status"),
                 priority: Optional[TicketPriority] = None,
                 tenant_id: Optional[int] = None):
    return platform_service.list_tickets(
        db, state=state, priority=priority, tenant_id=tenant_id, internal=True
    )


@router.post("/tickets", status_code=status.HTTP_201_CREATED, summary="Raise a ticket")
def create_ticket(payload: TicketIn, current_user: SuperAdminUser, db: Db):
    return platform_service.create_ticket(
        db, current_user.id, payload.subject, payload.body,
        tenant_id=payload.tenant_id, priority=payload.priority,
    )


@router.get("/tickets/{ticket_id}", summary="One ticket with its replies")
def get_ticket(ticket_id: int, _: SuperAdminUser, db: Db):
    return platform_service.get_ticket(db, ticket_id, internal=True)


@router.patch("/tickets/{ticket_id}", summary="Change status, priority or owner")
def update_ticket(ticket_id: int, payload: TicketUpdateIn, _: SuperAdminUser, db: Db):
    return platform_service.update_ticket(
        db, ticket_id, state=payload.status, priority=payload.priority,
        assigned_to_user_id=payload.assigned_to_user_id,
    )


@router.post("/tickets/{ticket_id}/replies", status_code=status.HTTP_201_CREATED,
             summary="Reply, or leave a note the school never sees")
def reply(ticket_id: int, payload: ReplyIn, current_user: SuperAdminUser, db: Db):
    return platform_service.reply_to_ticket(
        db, ticket_id, current_user.id, payload.body, is_internal=payload.is_internal
    )


# ----- announcements -----


@router.get("/announcements", summary="Global announcements")
def list_announcements(_: SuperAdminUser, db: Db, live_only: bool = False):
    return platform_service.list_announcements(db, live_only=live_only)


@router.post("/announcements", status_code=status.HTTP_201_CREATED,
             summary="Announce something to every school")
def create_announcement(payload: AnnouncementIn, current_user: SuperAdminUser, db: Db):
    return platform_service.create_announcement(
        db, current_user.id, title=payload.title, body=payload.body,
        audience=payload.audience, starts_on=payload.starts_on,
        ends_on=payload.ends_on, is_active=payload.is_active,
    )


@router.patch("/announcements/{announcement_id}", summary="Change or withdraw one")
def update_announcement(announcement_id: int, payload: AnnouncementUpdateIn,
                        _: SuperAdminUser, db: Db):
    return platform_service.update_announcement(
        db, announcement_id, **payload.model_dump(exclude_unset=True)
    )


@router.delete("/announcements/{announcement_id}",
               status_code=status.HTTP_204_NO_CONTENT, summary="Remove one")
def delete_announcement(announcement_id: int, _: SuperAdminUser, db: Db):
    platform_service.delete_announcement(db, announcement_id)


# ----- settings -----


@router.get("/settings", summary="Platform settings, with the ones not yet set")
def list_settings(_: SuperAdminUser, db: Db):
    return platform_service.list_settings(db)


@router.put("/settings", summary="Set one")
def set_setting(payload: SettingIn, current_user: SuperAdminUser, db: Db):
    return platform_service.set_setting(
        db, current_user.id, payload.key, payload.value, payload.description
    )


@router.delete("/settings/{key}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Unset one, putting it back to its default")
def delete_setting(key: str, _: SuperAdminUser, db: Db):
    platform_service.delete_setting(db, key)


# ----- health -----


@router.get("/health", summary="What is checked, and what is not monitored")
def health(_: SuperAdminUser, db: Db):
    from app.services import insight_service

    data = platform_service.health(db)
    # Each look is also a sample for the history (at most one a minute).
    try:
        insight_service.record_health(db, data["checks"])
    except Exception:  # noqa: BLE001 — the history must never break the probe
        db.rollback()
    return data


@router.get("/health/history", summary="Availability and response time from the kept probes")
def health_history(_: SuperAdminUser, db: Db, days: int = Query(7, ge=1, le=90)):
    from app.services import insight_service

    return insight_service.health_history(db, days)


@router.get("/activity/schools-by-month",
            summary="Schools on the platform, and schools in use, month by month")
def schools_by_month(_: SuperAdminUser, db: Db, months: int = Query(6, ge=1, le=24)):
    from app.services import insight_service

    return insight_service.active_schools_by_month(db, months)


@router.get("/tenants/{tenant_id}/activity", summary="Recent activity in one organisation")
def tenant_activity(tenant_id: int, _: SuperAdminUser, db: Db, limit: int = Query(8, ge=1, le=50)):
    from app.services import insight_service

    return insight_service.activity_feed(db, tenant_id=tenant_id, limit=limit)
