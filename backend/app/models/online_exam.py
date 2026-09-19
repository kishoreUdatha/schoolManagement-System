from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    AttemptStatus,
    BloomLevel,
    Difficulty,
    OnlineTestStatus,
    QuestionKind,
    ResultVisibility,
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


class Question(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A reusable question in the school's bank, tagged by subject, class level,
    syllabus chapter, Bloom's level and difficulty.

    options: [{"key": "A", "text": "..."}]; answer: {"keys": ["A"]} for choice
    kinds, {"value": 3.14, "tolerance": 0.01} for numeric, {} for short."""

    __audited__ = True
    __tablename__ = "questions"
    __table_args__ = (
        Index("ix_questions_school_subject", "school_id", "subject_id"),
        Index("ix_questions_school_bloom", "school_id", "bloom_level"),
    )

    subject_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False
    )
    # Class *name* level (e.g. "Class 6") so the bank survives year roll-over.
    class_level: Mapped[Optional[str]] = mapped_column(String(60))
    chapter_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("syllabus_chapters.id", ondelete="SET NULL")
    )
    topic: Mapped[Optional[str]] = mapped_column(String(200))
    kind: Mapped[QuestionKind] = mapped_column(SAEnum(QuestionKind, name="question_kind"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    answer: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    explanation: Mapped[Optional[str]] = mapped_column(Text)
    marks: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=1, nullable=False)
    bloom_level: Mapped[BloomLevel] = mapped_column(SAEnum(BloomLevel, name="bloom_level"), nullable=False)
    difficulty: Mapped[Difficulty] = mapped_column(SAEnum(Difficulty, name="difficulty"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class OnlineTest(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A timed test for one class-subject (optionally one section)."""

    __audited__ = True
    __tablename__ = "online_tests"
    __table_args__ = (Index("ix_online_tests_cs", "class_subject_id", "starts_at"),)

    class_subject_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("class_subjects.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    instructions: Mapped[Optional[str]] = mapped_column(Text)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    shuffle_questions: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    shuffle_options: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Fraction of a question's marks deducted for a wrong objective answer (0 = none).
    negative_marking: Mapped[Decimal] = mapped_column(Numeric(4, 2), default=0, nullable=False)
    result_visibility: Mapped[ResultVisibility] = mapped_column(
        SAEnum(ResultVisibility, name="result_visibility"), default=ResultVisibility.after_close, nullable=False
    )
    status: Mapped[OnlineTestStatus] = mapped_column(
        SAEnum(OnlineTestStatus, name="online_test_status"), default=OnlineTestStatus.draft, nullable=False
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class OnlineTestQuestion(Base, PrimaryKeyMixin, _School):
    __tablename__ = "online_test_questions"
    __table_args__ = (UniqueConstraint("test_id", "question_id", name="uq_online_test_question"),)

    test_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("online_tests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    marks: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)


class TestAttempt(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """One student's sitting. Taken through the parent portal for now."""

    __tablename__ = "test_attempts"
    __table_args__ = (UniqueConstraint("test_id", "student_id", name="uq_test_attempt_student"),)

    test_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("online_tests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    started_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    auto_submitted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[AttemptStatus] = mapped_column(
        SAEnum(AttemptStatus, name="attempt_status"), default=AttemptStatus.in_progress, nullable=False
    )
    # [question_id, ...] in the order this student sees them, and per-question option order.
    question_order: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    option_order: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    score: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2))
    max_score: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)


class AttemptAnswer(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __tablename__ = "attempt_answers"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id", name="uq_attempt_answer"),)

    attempt_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("test_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False
    )
    # {"keys": [...]} | {"value": n} | {"text": "..."}
    response: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    is_correct: Mapped[Optional[bool]] = mapped_column(Boolean)
    marks_awarded: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2))
    teacher_comment: Mapped[Optional[str]] = mapped_column(String(500))
