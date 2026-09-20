"""Attendance beyond the daily register.

The daily register answers "was this child in school today". These answer the
three questions a school asks next: were they in *this lesson*, was the
register wrong and who says so, and what did we do about the child who keeps
not being here.

Late arrival and early departure are not tables. They are two times on the
day's existing row, because a child who came in at half nine was still marked
present that morning, and splitting that across two records is how a register
and a gate log start disagreeing about the same child.
"""
from datetime import date as date_type, datetime, time
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    AttendanceStatus,
    ContactMethod,
    CorrectionStatus,
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


class PeriodAttendance(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """Who was in one lesson.

    Separate from the daily register rather than replacing it. A secondary
    school wants both — the day's mark is what a parent is told about, and the
    lesson's mark is what finds the child who is in school but not in maths.
    Neither overwrites the other, and the daily register stays authoritative
    for anything official.
    """

    __audited__ = True
    __tablename__ = "period_attendance"
    __table_args__ = (
        UniqueConstraint(
            "student_id", "date", "period_id", name="uq_period_attendance_once"
        ),
        Index("ix_period_attendance_lookup", "school_id", "date", "period_id"),
        Index("ix_period_attendance_student", "student_id", "date"),
    )

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="CASCADE"), nullable=False
    )
    period_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("periods.id", ondelete="CASCADE"), nullable=False
    )
    class_subject_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("class_subjects.id", ondelete="SET NULL")
    )
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    status: Mapped[AttendanceStatus] = mapped_column(
        SAEnum(AttendanceStatus, name="attendance_status"), nullable=False
    )
    remark: Mapped[Optional[str]] = mapped_column(String(300))
    marked_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class AttendanceCorrection(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """Somebody says the register is wrong, and somebody else decides.

    A locked register can already be reopened, but that is a blunt instrument:
    it reopens the whole day for everyone and leaves no record of what was
    changed or why. This asks for one child on one day, keeps the before and
    after, and names both the person who asked and the person who agreed —
    which is what makes an attendance record worth anything in a dispute.
    """

    __audited__ = True
    __tablename__ = "attendance_corrections"
    __table_args__ = (
        Index("ix_corrections_pending", "school_id", "status"),
        Index("ix_corrections_student", "student_id", "date"),
    )

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    from_status: Mapped[Optional[AttendanceStatus]] = mapped_column(
        SAEnum(AttendanceStatus, name="attendance_status")
    )
    to_status: Mapped[AttendanceStatus] = mapped_column(
        SAEnum(AttendanceStatus, name="attendance_status"), nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[CorrectionStatus] = mapped_column(
        SAEnum(CorrectionStatus, name="correction_status"),
        nullable=False,
        default=CorrectionStatus.pending,
    )
    requested_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[Optional[str]] = mapped_column(String(300))


class AbsenceContact(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """A record that somebody actually rang home.

    The chronic-absence report can find the children; it cannot tell you
    whether anyone has spoken to the family, which is the only part that
    changes anything. Without this, the same child is "discovered" every month
    by whoever is looking at the report that week.
    """

    __audited__ = True
    __tablename__ = "absence_contacts"
    __table_args__ = (
        Index("ix_absence_contacts_student", "student_id", "contacted_on"),
        Index("ix_absence_contacts_school", "school_id", "contacted_on"),
    )

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    contacted_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    method: Mapped[ContactMethod] = mapped_column(
        SAEnum(ContactMethod, name="contact_method"), nullable=False
    )
    spoke_to: Mapped[Optional[str]] = mapped_column(String(120))
    note: Mapped[str] = mapped_column(Text, nullable=False)
    # What the family said would change. Free text on purpose: a dropdown of
    # outcomes would be a list of guesses about other people's lives.
    agreed_action: Mapped[Optional[str]] = mapped_column(Text)
    follow_up_on: Mapped[Optional[date_type]] = mapped_column(Date)
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
