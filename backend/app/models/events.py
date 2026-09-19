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
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import ConsentResponse, EventAudience, EventKind, PtmSlotStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class _Audience:
    audience: Mapped[EventAudience] = mapped_column(
        SAEnum(EventAudience, name="event_audience"), default=EventAudience.everyone, nullable=False
    )
    class_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("school_classes.id", ondelete="CASCADE")
    )
    section_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="CASCADE")
    )


class SchoolEvent(Base, PrimaryKeyMixin, TimestampMixin, _School, _Audience):
    """A calendar event. Drafts are only visible to the school admin; publishing
    notifies the audience. Trips and similar can ask parents for consent."""

    __audited__ = True
    __tablename__ = "school_events"
    __table_args__ = (Index("ix_school_events_school_dates", "school_id", "start_date", "end_date"),)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[EventKind] = mapped_column(SAEnum(EventKind, name="event_kind"), nullable=False)
    # School-local date/time (like holidays and PTM slots). No start_time = all day.
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[Optional[time]] = mapped_column(Time)
    end_time: Mapped[Optional[time]] = mapped_column(Time)
    venue: Mapped[Optional[str]] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text)
    requires_consent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    consent_deadline: Mapped[Optional[date]] = mapped_column(Date)
    # Informational only (e.g. trip cost); billing stays in the fees module.
    fee_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class EventConsent(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A parent's yes/no for one child. The latest answer wins."""

    __tablename__ = "event_consents"
    __table_args__ = (UniqueConstraint("event_id", "student_id", name="uq_event_consent_student"),)

    event_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("school_events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    parent_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    response: Mapped[ConsentResponse] = mapped_column(
        SAEnum(ConsentResponse, name="consent_response"), nullable=False
    )
    note: Mapped[Optional[str]] = mapped_column(String(300))
    responded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PtmSession(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A parent-teacher meeting day. Each participating teacher gets a row of
    fixed-length slots; parents book one slot per teacher per child."""

    __audited__ = True
    __tablename__ = "ptm_sessions"
    __table_args__ = (Index("ix_ptm_sessions_school_date", "school_id", "meeting_date"),)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    meeting_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    slot_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    venue: Mapped[Optional[str]] = mapped_column(String(200))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    # Which parents may book: neither set = whole school.
    class_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("school_classes.id", ondelete="CASCADE")
    )
    section_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="CASCADE")
    )
    booking_closes_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class PtmSlot(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __tablename__ = "ptm_slots"
    __table_args__ = (
        UniqueConstraint("session_id", "teacher_user_id", "start_time", name="uq_ptm_slot_time"),
        Index(
            "uq_ptm_slot_teacher_student",
            "session_id",
            "teacher_user_id",
            "student_id",
            unique=True,
            postgresql_where=text("student_id IS NOT NULL"),
        ),
    )

    session_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ptm_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    teacher_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    status: Mapped[PtmSlotStatus] = mapped_column(
        SAEnum(PtmSlotStatus, name="ptm_slot_status"), default=PtmSlotStatus.open, nullable=False
    )
    student_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="SET NULL")
    )
    parent_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    booked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    parent_note: Mapped[Optional[str]] = mapped_column(String(300))
    # Written by the teacher after the meeting; shared with the parent.
    teacher_notes: Mapped[Optional[str]] = mapped_column(Text)


class GalleryAlbum(Base, PrimaryKeyMixin, TimestampMixin, _School, _Audience):
    __audited__ = True
    __tablename__ = "gallery_albums"
    __table_args__ = (Index("ix_gallery_albums_school", "school_id", "album_date"),)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    album_date: Mapped[date] = mapped_column(Date, nullable=False)
    event_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("school_events.id", ondelete="SET NULL")
    )
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class GalleryPhoto(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __tablename__ = "gallery_photos"

    album_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("gallery_albums.id", ondelete="CASCADE"), nullable=False, index=True
    )
    file_key: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[str] = mapped_column(String(80), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    caption: Mapped[Optional[str]] = mapped_column(String(300))
    uploaded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
