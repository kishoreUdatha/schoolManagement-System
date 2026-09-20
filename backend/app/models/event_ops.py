"""Who actually went on the trip.

app/models/events.py records consent: a parent saying their child may go.
This records attendance: whether the child got on the coach. They are not the
same fact and must not share a column.

A consent form is a promise made a fortnight ago. A register is what a
teacher counts at the coach door, and it is the document anybody asks for
when a child cannot be found — which is why it is written separately, at the
time, by a named person.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    """Every row here belongs to one school, like everything else."""

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class EventAttendance(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """One child, one event, present or not.

    `attended` is deliberately a plain boolean rather than a status enum. At
    the coach door there are two answers, and a longer list would invite
    somebody to record "probably" about a child who is not there.

    There is no consent field here and no attendance field on EventConsent.
    A child whose parent consented and who did not board is the row that
    matters most, and it can only exist if the two are kept apart.
    """

    __audited__ = True
    __tablename__ = "event_attendance"
    __table_args__ = (
        UniqueConstraint("event_id", "student_id", name="uq_event_attendance_once"),
        Index("ix_event_attendance_event", "event_id"),
        Index("ix_event_attendance_student", "student_id"),
    )

    event_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("school_events.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    attended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    note: Mapped[Optional[str]] = mapped_column(String(300))
    # Who counted, and when. A register with no name on it is a rumour.
    marked_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    marked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
