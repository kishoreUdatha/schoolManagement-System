"""Attendance sessions (lock / reopen) and the visitor master record."""
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
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import RegisterStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class AttendanceSession(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """One class register for one day. Locking it stops further edits even
    inside the normal edit window; the office can reopen it with a reason."""

    __audited__ = True
    __tablename__ = "attendance_sessions"
    __table_args__ = (
        UniqueConstraint("section_id", "date", name="uq_attendance_session"),
        Index("ix_attendance_sessions_school_date", "school_id", "date"),
    )

    section_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[RegisterStatus] = mapped_column(
        SAEnum(RegisterStatus, name="register_status"), default=RegisterStatus.open, nullable=False
    )
    marked_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    marked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    locked_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    reopened_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    reopened_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    reopen_reason: Mapped[Optional[str]] = mapped_column(String(500))
    # counts at the moment it was locked, so reports don't have to recount
    present: Mapped[Optional[int]] = mapped_column(Integer)
    absent: Mapped[Optional[int]] = mapped_column(Integer)


class Visitor(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A person who visits the school, kept once so repeat visits are visible
    and someone can be barred at the gate."""

    __audited__ = True
    __tablename__ = "visitors"
    __table_args__ = (
        UniqueConstraint("school_id", "phone", name="uq_visitor_phone"),
        Index("ix_visitors_school_name", "school_id", "full_name"),
    )

    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255))
    company: Mapped[Optional[str]] = mapped_column(String(160))
    id_type: Mapped[Optional[str]] = mapped_column(String(40))
    id_last4: Mapped[Optional[str]] = mapped_column(String(4))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    blocked_reason: Mapped[Optional[str]] = mapped_column(String(500))
    blocked_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    blocked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
