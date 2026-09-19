from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
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
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import LessonPlanStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class SyllabusChapter(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A unit/chapter of one class-subject's syllabus (classes are per year,
    so this is also per year). Planned dates drive the 'behind schedule' flag."""

    __audited__ = True
    __tablename__ = "syllabus_chapters"
    __table_args__ = (Index("ix_syllabus_chapters_cs", "class_subject_id", "sequence"),)

    class_subject_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("class_subjects.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    planned_start: Mapped[Optional[date]] = mapped_column(Date)
    planned_end: Mapped[Optional[date]] = mapped_column(Date)
    planned_periods: Mapped[Optional[int]] = mapped_column(Integer)


class SyllabusTopic(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __tablename__ = "syllabus_topics"
    __table_args__ = (Index("ix_syllabus_topics_chapter", "chapter_id", "sequence"),)

    chapter_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("syllabus_chapters.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    planned_periods: Mapped[Optional[int]] = mapped_column(Integer)


class TopicCoverage(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A topic taught in one section."""

    __tablename__ = "topic_coverage"
    __table_args__ = (
        UniqueConstraint("topic_id", "section_id", name="uq_topic_coverage_section"),
        Index("ix_topic_coverage_section", "section_id"),
    )

    topic_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("syllabus_topics.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="CASCADE"), nullable=False
    )
    covered_on: Mapped[date] = mapped_column(Date, nullable=False)
    teacher_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    lesson_plan_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("lesson_plans.id", ondelete="SET NULL")
    )
    note: Mapped[Optional[str]] = mapped_column(String(300))


class LessonPlan(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A teacher's plan for one or more periods with a section. Reviewed by the
    principal / school admin; once taught, its topics count as covered."""

    __audited__ = True
    __tablename__ = "lesson_plans"
    __table_args__ = (
        Index("ix_lesson_plans_teacher_date", "teacher_user_id", "plan_date"),
        Index("ix_lesson_plans_school_status", "school_id", "status"),
    )

    teacher_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    class_subject_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("class_subjects.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="CASCADE"), nullable=False
    )
    plan_date: Mapped[date] = mapped_column(Date, nullable=False)
    periods: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    objectives: Mapped[Optional[str]] = mapped_column(Text)
    activities: Mapped[Optional[str]] = mapped_column(Text)
    resources: Mapped[Optional[str]] = mapped_column(Text)
    assessment: Mapped[Optional[str]] = mapped_column(Text)
    homework: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[LessonPlanStatus] = mapped_column(
        SAEnum(LessonPlanStatus, name="lesson_plan_status"), default=LessonPlanStatus.draft, nullable=False
    )
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    reviewed_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    review_comment: Mapped[Optional[str]] = mapped_column(Text)
    delivered_on: Mapped[Optional[date]] = mapped_column(Date)
    delivery_note: Mapped[Optional[str]] = mapped_column(Text)


class LessonPlanTopic(Base, PrimaryKeyMixin, _School):
    __tablename__ = "lesson_plan_topics"
    __table_args__ = (UniqueConstraint("lesson_plan_id", "topic_id", name="uq_lesson_plan_topic"),)

    lesson_plan_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("lesson_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    topic_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("syllabus_topics.id", ondelete="CASCADE"), nullable=False
    )
