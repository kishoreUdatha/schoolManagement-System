from datetime import date, time
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Date,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AttendanceStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class StudentAttendance(Base, PrimaryKeyMixin, TimestampMixin):
    """One row per (student, date). Marked by class teacher daily."""

    __audited__ = True
    __tablename__ = "student_attendance"
    __table_args__ = (
        UniqueConstraint("student_id", "date", name="uq_student_attendance_per_day"),
        Index("ix_student_attendance_school_id", "school_id"),
        Index("ix_student_attendance_tenant_id", "tenant_id"),
        Index("ix_student_attendance_section_date", "section_id", "date"),
        Index("ix_student_attendance_student_id", "student_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    # Denormalised for fast section-day queries (matches student.section_id at mark time)
    section_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="CASCADE"), nullable=False
    )

    date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[AttendanceStatus] = mapped_column(
        SAEnum(AttendanceStatus, name="attendance_status"), nullable=False
    )
    remark: Mapped[Optional[str]] = mapped_column(String(300))
    # A child who arrived at half nine was still present that morning, so
    # the time sits on the day's row rather than in a table of its own —
    # two records of one arrival is how a register and a gate log start
    # disagreeing about the same child.
    arrived_at: Mapped[Optional[time]] = mapped_column(Time)
    left_at: Mapped[Optional[time]] = mapped_column(Time)
    marked_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
