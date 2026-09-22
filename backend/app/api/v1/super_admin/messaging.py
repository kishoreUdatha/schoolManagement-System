"""The platform's own WhatsApp and SMS, which send new school admins their
sign-in details (services.platform_messaging_service)."""
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import SuperAdminUser
from app.database import get_db
from app.schemas.platform_messaging import ChannelIn, LoginSendResult, MessageLogRead, MessagingRead, SendResult, TestIn
from app.services import platform_messaging_service as svc

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Channel = Literal["whatsapp", "sms"]


@router.get("/messaging", response_model=MessagingRead, summary="The platform's WhatsApp and SMS settings")
def get_messaging(_: SuperAdminUser, db: Db):
    return svc.overview(db)


@router.put("/messaging/{channel}", response_model=MessagingRead, summary="Set up the platform's WhatsApp or SMS")
def put_channel(channel: Channel, payload: ChannelIn, _: SuperAdminUser, db: Db):
    return svc.save(db, channel, payload)


@router.delete("/messaging/{channel}", response_model=MessagingRead, summary="Switch off the platform's WhatsApp or SMS")
def delete_channel(channel: Channel, _: SuperAdminUser, db: Db):
    return svc.remove(db, channel)


@router.post("/messaging/{channel}/test", response_model=SendResult, summary="Send a test message")
def test_channel(channel: Channel, payload: TestIn, _: SuperAdminUser, db: Db):
    return svc.send_test(db, channel, payload.to)


@router.get("/messaging/logs", response_model=list[MessageLogRead], summary="Messages the platform sent")
def message_logs(_: SuperAdminUser, db: Db, tenant_id: Optional[int] = Query(None)):
    return svc.logs(db, tenant_id)


@router.post("/tenants/{tenant_id}/resend-login", response_model=LoginSendResult,
             summary="New temporary password for the school admin, sent on WhatsApp and SMS")
def resend_login(tenant_id: int, _: SuperAdminUser, db: Db):
    return svc.resend_login(db, tenant_id)
