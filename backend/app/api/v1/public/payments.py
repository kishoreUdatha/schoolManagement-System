"""Razorpay webhook. In the Razorpay dashboard, point a webhook for
payment.captured / order.paid / payment.failed at
/api/v1/public/payments/razorpay/<school_id>/webhook with the same secret
saved under Finance > Online payments."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import RedirectResponse
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


@router.post("/razorpay/return", include_in_schema=False)
async def razorpay_return(request: Request, db: Annotated[Session, Depends(get_db)]):
    """Where the checkout sends the parent back after paying on a phone.

    Razorpay posts the reply here as a form and the browser follows; we settle
    the order and hand the parent to the receipt screen, so leaving for a UPI
    app no longer loses the payment.
    """
    form = await request.form()
    order_id = str(form.get("razorpay_order_id") or "")
    payment_id = str(form.get("razorpay_payment_id") or "")
    signature = str(form.get("razorpay_signature") or "")
    try:
        order = online_payment_service.settle_return(db, order_id, payment_id, signature)
        where = f"/parent/payment-status?order={order.id}"
    except HTTPException:
        where = "/parent/payment-status?failed=1"
    return RedirectResponse(where, status_code=status.HTTP_303_SEE_OTHER)
