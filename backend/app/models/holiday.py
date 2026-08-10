from datetime import date
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Date,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import HolidayType
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class Holiday(Base, PrimaryKeyMixin, TimestampMixin):
    """A school holiday.

    Single-day: start_date == end_date.
    Multi-day (vacation): use a range. The whole range is excluded from attendance.
    """

    __tablename__ = "holidays"
    __table_args__ = (
        Index("ix_holidays_school_id", "school_id"),
        Index("ix_holidays_tenant_id", "tenant_id"),
        Index("ix_holidays_dates", "school_id", "start_date", "end_date"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    type: Mapped[HolidayType] = mapped_column(
        SAEnum(HolidayType, name="holiday_type"),
        default=HolidayType.school,
        nullable=False,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
