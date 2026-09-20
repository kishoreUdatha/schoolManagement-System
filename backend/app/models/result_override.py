"""An override on a student's exam result.

The result itself is computed from the marks. This row exists only when the
school has decided something the marks don't say: the result is withheld, or a
child is passed by grace, or failed for malpractice. Each change bumps the
version so a corrected result is never silently swapped.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import ResultStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class ExamResultOverride(Base, PrimaryKeyMixin, TimestampMixin):
    __audited__ = True
    __tablename__ = "exam_result_overrides"
    __table_args__ = (UniqueConstraint("exam_id", "student_id", name="uq_result_override"),)

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    exam_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    result_status: Mapped[ResultStatus] = mapped_column(
        SAEnum(ResultStatus, name="result_status"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    # what parents are told while a result is withheld
    parent_note: Mapped[Optional[str]] = mapped_column(Text)
    version_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    decided_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
