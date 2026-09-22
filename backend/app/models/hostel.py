from datetime import date, datetime, time
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
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    ComplaintStatus,
    HostelAttendanceStatus,
    HostelKind,
    MealKind,
    OutingKind,
    OutingStatus,
    RollCallSession,
)
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class Hostel(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __tablename__ = "hostels"
    __table_args__ = (Index("ix_hostels_school", "school_id"),)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[HostelKind] = mapped_column(SAEnum(HostelKind, name="hostel_kind"), nullable=False)
    warden_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    address: Mapped[Optional[str]] = mapped_column(String(300))
    monthly_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    curfew: Mapped[Optional[str]] = mapped_column(String(5))  # HH:MM, for late-return flags
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class HostelRoom(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "hostel_rooms"
    __table_args__ = (UniqueConstraint("hostel_id", "room_no", name="uq_hostel_room_no"),)

    hostel_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("hostels.id", ondelete="CASCADE"), nullable=False
    )
    room_no: Mapped[str] = mapped_column(String(20), nullable=False)
    floor: Mapped[Optional[str]] = mapped_column(String(20))
    room_type: Mapped[Optional[str]] = mapped_column(String(40))  # AC, non-AC, dorm…
    monthly_fee: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))  # overrides hostel fee
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class HostelBed(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "hostel_beds"
    __table_args__ = (UniqueConstraint("room_id", "label", name="uq_hostel_bed_label"),)

    room_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("hostel_rooms.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(10), nullable=False)  # A, B, C…
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class HostelAllocation(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A student in a bed. One open allocation per student and per bed."""

    __audited__ = True

    __tablename__ = "hostel_allocations"
    __table_args__ = (
        Index("uq_hostel_alloc_student_open", "student_id", unique=True, postgresql_where=text("end_date IS NULL")),
        Index("uq_hostel_alloc_bed_open", "bed_id", unique=True, postgresql_where=text("end_date IS NULL")),
        Index("ix_hostel_alloc_school", "school_id"),
    )

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    bed_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("hostel_beds.id", ondelete="RESTRICT"), nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[date]] = mapped_column(Date)


class HostelAttendance(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "hostel_attendance"
    __table_args__ = (
        UniqueConstraint("student_id", "date", "session", name="uq_hostel_attendance"),
        Index("ix_hostel_attendance_hostel_date", "hostel_id", "date"),
    )

    hostel_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("hostels.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    session: Mapped[RollCallSession] = mapped_column(
        SAEnum(RollCallSession, name="hostel_roll_call_session"), nullable=False
    )
    status: Mapped[HostelAttendanceStatus] = mapped_column(
        SAEnum(HostelAttendanceStatus, name="hostel_attendance_status"), nullable=False
    )
    # When a present resident checked in, whether that was late, and a note.
    checked_in_at: Mapped[Optional[time]] = mapped_column(Time)
    is_late: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    remark: Mapped[Optional[str]] = mapped_column(String(300))
    marked_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class HostelOuting(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __audited__ = True

    __tablename__ = "hostel_outings"
    __table_args__ = (Index("ix_hostel_outings_school_status", "school_id", "status"),)

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[OutingKind] = mapped_column(SAEnum(OutingKind, name="hostel_outing_kind"), nullable=False)
    leave_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    return_by: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str] = mapped_column(String(300), nullable=False)
    escort_name: Mapped[Optional[str]] = mapped_column(String(160))
    status: Mapped[OutingStatus] = mapped_column(SAEnum(OutingStatus, name="hostel_outing_status"), nullable=False)
    requested_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decision_note: Mapped[Optional[str]] = mapped_column(String(300))
    went_out_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    returned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class MessMenu(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "hostel_mess_menu"
    __table_args__ = (UniqueConstraint("hostel_id", "day_of_week", "meal", name="uq_mess_menu_slot"),)

    hostel_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("hostels.id", ondelete="CASCADE"), nullable=False
    )
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0 = Monday
    meal: Mapped[MealKind] = mapped_column(SAEnum(MealKind, name="mess_meal"), nullable=False)
    items: Mapped[str] = mapped_column(String(500), nullable=False)


class HostelComplaint(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __tablename__ = "hostel_complaints"
    __table_args__ = (Index("ix_hostel_complaints_hostel", "hostel_id", "status"),)

    hostel_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("hostels.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="SET NULL")
    )
    category: Mapped[str] = mapped_column(String(40), nullable=False)  # maintenance, food, cleanliness…
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ComplaintStatus] = mapped_column(
        SAEnum(ComplaintStatus, name="complaint_status"), default=ComplaintStatus.open, nullable=False
    )
    raised_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    resolution: Mapped[Optional[str]] = mapped_column(Text)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
