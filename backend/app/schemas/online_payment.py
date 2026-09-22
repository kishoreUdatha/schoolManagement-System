from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.core.enums import OnlinePaymentStatus


class GatewayUpdate(BaseModel):
    key_id: str = Field(..., min_length=8, max_length=64, pattern=r"^rzp_(test|live)_\w+$")
    # Omit to keep the stored secret (the API never returns it).
    key_secret: Optional[str] = Field(None, min_length=8, max_length=128)
    webhook_secret: Optional[str] = Field(None, min_length=6, max_length=128)
    is_enabled: bool = True


class GatewayRead(BaseModel):
    configured: bool
    provider: str = "razorpay"
    key_id: Optional[str] = None
    mode: Optional[str] = None  # test | live
    has_webhook_secret: bool = False
    is_enabled: bool = False
    webhook_url_path: str
    test_mode_available: bool  # dev-only simulated checkout when not configured


class GatewayCheck(BaseModel):
    connected: bool
    message: str
    checked_at: datetime


class PayRequest(BaseModel):
    fee_ids: list[int] = Field(..., min_length=1, max_length=50)


class CheckoutRead(BaseModel):
    order_id: int
    provider: str
    provider_order_id: str
    key_id: Optional[str] = None
    amount: Decimal
    amount_paise: int
    currency: str
    school_name: str
    description: str
    prefill_name: Optional[str] = None
    prefill_email: Optional[str] = None
    prefill_contact: Optional[str] = None


class VerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class OrderItemRead(BaseModel):
    student_fee_id: int
    fee_head_name: str
    period: str
    amount: Decimal
    applied_amount: Decimal


class OrderRead(BaseModel):
    id: int
    student_id: int
    student_name: str
    parent_name: Optional[str] = None
    amount: Decimal
    currency: str
    provider: str
    provider_order_id: str
    provider_payment_id: Optional[str] = None
    status: OnlinePaymentStatus
    receipt_no: Optional[str] = None
    paid_at: Optional[datetime] = None
    failure_reason: Optional[str] = None
    excess_amount: Decimal
    created_at: datetime
    items: list[OrderItemRead]


class ReconRow(BaseModel):
    order_id: int
    provider_order_id: str
    provider_payment_id: Optional[str] = None
    student_id: int
    student_name: Optional[str] = None
    amount: Decimal
    applied: Decimal
    difference: Decimal
    excess: Optional[Decimal] = None
    paid_at: Optional[datetime] = None
    receipt_no: Optional[str] = None


class Reconciliation(BaseModel):
    """What the gateway says against what the school banked."""

    from_date: date
    to_date: date
    orders: int
    settled: int
    settled_amount: Decimal
    abandoned: int
    failed: int
    unapplied: list[ReconRow]
    unapplied_amount: Decimal
    excess: list[ReconRow]
    excess_amount: Decimal
    clean: bool
