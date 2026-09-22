from datetime import date, datetime
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
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import SubmissionStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class Homework(Base, PrimaryKeyMixin, TimestampMixin):
    """A homework assignment posted by a teacher to a class_subject."""

    __tablename__ = "homework"
    __table_args__ = (
        Index("ix_homework_school_id", "school_id"),
        Index("ix_homework_tenant_id", "tenant_id"),
        Index("ix_homework_class_subject_id", "class_subject_id"),
        Index("ix_homework_due_date", "school_id", "due_date"),
        Index("ix_homework_created_by", "created_by_user_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    class_subject_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("class_subjects.id", ondelete="CASCADE"),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    attachment_url: Mapped[Optional[str]] = mapped_column(String(500))
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    # Scheduled publishing: children and parents see it from this day.
    # None = published when saved.
    publish_on: Mapped[Optional[date]] = mapped_column(Date)

    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    # marking scheme this work is judged on, if any
    rubric_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("rubrics.id", ondelete="SET NULL")
    )
    # closed = no more submissions or edits, whatever the due date says
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    closed_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class HomeworkSubmission(Base, PrimaryKeyMixin, TimestampMixin):
    """Story 9.3 — parent/student submits work for a homework assignment.

    One submission per (homework, student). Parents can edit while status is
    submitted; once a teacher approves/rejects, the submission is locked
    (parents can re-open by editing, which moves it back to submitted).
    """

    __tablename__ = "homework_submissions"
    __table_args__ = (
        UniqueConstraint(
            "homework_id", "student_id", name="uq_homework_submission_per_student"
        ),
        Index("ix_homework_submissions_tenant_id", "tenant_id"),
        Index("ix_homework_submissions_school_id", "school_id"),
        Index("ix_homework_submissions_homework_id", "homework_id"),
        Index("ix_homework_submissions_student_id", "student_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    homework_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("homework.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )

    submitted_by_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    attachment_url: Mapped[Optional[str]] = mapped_column(String(500))
    comment: Mapped[Optional[str]] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    status: Mapped[SubmissionStatus] = mapped_column(
        SAEnum(SubmissionStatus, name="submission_status"),
        default=SubmissionStatus.submitted,
        nullable=False,
    )
    teacher_remark: Mapped[Optional[str]] = mapped_column(Text)
    reviewed_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
