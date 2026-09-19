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
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ExamKind
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class Exam(Base, PrimaryKeyMixin, TimestampMixin):
    """A grouping of subject papers scheduled for a date range."""

    __audited__ = True
    __tablename__ = "exams"
    __table_args__ = (
        UniqueConstraint(
            "school_id", "academic_year_id", "name",
            name="uq_exam_name_per_year",
        ),
        Index("ix_exams_school_id", "school_id"),
        Index("ix_exams_tenant_id", "tenant_id"),
        Index("ix_exams_academic_year_id", "academic_year_id"),
        Index("ix_exams_dates", "school_id", "start_date", "end_date"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    academic_year_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("academic_years.id", ondelete="RESTRICT"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[ExamKind] = mapped_column(
        SAEnum(ExamKind, name="exam_kind"), default=ExamKind.term, nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    term_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("terms.id", ondelete="SET NULL")
    )

    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )

    papers: Mapped[list["ExamSubject"]] = relationship(
        back_populates="exam", cascade="all, delete-orphan"
    )


class ExamSubject(Base, PrimaryKeyMixin, TimestampMixin):
    """A single subject paper within an exam: class_subject + max marks + date."""

    __tablename__ = "exam_subjects"
    __table_args__ = (
        UniqueConstraint(
            "exam_id", "class_subject_id",
            name="uq_exam_paper_per_class_subject",
        ),
        Index("ix_exam_subjects_school_id", "school_id"),
        Index("ix_exam_subjects_tenant_id", "tenant_id"),
        Index("ix_exam_subjects_exam_id", "exam_id"),
        Index("ix_exam_subjects_class_subject_id", "class_subject_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    exam_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False
    )
    class_subject_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("class_subjects.id", ondelete="RESTRICT"),
        nullable=False,
    )

    max_marks: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    pass_marks: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    exam_date: Mapped[date] = mapped_column(Date, nullable=False)
    duration_minutes: Mapped[Optional[int]] = mapped_column(SmallInteger)

    exam: Mapped[Exam] = relationship(back_populates="papers")
