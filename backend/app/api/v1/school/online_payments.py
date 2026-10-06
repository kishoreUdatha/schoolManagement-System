from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import FeeCounter, SchoolAdminOrAccountant, SchoolAdminUser
from app.core.enums import OnlinePaymentStatus
from app.database import get_db
from app.schemas.online_payment import GatewayCheck, GatewayRead, GatewayUpdate, OrderRead, Reconciliation
from app.services import online_payment_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/reconciliation", response_model=Reconciliation,
            summary="Gateway orders against the fees they settled")
def reconciliation(
    current_user: SchoolAdminOrAccountant,
    db: Db,
    frm: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
):
    today = date.today()
    return svc.reconciliation(db, current_user.school_id, frm or today.replace(day=1), to or today)


@router.get("/gateway", response_model=GatewayRead)
def get_gateway(current_user: SchoolAdminUser, db: Db):
    return GatewayRead.model_validate(
        svc.gateway_to_read(current_user.school_id, svc.get_gateway(db, current_user.school_id))
    )


@router.put(
    "/gateway",
    response_model=GatewayRead,
    summary="Save the school's Razorpay keys (secrets are write-only)",
)
def save_gateway(payload: GatewayUpdate, current_user: SchoolAdminUser, db: Db):
    gw = svc.save_gateway(db, current_user.tenant_id, current_user.school_id, payload)
    return GatewayRead.model_validate(svc.gateway_to_read(current_user.school_id, gw))


@router.post("/gateway/check", response_model=GatewayCheck,
             summary="Ask Razorpay whether the saved keys work (read-only)")
def check_gateway(current_user: SchoolAdminUser, db: Db):
    return svc.check_gateway(db, current_user.school_id)


@router.delete("/gateway", status_code=status.HTTP_204_NO_CONTENT)
def delete_gateway(current_user: SchoolAdminUser, db: Db):
    svc.delete_gateway(db, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/online", response_model=list[OrderRead], summary="Online fee payments")
def list_online(
    current_user: FeeCounter,
    db: Db,
    student_id: Optional[int] = Query(None),
    status_filter: Optional[OnlinePaymentStatus] = Query(None, alias="status"),
):
    return [
        OrderRead.model_validate(svc.order_to_read(db, o))
        for o in svc.list_orders(db, current_user.school_id, student_id=student_id, status_=status_filter)
    ]


@router.get("/online/{order_id}/receipt.pdf")
def receipt(order_id: int, current_user: FeeCounter, db: Db):
    pdf, filename = svc.receipt_pdf(db, svc.get_order(db, order_id, current_user.school_id))
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
