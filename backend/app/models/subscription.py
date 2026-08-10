from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Enum as SAEnum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import BillingCycle, PaymentMode, PaymentStatus, SubscriptionStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class TenantSubscription(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenant_subscriptions"

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False
    )
    billing_cycle: Mapped[BillingCycle] = mapped_column(
        SAEnum(BillingCycle, name="billing_cycle"), default=BillingCycle.monthly, nullable=False
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        SAEnum(SubscriptionStatus, name="subscription_status"),
        default=SubscriptionStatus.pending,
        nullable=False,
        index=True,
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    razorpay_subscription_id: Mapped[Optional[str]] = mapped_column(String(80))
    notes: Mapped[Optional[str]] = mapped_column(String(500))

    payments: Mapped[list["SubscriptionPayment"]] = relationship(
        back_populates="subscription", cascade="all, delete-orphan"
    )


class SubscriptionPayment(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "subscription_payments"

    subscription_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenant_subscriptions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="INR", nullable=False)
    mode: Mapped[PaymentMode] = mapped_column(
        SAEnum(PaymentMode, name="payment_mode"), nullable=False
    )
    status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(PaymentStatus, name="payment_status"),
        default=PaymentStatus.pending,
        nullable=False,
    )
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    razorpay_payment_id: Mapped[Optional[str]] = mapped_column(String(80))
    razorpay_order_id: Mapped[Optional[str]] = mapped_column(String(80))
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    notes: Mapped[Optional[str]] = mapped_column(String(500))

    subscription: Mapped[TenantSubscription] = relationship(back_populates="payments")
