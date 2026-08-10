from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import FeeReminderKind
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class FeeReminderLog(Base, PrimaryKeyMixin, TimestampMixin):
    """Story 13.3 — One row per (student_fee, kind, send_date).

    The unique constraint guarantees the scheduler can re-run any number of
    times in a day without double-sending the same reminder.
    """

    __tablename__ = "fee_reminder_logs"
    __table_args__ = (
        UniqueConstraint(
            "student_fee_id", "kind", "send_date",
            name="uq_fee_reminder_per_day",
        ),
        Index("ix_fee_reminder_tenant_id", "tenant_id"),
        Index("ix_fee_reminder_school_id", "school_id"),
        Index("ix_fee_reminder_student_fee_id", "student_fee_id"),
        Index("ix_fee_reminder_send_date", "school_id", "send_date"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    student_fee_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("student_fees.id", ondelete="CASCADE"), nullable=False
    )

    kind: Mapped[FeeReminderKind] = mapped_column(
        SAEnum(FeeReminderKind, name="fee_reminder_kind"), nullable=False
    )
    send_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # Whichever Notice carried the message; null if dispatch failed
    notice_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("notices.id", ondelete="SET NULL")
    )
