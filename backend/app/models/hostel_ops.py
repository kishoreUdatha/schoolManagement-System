"""Who is actually on duty in a hostel tonight.

Hostel.warden_user_id says who is responsible for a building. It does not say
who is in it on Thursday, which is the question asked at eleven at night.
"""
from datetime import date as date_type
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Date,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import DutyShift
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class WardenDuty(Base, PrimaryKeyMixin, TimestampMixin):
    """One person, one hostel, one shift, one night."""

    __audited__ = True
    __tablename__ = "warden_duties"
    __table_args__ = (
        UniqueConstraint("hostel_id", "on_date", "shift", name="uq_warden_duty_slot"),
        Index("ix_warden_duties_school_date", "school_id", "on_date"),
        Index("ix_warden_duties_user", "user_id", "on_date"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    hostel_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("hostels.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    on_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    shift: Mapped[DutyShift] = mapped_column(
        SAEnum(DutyShift, name="duty_shift"), nullable=False
    )
    note: Mapped[Optional[str]] = mapped_column(String(200))
