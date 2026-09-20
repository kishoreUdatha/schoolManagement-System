"""Rooms, labs and lab bookings."""
from datetime import date
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import BookingStatus, RoomKind
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class Room(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Any space in the school: classroom, lab, hall, office."""

    __audited__ = True
    __tablename__ = "rooms"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_room_code"),
        Index("ix_rooms_school_kind", "school_id", "kind"),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    kind: Mapped[RoomKind] = mapped_column(SAEnum(RoomKind, name="room_kind"), default=RoomKind.classroom, nullable=False)
    capacity: Mapped[Optional[int]] = mapped_column(Integer)
    building: Mapped[Optional[str]] = mapped_column(String(80))
    floor: Mapped[Optional[str]] = mapped_column(String(40))
    branch_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("branches.id", ondelete="SET NULL")
    )
    # the class that normally sits here, if any
    section_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="SET NULL")
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Lab(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A bookable lab, in a room, usually tied to a subject."""

    __audited__ = True
    __tablename__ = "labs"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_lab_code"),
        Index("ix_labs_school", "school_id", "is_active"),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    room_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("rooms.id", ondelete="SET NULL")
    )
    subject_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("subjects.id", ondelete="SET NULL")
    )
    in_charge_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    capacity: Mapped[Optional[int]] = mapped_column(Integer)
    equipment: Mapped[Optional[str]] = mapped_column(Text)
    safety_notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class LabBooking(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """One lab, one date, one period. A lab can't be booked twice for the
    same period, and neither can the class."""

    __audited__ = True
    __tablename__ = "lab_bookings"
    __table_args__ = (
        Index(
            "uq_lab_booking_slot", "lab_id", "booking_date", "period_id",
            unique=True, postgresql_where=text("status <> 'cancelled'"),
        ),
        Index("ix_lab_bookings_date", "school_id", "booking_date"),
        Index("ix_lab_bookings_teacher", "teacher_user_id", "booking_date"),
    )

    lab_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("labs.id", ondelete="CASCADE"), nullable=False
    )
    booking_date: Mapped[date] = mapped_column(Date, nullable=False)
    period_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("periods.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="SET NULL")
    )
    class_subject_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("class_subjects.id", ondelete="SET NULL")
    )
    teacher_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    purpose: Mapped[Optional[str]] = mapped_column(String(300))
    students: Mapped[Optional[int]] = mapped_column(Integer)
    status: Mapped[BookingStatus] = mapped_column(
        SAEnum(BookingStatus, name="booking_status"), default=BookingStatus.booked, nullable=False
    )
    cancel_reason: Mapped[Optional[str]] = mapped_column(String(300))
