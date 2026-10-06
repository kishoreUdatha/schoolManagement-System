"""The school's choices for the admission form, and the admitted student's
full admission details (see services/admission_form.py for the fields)."""
from typing import Optional

from sqlalchemy import BigInteger, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    school_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)


class AdmissionFormSetting(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Which fields are required and which are not asked. One row with no
    class is the school's default; a row per class overrides it."""

    __audited__ = True

    __tablename__ = "admission_form_settings"
    __table_args__ = (
        Index("uq_admission_form_default", "school_id", unique=True, postgresql_where=text("class_id IS NULL")),
        Index("uq_admission_form_class", "school_id", "class_id", unique=True, postgresql_where=text("class_id IS NOT NULL")),
    )

    class_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("school_classes.id", ondelete="CASCADE"))
    required: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    hidden: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)


class StudentProfile(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Everything the admission form asked beyond the student record's own
    columns: identity numbers, previous school, parents, addresses, health."""

    __audited__ = True

    __tablename__ = "student_profiles"
    __table_args__ = (Index("uq_student_profile_student", "student_id", unique=True),)

    student_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    details: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
