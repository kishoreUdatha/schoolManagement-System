"""Academic foundations: enrolment history, guardians, terms, departments."""
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
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import EnrollmentOutcome, GuardianRelation
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class StudentEnrollment(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Where a student studied in each academic year. Student.section_id /
    academic_year_id / roll_no stay as the fast "current" pointer; this table
    keeps the history that promotion and transfers used to overwrite."""

    __audited__ = True

    __tablename__ = "student_enrollments"
    __table_args__ = (
        UniqueConstraint("student_id", "academic_year_id", name="uq_enrollment_student_year"),
        Index("ix_enrollments_school_year", "school_id", "academic_year_id"),
    )

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    academic_year_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("academic_years.id", ondelete="RESTRICT"), nullable=False
    )
    section_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="RESTRICT"), nullable=False
    )
    roll_no: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    outcome: Mapped[EnrollmentOutcome] = mapped_column(
        SAEnum(EnrollmentOutcome, name="enrollment_outcome"), default=EnrollmentOutcome.studying, nullable=False
    )
    notes: Mapped[Optional[str]] = mapped_column(String(300))  # e.g. "Moved from Class 5 A on 12 Aug"
    # Anything the office wants kept about a child leaving, beyond the short reason.
    exit_remarks: Mapped[Optional[str]] = mapped_column(Text)


class Guardian(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A family contact. May or may not have a parent-portal login (user_id).
    Grandparents, drivers and other authorised pickups live here too."""

    __audited__ = True

    __tablename__ = "guardians"
    __table_args__ = (
        Index("ix_guardians_school", "school_id"),
        Index("uq_guardians_user", "user_id", unique=True),
    )

    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    occupation: Mapped[Optional[str]] = mapped_column(String(120))
    address: Mapped[Optional[str]] = mapped_column(Text)
    photo_document_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("documents.id", ondelete="SET NULL")
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class StudentGuardian(Base, PrimaryKeyMixin, TimestampMixin):
    __audited__ = True

    __tablename__ = "student_guardians"
    __table_args__ = (
        UniqueConstraint("student_id", "guardian_id", name="uq_student_guardian"),
        Index("ix_student_guardians_guardian", "guardian_id"),
    )

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    guardian_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("guardians.id", ondelete="CASCADE"), nullable=False
    )
    relation: Mapped[GuardianRelation] = mapped_column(
        SAEnum(GuardianRelation, name="guardian_relation"), nullable=False
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_pickup: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_emergency_contact: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    lives_with_student: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Term(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __tablename__ = "terms"
    __table_args__ = (
        UniqueConstraint("academic_year_id", "sequence", name="uq_term_sequence"),
        Index("ix_terms_year", "academic_year_id"),
    )

    academic_year_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("academic_years.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)


class Department(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __tablename__ = "departments"
    __table_args__ = (UniqueConstraint("school_id", "code", name="uq_department_code"),)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    head_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
