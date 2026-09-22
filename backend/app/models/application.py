"""Admission applications: the formal form, its documents, entrance
assessments and the trail of status changes."""
from datetime import date, datetime
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
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    ApplicationStatus,
    AssessmentKind,
    AssessmentStatus,
    DocumentCategory,
    Gender,
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


class AdmissionApplication(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A filled-in admission form. An enquiry may become one; admitting it
    creates the student."""

    __audited__ = True
    __tablename__ = "admission_applications"
    __table_args__ = (
        UniqueConstraint("school_id", "application_no", name="uq_application_no"),
        Index("ix_admission_applications_school_status", "school_id", "status"),
    )

    application_no: Mapped[str] = mapped_column(String(24), nullable=False)
    enquiry_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("admission_enquiries.id", ondelete="SET NULL")
    )
    academic_year_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("academic_years.id", ondelete="SET NULL")
    )
    class_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("school_classes.id", ondelete="SET NULL")
    )
    # free text when the class list isn't set up yet (public form)
    applying_for_class: Mapped[Optional[str]] = mapped_column(String(60))

    student_name: Mapped[str] = mapped_column(String(160), nullable=False)
    dob: Mapped[Optional[date]] = mapped_column(Date)
    gender: Mapped[Optional[Gender]] = mapped_column(SAEnum(Gender, name="gender"))
    previous_school: Mapped[Optional[str]] = mapped_column(String(200))
    sibling_in_school: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Asked on the form so transport can plan routes before the child starts.
    transport_required: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    category: Mapped[Optional[str]] = mapped_column(String(60))  # quota / category, school defined

    father_name: Mapped[Optional[str]] = mapped_column(String(160))
    mother_name: Mapped[Optional[str]] = mapped_column(String(160))
    guardian_name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255))
    address: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    status: Mapped[ApplicationStatus] = mapped_column(
        SAEnum(ApplicationStatus, name="application_status"), default=ApplicationStatus.draft, nullable=False
    )
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    decided_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[Optional[str]] = mapped_column(Text)

    application_fee: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    fee_paid_on: Mapped[Optional[date]] = mapped_column(Date)
    fee_receipt_no: Mapped[Optional[str]] = mapped_column(String(40))

    student_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="SET NULL")
    )
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class ApplicationDocument(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __tablename__ = "application_documents"
    __table_args__ = (Index("ix_application_documents_application", "application_id"),)

    application_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("admission_applications.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[DocumentCategory] = mapped_column(
        SAEnum(DocumentCategory, name="document_category"), nullable=False
    )
    file_key: Mapped[str] = mapped_column(String(300), nullable=False)
    file_name: Mapped[str] = mapped_column(String(200), nullable=False)
    content_type: Mapped[str] = mapped_column(String(80), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verified_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    remark: Mapped[Optional[str]] = mapped_column(String(300))
    uploaded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class AdmissionAssessment(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """An entrance test or interaction for one application."""

    __audited__ = True
    __tablename__ = "admission_assessments"
    __table_args__ = (Index("ix_admission_assessments_application", "application_id"),)

    application_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("admission_applications.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[AssessmentKind] = mapped_column(
        SAEnum(AssessmentKind, name="assessment_kind"), default=AssessmentKind.written_test, nullable=False
    )
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    venue: Mapped[Optional[str]] = mapped_column(String(200))
    assessor_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    max_marks: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2))
    marks_obtained: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2))
    status: Mapped[AssessmentStatus] = mapped_column(
        SAEnum(AssessmentStatus, name="assessment_status"), default=AssessmentStatus.scheduled, nullable=False
    )
    passed: Mapped[Optional[bool]] = mapped_column(Boolean)
    remarks: Mapped[Optional[str]] = mapped_column(Text)


class ApplicationStatusHistory(Base, PrimaryKeyMixin, _School):
    """Every status change, so the school can show how a decision was reached."""

    __tablename__ = "application_status_history"
    __table_args__ = (Index("ix_application_history_application", "application_id", "id"),)

    application_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("admission_applications.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[Optional[ApplicationStatus]] = mapped_column(
        SAEnum(ApplicationStatus, name="application_status")
    )
    to_status: Mapped[ApplicationStatus] = mapped_column(
        SAEnum(ApplicationStatus, name="application_status"), nullable=False
    )
    note: Mapped[Optional[str]] = mapped_column(String(500))
    changed_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
