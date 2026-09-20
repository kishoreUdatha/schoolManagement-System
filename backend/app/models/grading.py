"""Configurable grade scales, exam types and report card settings."""
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class GradeScale(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A set of grade bands (e.g. CBSE A1..E). One scale per school is the
    default; an exam may pin a different one."""

    __audited__ = True
    __tablename__ = "grade_scales"
    __table_args__ = (UniqueConstraint("school_id", "name", name="uq_grade_scale_name"),)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    bands: Mapped[list["GradeBand"]] = relationship(
        back_populates="scale", cascade="all, delete-orphan", order_by="GradeBand.min_percent.desc()"
    )


class GradeBand(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __tablename__ = "grade_bands"
    __table_args__ = (
        UniqueConstraint("scale_id", "grade", name="uq_grade_band_grade"),
        Index("ix_grade_bands_scale", "scale_id", "min_percent"),
    )

    scale_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("grade_scales.id", ondelete="CASCADE"), nullable=False
    )
    grade: Mapped[str] = mapped_column(String(8), nullable=False)
    min_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    max_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    # grade points for a GPA-style report card
    points: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2))
    remark: Mapped[Optional[str]] = mapped_column(String(120))
    is_pass: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    scale: Mapped[GradeScale] = relationship(back_populates="bands")


class ExamType(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """School-defined exam type (Unit test, Half yearly, ...) with the weight
    it contributes to the term total."""

    __audited__ = True
    __tablename__ = "exam_types"
    __table_args__ = (UniqueConstraint("school_id", "code", name="uq_exam_type_code"),)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    weight_percent: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ReportCardSetting(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """One row per school: what goes on the printed report card."""

    __tablename__ = "report_card_settings"
    __table_args__ = (UniqueConstraint("school_id", name="uq_report_card_setting_school"),)

    show_attendance: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_rank: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    show_grade_scale: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_remarks: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # results must be approved by the principal / admin before publishing
    require_result_approval: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    principal_name: Mapped[Optional[str]] = mapped_column(String(120))
    footer_note: Mapped[Optional[str]] = mapped_column(Text)


class ReportCardRemark(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Class teacher / principal remarks for one student on one exam."""

    __tablename__ = "report_card_remarks"
    __table_args__ = (UniqueConstraint("exam_id", "student_id", name="uq_report_card_remark"),)

    exam_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    teacher_remark: Mapped[Optional[str]] = mapped_column(Text)
    principal_remark: Mapped[Optional[str]] = mapped_column(Text)
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
