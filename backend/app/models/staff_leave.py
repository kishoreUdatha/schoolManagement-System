from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import StaffLeaveKind, StaffLeaveStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class StaffLeave(Base, PrimaryKeyMixin, TimestampMixin):
    """Story 8.2 — Leave request filed by an employee, decided by school admin
    or principal. On approval, the leave_service marks staff_attendance rows
    for each date in the range as `on_leave`."""

    __tablename__ = "staff_leaves"
    __table_args__ = (
        Index("ix_staff_leaves_tenant_id", "tenant_id"),
        Index("ix_staff_leaves_school_id", "school_id"),
        Index("ix_staff_leaves_applicant", "applicant_user_id"),
        Index("ix_staff_leaves_status", "school_id", "status"),
        Index("ix_staff_leaves_dates", "school_id", "from_date", "to_date"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    applicant_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    kind: Mapped[StaffLeaveKind] = mapped_column(
        SAEnum(StaffLeaveKind, name="staff_leave_kind"), nullable=False
    )
    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text)

    status: Mapped[StaffLeaveStatus] = mapped_column(
        SAEnum(StaffLeaveStatus, name="staff_leave_status"),
        default=StaffLeaveStatus.pending,
        nullable=False,
    )
    decided_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decision_remark: Mapped[Optional[str]] = mapped_column(Text)
    decided_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
