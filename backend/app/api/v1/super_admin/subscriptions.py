from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import SuperAdminUser
from app.database import get_db
from app.schemas.subscription import SubscriptionAssign, SubscriptionRead
from app.services import subscription_service


router = APIRouter()


@router.post(
    "/{tenant_id}/subscription",
    response_model=SubscriptionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Assign a plan to a tenant (creates a new subscription; cancels previous active)",
)
def assign(
    tenant_id: int,
    payload: SubscriptionAssign,
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    sub = subscription_service.assign_subscription(db, tenant_id, payload)
    return SubscriptionRead.model_validate(sub)


@router.get(
    "/{tenant_id}/subscription",
    response_model=SubscriptionRead,
    summary="Get current (latest) subscription for a tenant",
)
def current(
    tenant_id: int,
    _: SuperAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    sub = subscription_service.get_current_subscription(db, tenant_id)
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No subscription assigned for this tenant",
        )
    return SubscriptionRead.model_validate(sub)
