from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import MarkStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class Mark(Base, PrimaryKeyMixin, TimestampMixin):
    """A single student's mark for one exam paper.

    status:
      - scored: marks_obtained populated, grade + is_pass computed
      - absent: marks_obtained=0, grade=None, is_pass=False
      - exempt: marks_obtained=None, grade=None, is_pass=None (excluded from totals)
    """

    __audited__ = True

    __tablename__ = "marks"
    __table_args__ = (
        UniqueConstraint(
            "exam_subject_id", "student_id",
            name="uq_mark_per_paper_student",
        ),
        Index("ix_marks_school_id", "school_id"),
        Index("ix_marks_tenant_id", "tenant_id"),
        Index("ix_marks_exam_subject_id", "exam_subject_id"),
        Index("ix_marks_student_id", "student_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    exam_subject_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("exam_subjects.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )

    status: Mapped[MarkStatus] = mapped_column(
        SAEnum(MarkStatus, name="mark_status"),
        default=MarkStatus.scored,
        nullable=False,
    )
    marks_obtained: Mapped[Optional[int]] = mapped_column(SmallInteger)
    grade: Mapped[Optional[str]] = mapped_column(String(4))
    is_pass: Mapped[Optional[bool]] = mapped_column(Boolean)
    remark: Mapped[Optional[str]] = mapped_column(String(300))

    marked_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    marked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
