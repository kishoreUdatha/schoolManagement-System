from datetime import date, datetime
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
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    CertificateKind,
    CertificateStatus,
    DocumentCategory,
    DocumentOwner,
    VerificationStatus,
)
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class Document(Base, PrimaryKeyMixin, TimestampMixin):
    """An uploaded file belonging to a student, a staff member, or the school
    itself (policies, circulars). Parents can upload for their own child; those
    arrive as `pending` until the office verifies them."""

    __audited__ = True

    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_owner", "school_id", "owner_type", "owner_id"),
        Index("ix_documents_verification", "school_id", "verification_status"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    owner_type: Mapped[DocumentOwner] = mapped_column(
        SAEnum(DocumentOwner, name="document_owner"), nullable=False
    )
    # students.id or staff.id; NULL for school-level documents.
    owner_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    category: Mapped[DocumentCategory] = mapped_column(
        SAEnum(DocumentCategory, name="document_category"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[str] = mapped_column(String(80), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    original_name: Mapped[str] = mapped_column(String(200), nullable=False)
    expires_on: Mapped[Optional[date]] = mapped_column(Date)
    visible_to_parent: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    uploaded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    verification_status: Mapped[VerificationStatus] = mapped_column(
        SAEnum(VerificationStatus, name="verification_status"),
        default=VerificationStatus.pending,
        nullable=False,
    )
    verified_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    remarks: Mapped[Optional[str]] = mapped_column(String(500))


class CertificateTemplate(Base, PrimaryKeyMixin, TimestampMixin):
    """Wording for a certificate. `body` uses {placeholders} filled at issue
    time (see certificate_service.PLACEHOLDERS)."""

    __tablename__ = "certificate_templates"
    __table_args__ = (Index("ix_certificate_templates_school", "school_id"),)

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[CertificateKind] = mapped_column(
        SAEnum(CertificateKind, name="certificate_kind"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    serial_prefix: Mapped[str] = mapped_column(String(12), nullable=False)
    parent_can_request: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class CertificateIssue(Base, PrimaryKeyMixin, TimestampMixin):
    """One certificate for one student — also the certificate register.
    The rendered text is snapshotted so later template edits don't change
    certificates already handed out."""

    __audited__ = True

    __tablename__ = "certificate_issues"
    __table_args__ = (
        UniqueConstraint("school_id", "serial_no", name="uq_certificate_serial_per_school"),
        Index("ix_certificate_issues_school", "school_id", "status"),
        Index("ix_certificate_issues_student", "student_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    template_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("certificate_templates.id", ondelete="SET NULL")
    )
    kind: Mapped[CertificateKind] = mapped_column(
        SAEnum(CertificateKind, name="certificate_kind"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[CertificateStatus] = mapped_column(
        SAEnum(CertificateStatus, name="certificate_status"), nullable=False
    )
    purpose: Mapped[Optional[str]] = mapped_column(String(300))
    # Who signs the certificate ("Principal", "Vice Principal", a name); the
    # PDF's signature line prints it. None = "Principal".
    signatory: Mapped[Optional[str]] = mapped_column(String(120))
    # Extra fields (TC: date_of_leaving, reason, conduct, ...).
    fields: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    serial_no: Mapped[Optional[str]] = mapped_column(String(40))
    title: Mapped[Optional[str]] = mapped_column(String(160))
    rendered_body: Mapped[Optional[str]] = mapped_column(Text)
    issued_on: Mapped[Optional[date]] = mapped_column(Date)
    issued_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    requested_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    remarks: Mapped[Optional[str]] = mapped_column(String(500))
    print_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class CertificateSequence(Base, PrimaryKeyMixin):
    """Per-school, per-prefix, per-year running number for serials like BON/2026/0007."""

    __tablename__ = "certificate_sequences"
    __table_args__ = (
        UniqueConstraint("school_id", "prefix", "year", name="uq_certificate_sequence"),
    )

    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    prefix: Mapped[str] = mapped_column(String(12), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    last_value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
