from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.core.scoping import require_linked_child
from app.database import get_db
from app.models.online_payment import FeePaymentOrder
from app.schemas.online_payment import CheckoutRead, OrderRead, PayRequest, VerifyRequest
from app.services import online_payment_service as svc
from app.services.parent_services_service import year_range


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class FailureReport(BaseModel):
    reason: str = Field("Cancelled by user", max_length=300)


@router.post(
    "/{student_id}/fees/pay",
    response_model=CheckoutRead,
    summary="Start an online payment for selected pending fees",
)
def start_payment(student_id: int, payload: PayRequest, current_user: ParentUser, db: Db):
    return CheckoutRead.model_validate(svc.create_order(db, current_user, student_id, payload.fee_ids))


@router.post(
    "/{student_id}/fees/pay/verify",
    response_model=OrderRead,
    summary="Confirm a completed checkout (Razorpay signature check)",
)
def verify_payment(student_id: int, payload: VerifyRequest, current_user: ParentUser, db: Db):
    o = svc.verify(db, current_user, student_id, payload)
    return OrderRead.model_validate(svc.order_to_read(db, o))


@router.get(
    "/{student_id}/fees/pay/{order_id}",
    response_model=OrderRead,
    summary="Has this payment landed yet? (the app asks after returning from a UPI app)",
)
def order_status(student_id: int, order_id: int, current_user: ParentUser, db: Db):
    o = svc.get_parent_order(db, current_user.id, student_id, order_id)
    return OrderRead.model_validate(svc.order_to_read(db, o))


@router.post("/{student_id}/fees/pay/{order_id}/failed", response_model=OrderRead)
def report_failure(
    student_id: int, order_id: int, payload: FailureReport, current_user: ParentUser, db: Db
):
    o = svc.mark_failed(db, current_user, student_id, order_id, payload.reason)
    return OrderRead.model_validate(svc.order_to_read(db, o))


@router.get("/{student_id}/payments", response_model=list[OrderRead])
def payment_history(
    student_id: int, current_user: ParentUser, db: Db, academic_year_id: Optional[int] = None
):
    student = require_linked_child(db, current_user.id, student_id)
    stmt = select(FeePaymentOrder).where(FeePaymentOrder.student_id == student_id)
    # An academic year filters by when the payment was started.
    rng = year_range(db, student.school_id, academic_year_id)
    if rng:
        stmt = stmt.where(
            func.date(FeePaymentOrder.created_at) >= rng[0],
            func.date(FeePaymentOrder.created_at) <= rng[1],
        )
    orders = db.execute(stmt.order_by(FeePaymentOrder.created_at.desc())).scalars()
    return [OrderRead.model_validate(svc.order_to_read(db, o)) for o in orders]


@router.get("/{student_id}/payments/{order_id}/receipt.pdf")
def receipt(student_id: int, order_id: int, current_user: ParentUser, db: Db):
    pdf, filename = svc.receipt_pdf(db, svc.get_parent_order(db, current_user.id, student_id, order_id))
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
