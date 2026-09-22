"""SCR: WhatsApp integration. The school connects its own WhatsApp Business
number (Meta Cloud API or Twilio), maps its approved templates to the kinds of
message the system sends, sends a test, and sees what went out."""
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.schemas.whatsapp import (
    DeliverySummary,
    TemplateIn,
    TemplateRead,
    TestIn,
    TestResult,
    WhatsappConfigIn,
    WhatsappConfigRead,
)
from app.services import whatsapp_service as svc

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("", response_model=WhatsappConfigRead, summary="This school's WhatsApp connection (secrets never returned)")
def get_config(current_user: SchoolAdminUser, db: Db):
    return svc.config_to_read(current_user.school_id, svc.get_config(db, current_user.school_id))


@router.put("", response_model=WhatsappConfigRead, summary="Connect or update WhatsApp")
def save_config(payload: WhatsappConfigIn, current_user: SchoolAdminUser, db: Db):
    cfg = svc.save_config(db, current_user.tenant_id, current_user.school_id, payload)
    return svc.config_to_read(current_user.school_id, cfg)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT, summary="Disconnect WhatsApp")
def delete_config(current_user: SchoolAdminUser, db: Db):
    svc.delete_config(db, current_user.school_id)


@router.get("/templates", response_model=list[TemplateRead])
def templates(current_user: SchoolAdminUser, db: Db):
    return [TemplateRead.model_validate(t, from_attributes=True) for t in svc.list_templates(db, current_user.school_id)]


@router.put("/templates", response_model=list[TemplateRead], summary="Replace the template map (one per kind of message)")
def save_templates(payload: list[TemplateIn], current_user: SchoolAdminUser, db: Db):
    rows = svc.save_templates(db, current_user.tenant_id, current_user.school_id, payload)
    return [TemplateRead.model_validate(t, from_attributes=True) for t in rows]


@router.post("/test", response_model=TestResult, summary="Send one test message")
def test(payload: TestIn, current_user: SchoolAdminUser, db: Db):
    return svc.send_test(db, current_user.school_id, payload.to, payload.purpose)


@router.get("/deliveries", response_model=DeliverySummary, summary="What went out on WhatsApp, and what happened to it")
def deliveries(current_user: SchoolAdminUser, db: Db, limit: int = Query(100, ge=1, le=500)):
    return svc.deliveries(db, current_user.school_id, limit)
