"""Timetable cover (substitutions, teacher unavailability) and student leave."""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import StudentLeaveKind, StudentLeaveStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class Substitution(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Cover for one timetable slot on one date. substitute_user_id empty =
    the slot is known to need cover but nobody is assigned yet (or it's a
    supervised free period — see note)."""

    __audited__ = True
    __tablename__ = "substitutions"
    __table_args__ = (
        UniqueConstraint("timetable_entry_id", "sub_date", name="uq_substitution_entry_date"),
        Index("ix_substitutions_school_date", "school_id", "sub_date"),
        Index("ix_substitutions_substitute_date", "substitute_user_id", "sub_date"),
    )

    sub_date: Mapped[date] = mapped_column(Date, nullable=False)
    timetable_entry_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("timetable_entries.id", ondelete="CASCADE"), nullable=False
    )
    # snapshot of the slot so history survives timetable edits
    section_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="CASCADE"), nullable=False
    )
    period_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("periods.id", ondelete="CASCADE"), nullable=False
    )
    class_subject_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("class_subjects.id", ondelete="CASCADE"), nullable=False
    )
    absent_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    substitute_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    note: Mapped[Optional[str]] = mapped_column(String(300))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class TeacherUnavailability(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A recurring weekly block when a teacher can't take cover (e.g. exam
    duty, coordinator time). period_number empty = the whole day."""

    __tablename__ = "teacher_unavailability"
    __table_args__ = (
        UniqueConstraint("user_id", "day_of_week", "period_number", name="uq_teacher_unavailability"),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # ISO 1=Mon..7=Sun
    period_number: Mapped[Optional[int]] = mapped_column(SmallInteger)
    reason: Mapped[Optional[str]] = mapped_column(String(200))


class StudentLeave(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A parent's leave application for their child; the class teacher or
    school admin decides. Approved days show on the attendance register."""

    __audited__ = True
    __tablename__ = "student_leaves"
    __table_args__ = (
        Index("ix_student_leaves_student_dates", "student_id", "from_date", "to_date"),
        Index("ix_student_leaves_school_status", "school_id", "status"),
    )

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="CASCADE"), nullable=False
    )
    applied_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    kind: Mapped[StudentLeaveKind] = mapped_column(SAEnum(StudentLeaveKind, name="student_leave_kind"), nullable=False)
    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[StudentLeaveStatus] = mapped_column(
        SAEnum(StudentLeaveStatus, name="student_leave_status"), default=StudentLeaveStatus.pending, nullable=False
    )
    decided_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[Optional[str]] = mapped_column(String(500))
