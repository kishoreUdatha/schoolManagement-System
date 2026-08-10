from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import StaffAttendanceStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class StaffAttendance(Base, PrimaryKeyMixin, TimestampMixin):
    """One row per (user, date) for staff (teacher + non-teaching)."""

    __tablename__ = "staff_attendance"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_staff_attendance_per_day"),
        Index("ix_staff_attendance_school_id", "school_id"),
        Index("ix_staff_attendance_tenant_id", "tenant_id"),
        Index("ix_staff_attendance_user_date", "user_id", "date"),
        Index("ix_staff_attendance_date", "school_id", "date"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    date: Mapped[date] = mapped_column(Date, nullable=False)
    check_in_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    check_out_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    status: Mapped[StaffAttendanceStatus] = mapped_column(
        SAEnum(StaffAttendanceStatus, name="staff_attendance_status"),
        nullable=False,
    )

    manually_overridden: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    override_remark: Mapped[Optional[str]] = mapped_column(String(300))
    override_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
