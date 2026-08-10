from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.subscription import SubscriptionPayment, TenantSubscription
from app.models.tenant import Tenant
from app.schemas.payment import PaymentRecord
from app.services.subscription_service import get_current_subscription


def record_payment(
    db: Session,
    tenant_id: int,
    data: PaymentRecord,
    recorded_by_user_id: Optional[int],
) -> SubscriptionPayment:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    if data.subscription_id:
        sub = db.get(TenantSubscription, data.subscription_id)
        if not sub or sub.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found for this tenant",
            )
    else:
        sub = get_current_subscription(db, tenant_id)
        if not sub:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tenant has no subscription; assign a plan before recording payment",
            )

    payment = SubscriptionPayment(
        subscription_id=sub.id,
        tenant_id=tenant_id,
        amount=data.amount,
        currency=data.currency,
        mode=data.mode,
        status=data.status,
        paid_at=data.paid_at or datetime.now(timezone.utc),
        reference=data.reference,
        notes=data.notes,
        recorded_by_user_id=recorded_by_user_id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


def list_payments(
    db: Session, tenant_id: int, *, page: int = 1, page_size: int = 50
) -> tuple[list[SubscriptionPayment], int]:
    base = select(SubscriptionPayment).where(SubscriptionPayment.tenant_id == tenant_id)
    count_base = select(func.count(SubscriptionPayment.id)).where(
        SubscriptionPayment.tenant_id == tenant_id
    )
    total = db.execute(count_base).scalar_one()
    items = (
        db.execute(
            base.order_by(SubscriptionPayment.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return list(items), total
