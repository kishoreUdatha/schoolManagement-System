from datetime import time
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class Period(Base, PrimaryKeyMixin, TimestampMixin):
    """School-wide period schedule.

    A period is one slot in the day (e.g. Mon period 1 = 08:30-09:15).
    Sections share the same period grid; only assignments differ per section.
    """

    __tablename__ = "periods"
    __table_args__ = (
        UniqueConstraint(
            "school_id", "day_of_week", "period_number",
            name="uq_period_school_day_num",
        ),
        Index("ix_periods_school_id", "school_id"),
        Index("ix_periods_tenant_id", "tenant_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )

    day_of_week: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, comment="1=Mon ... 7=Sun (ISO)"
    )
    period_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    label: Mapped[Optional[str]] = mapped_column(
        String(60), comment="e.g. 'Period 1' or 'Lunch break'"
    )
    is_break: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class TimetableEntry(Base, PrimaryKeyMixin, TimestampMixin):
    """Assignment of a class_subject (and its teacher) to a (section, period) slot.

    Absence of an entry = free period for that section. Entries are visible to
    parents/teachers only when the section's timetable_published_at is set.
    """

    __tablename__ = "timetable_entries"
    __table_args__ = (
        UniqueConstraint(
            "section_id", "period_id", name="uq_timetable_section_period"
        ),
        Index("ix_timetable_entries_section_id", "section_id"),
        Index("ix_timetable_entries_period_id", "period_id"),
        Index("ix_timetable_entries_class_subject_id", "class_subject_id"),
        Index("ix_timetable_entries_tenant_id", "tenant_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="CASCADE"), nullable=False
    )
    period_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("periods.id", ondelete="CASCADE"), nullable=False
    )
    class_subject_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("class_subjects.id", ondelete="CASCADE"),
        nullable=False,
    )
    notes: Mapped[Optional[str]] = mapped_column(String(200))


class HodAssignment(Base, PrimaryKeyMixin, TimestampMixin):
    """A teacher acting as Head of Department for a section.

    A teacher with at least one row here is an HOD: they can create, edit and
    publish the timetable of each assigned section. School admins and
    principals manage every section and need no rows here.
    """

    __tablename__ = "hod_assignments"
    __table_args__ = (
        UniqueConstraint(
            "teacher_user_id", "section_id", name="uq_hod_teacher_section"
        ),
        Index("ix_hod_assignments_teacher_user_id", "teacher_user_id"),
        Index("ix_hod_assignments_section_id", "section_id"),
        Index("ix_hod_assignments_school_id", "school_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    teacher_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="CASCADE"), nullable=False
    )
