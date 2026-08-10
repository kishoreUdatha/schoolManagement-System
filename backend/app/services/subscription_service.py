from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import BillingCycle, SubscriptionStatus
from app.models.plan import Plan
from app.models.subscription import TenantSubscription
from app.models.tenant import Tenant
from app.schemas.subscription import SubscriptionAssign


def _default_expiry(start: datetime, cycle: BillingCycle) -> datetime:
    days = 365 if cycle == BillingCycle.yearly else 30
    return start + timedelta(days=days)


def assign_subscription(db: Session, tenant_id: int, data: SubscriptionAssign) -> TenantSubscription:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    plan = db.get(Plan, data.plan_id)
    if not plan or not plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found or inactive"
        )

    started_at = data.started_at or datetime.now(timezone.utc)
    expires_at = data.expires_at or _default_expiry(started_at, data.billing_cycle)

    # Expire any currently active subscription for this tenant
    active_subs = db.execute(
        select(TenantSubscription).where(
            TenantSubscription.tenant_id == tenant_id,
            TenantSubscription.status == SubscriptionStatus.active,
        )
    ).scalars().all()
    for sub in active_subs:
        sub.status = SubscriptionStatus.cancelled

    sub = TenantSubscription(
        tenant_id=tenant_id,
        plan_id=plan.id,
        billing_cycle=data.billing_cycle,
        status=SubscriptionStatus.active,
        started_at=started_at,
        expires_at=expires_at,
        notes=data.notes,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def get_current_subscription(db: Session, tenant_id: int) -> TenantSubscription | None:
    return db.execute(
        select(TenantSubscription)
        .where(TenantSubscription.tenant_id == tenant_id)
        .order_by(TenantSubscription.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
