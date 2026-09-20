"""Late-fee (fine) rules and fee refunds."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import LateFeeBasis, MoneyMode, RefundStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class LateFeeRule(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """What to charge when a fee is paid late. Charges are raised as their own
    student fee lines under `charge_head_id`, so they report separately."""

    __audited__ = True
    __tablename__ = "late_fee_rules"
    __table_args__ = (Index("ix_late_fee_rules_school", "school_id", "is_active"),)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # which fees it applies to; empty = every head
    fee_head_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("fee_heads.id", ondelete="CASCADE")
    )
    # head the late fee itself is booked under
    charge_head_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("fee_heads.id", ondelete="RESTRICT"), nullable=False
    )
    basis: Mapped[LateFeeBasis] = mapped_column(SAEnum(LateFeeBasis, name="late_fee_basis"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    grace_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Refund(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Money given back to a parent: requested, approved, then paid out.
    Processing reduces what the student fee counts as paid."""

    __audited__ = True
    __tablename__ = "refunds"
    __table_args__ = (
        Index("ix_refunds_school_status", "school_id", "status"),
        Index("ix_refunds_student", "student_id"),
    )

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    student_fee_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("student_fees.id", ondelete="SET NULL")
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    mode: Mapped[MoneyMode] = mapped_column(SAEnum(MoneyMode, name="money_mode"), nullable=False)
    status: Mapped[RefundStatus] = mapped_column(
        SAEnum(RefundStatus, name="refund_status"), default=RefundStatus.requested, nullable=False
    )
    requested_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[Optional[str]] = mapped_column(String(500))
    processed_on: Mapped[Optional[date]] = mapped_column(Date)
    processed_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    reference: Mapped[Optional[str]] = mapped_column(String(120))
