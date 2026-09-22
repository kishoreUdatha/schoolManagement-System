from datetime import date, datetime, time
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
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
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
    exam_type_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("exam_types.id", ondelete="SET NULL")
    )
    # pin a grade scale; empty = the school's default
    grade_scale_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("grade_scales.id", ondelete="SET NULL")
    )
    results_approved_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    results_approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # marks entry is open by default and closed when the school has them all in
    marks_open: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    marks_closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # a published result set that had to be corrected and issued again
    revision_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    revised_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    revision_reason: Mapped[Optional[str]] = mapped_column(String(500))
    revised_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    # The classes that sit this exam (ids of school_classes) and the day the
    # school means to announce results. Both are the plan; papers remain
    # what is actually set, class by class.
    class_ids: Mapped[Optional[list]] = mapped_column(JSONB)
    result_date: Mapped[Optional[date]] = mapped_column(Date)

    # What families are told before the exam: reporting time, what to
    # bring. Shown on the parent's exam schedule under the papers.
    instructions: Mapped[Optional[str]] = mapped_column(Text)

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
    # A datesheet without times cannot say whether two papers clash, and an
    # admit card without one tells a child to turn up on the right day and
    # guess the hour. Nullable, because every existing paper predates it.
    start_time: Mapped[Optional[time]] = mapped_column(Time)
    duration_minutes: Mapped[Optional[int]] = mapped_column(SmallInteger)
    # The portion this paper covers ("Ch. 1-5"), as the datesheet prints it.
    syllabus: Mapped[Optional[str]] = mapped_column(String(500))
    # a second pair of eyes on this paper's marks before results go out
    marks_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    marks_verified_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    marks_verified_count: Mapped[Optional[int]] = mapped_column(Integer)

    exam: Mapped[Exam] = relationship(back_populates="papers")
