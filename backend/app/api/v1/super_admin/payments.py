from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import SuperAdminUser
from app.database import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.payment import PaymentRead, PaymentRecord
from app.services import payment_service


router = APIRouter()


@router.post(
    "/{tenant_id}/payments",
    response_model=PaymentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Record a manual or external payment against a tenant subscription",
)
def record(
    tenant_id: int,
    payload: PaymentRecord,
    current_user: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    payment = payment_service.record_payment(
        db, tenant_id, payload, recorded_by_user_id=current_user.id
    )
    return PaymentRead.model_validate(payment)


@router.get(
    "/{tenant_id}/payments",
    response_model=PaginatedResponse[PaymentRead],
    summary="List payment history for a tenant",
)
def list_payments(
    tenant_id: int,
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    items, total = payment_service.list_payments(
        db, tenant_id, page=page, page_size=page_size
    )
    return PaginatedResponse.build(
        items=[PaymentRead.model_validate(p) for p in items],
        total=total,
        page=page,
        page_size=page_size,
    )
