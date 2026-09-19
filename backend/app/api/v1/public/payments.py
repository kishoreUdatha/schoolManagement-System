"""Razorpay webhook. In the Razorpay dashboard, point a webhook for
payment.captured / order.paid / payment.failed at
/api/v1/public/payments/razorpay/<school_id>/webhook with the same secret
saved under Finance > Online payments."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import online_payment_service


router = APIRouter()


@router.post("/razorpay/{school_id}/webhook")
async def razorpay_webhook(
    school_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    x_razorpay_signature: Annotated[Optional[str], Header()] = None,
):
    body = await request.body()
    return online_payment_service.handle_webhook(db, school_id, body, x_razorpay_signature)
