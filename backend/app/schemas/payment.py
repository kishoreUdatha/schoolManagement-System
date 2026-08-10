from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import PaymentMode, PaymentStatus


class PaymentRecord(BaseModel):
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(default="INR", max_length=8)
    mode: PaymentMode = PaymentMode.manual
    status: PaymentStatus = PaymentStatus.success
    paid_at: Optional[datetime] = Field(
        None, description="Defaults to now if omitted"
    )
    reference: Optional[str] = Field(
        None, max_length=120, description="Bank txn id, cheque no, UPI ref, etc."
    )
    subscription_id: Optional[int] = Field(
        None,
        description="Defaults to tenant's current active subscription if omitted",
    )
    notes: Optional[str] = Field(None, max_length=500)


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    subscription_id: int
    tenant_id: int
    amount: Decimal
    currency: str
    mode: PaymentMode
    status: PaymentStatus
    paid_at: Optional[datetime] = None
    reference: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    recorded_by_user_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
