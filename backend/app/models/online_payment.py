from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import OnlinePaymentStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class SchoolPaymentGateway(Base, PrimaryKeyMixin, TimestampMixin):
    """A school's own Razorpay account. Fees settle directly to the school.
    Secrets are stored encrypted (app.core.crypto) and never returned by the API."""

    __tablename__ = "school_payment_gateways"

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    provider: Mapped[str] = mapped_column(String(20), default="razorpay", nullable=False)
    key_id: Mapped[str] = mapped_column(String(64), nullable=False)
    key_secret_enc: Mapped[str] = mapped_column(Text, nullable=False)
    webhook_secret_enc: Mapped[Optional[str]] = mapped_column(Text)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class FeePaymentOrder(Base, PrimaryKeyMixin, TimestampMixin):
    """One online checkout by a parent covering one or more fee lines."""

    __audited__ = True

    __tablename__ = "fee_payment_orders"
    __table_args__ = (
        Index("ix_fee_payment_orders_school", "school_id", "status"),
        Index("ix_fee_payment_orders_student", "student_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    parent_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="INR", nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)  # razorpay | mock
    provider_order_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    provider_payment_id: Mapped[Optional[str]] = mapped_column(String(64))
    status: Mapped[OnlinePaymentStatus] = mapped_column(
        SAEnum(OnlinePaymentStatus, name="online_payment_status"),
        default=OnlinePaymentStatus.created,
        nullable=False,
    )
    receipt_no: Mapped[Optional[str]] = mapped_column(String(40), unique=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    failure_reason: Mapped[Optional[str]] = mapped_column(String(300))
    # Money received beyond what was still due (e.g. the same fee paid twice
    # from two tabs). Kept visible so the school can refund it.
    excess_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)


class FeePaymentOrderItem(Base, PrimaryKeyMixin):
    __tablename__ = "fee_payment_order_items"
    __table_args__ = (Index("ix_fee_payment_order_items_order", "order_id"),)

    order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("fee_payment_orders.id", ondelete="CASCADE"), nullable=False
    )
    student_fee_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("student_fees.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    applied_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
