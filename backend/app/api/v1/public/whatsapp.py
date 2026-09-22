"""WhatsApp delivery reports. Each school's provider calls its own address:
Meta:   /api/v1/public/whatsapp/meta/<school_id>   (GET to verify, POST reports;
        signed with the school's app secret)
Twilio: /api/v1/public/whatsapp/twilio/<school_id> (status callback; signed with
        the school's auth token)"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import whatsapp_service

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/meta/{school_id}", response_class=PlainTextResponse)
def meta_verify(
    school_id: int,
    db: Db,
    mode: str = Query("", alias="hub.mode"),
    token: str = Query("", alias="hub.verify_token"),
    challenge: str = Query("", alias="hub.challenge"),
):
    return whatsapp_service.meta_verify(db, school_id, mode, token, challenge)


@router.post("/meta/{school_id}")
async def meta_webhook(
    school_id: int,
    request: Request,
    db: Db,
    x_hub_signature_256: Annotated[Optional[str], Header()] = None,
):
    return whatsapp_service.meta_webhook(db, school_id, await request.body(), x_hub_signature_256)


@router.post("/twilio/{school_id}")
async def twilio_webhook(
    school_id: int,
    request: Request,
    db: Db,
    x_twilio_signature: Annotated[Optional[str], Header()] = None,
):
    form = await request.form()
    return whatsapp_service.twilio_webhook(db, school_id, {k: str(v) for k, v in form.items()}, x_twilio_signature)
