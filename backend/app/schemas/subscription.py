from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import BillingCycle, SubscriptionStatus


class SubscriptionAssign(BaseModel):
    plan_id: int
    billing_cycle: BillingCycle = BillingCycle.monthly
    started_at: Optional[datetime] = Field(
        None, description="Defaults to now if omitted"
    )
    expires_at: Optional[datetime] = Field(
        None,
        description="Computed from billing_cycle if omitted (now + 30 days monthly / 365 days yearly)",
    )
    notes: Optional[str] = Field(None, max_length=500)


class SubscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    plan_id: int
    billing_cycle: BillingCycle
    status: SubscriptionStatus
    started_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    razorpay_subscription_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
