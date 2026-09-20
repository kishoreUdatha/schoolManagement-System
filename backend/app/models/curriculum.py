"""Learning outcomes for a class-subject, and the teaching resource library."""
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import BloomLevel, ResourceKind
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class LearningOutcome(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """What a child should be able to do by the end of a chapter. Mapped to the
    topics that teach it, so coverage follows from what has been taught."""

    __audited__ = True
    __tablename__ = "learning_outcomes"
    __table_args__ = (
        UniqueConstraint("class_subject_id", "code", name="uq_learning_outcome_code"),
        Index("ix_learning_outcomes_cs", "class_subject_id", "sequence"),
    )

    class_subject_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("class_subjects.id", ondelete="CASCADE"), nullable=False
    )
    chapter_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("syllabus_chapters.id", ondelete="SET NULL")
    )
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    bloom_level: Mapped[Optional[BloomLevel]] = mapped_column(SAEnum(BloomLevel, name="bloom_level"))
    sequence: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class OutcomeTopic(Base, PrimaryKeyMixin, _School):
    """Which topics teach an outcome."""

    __tablename__ = "outcome_topics"
    __table_args__ = (UniqueConstraint("outcome_id", "topic_id", name="uq_outcome_topic"),)

    outcome_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("learning_outcomes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    topic_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("syllabus_topics.id", ondelete="CASCADE"), nullable=False, index=True
    )


class TeachingResource(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A file or link a teacher keeps against a class-subject — worksheets,
    slides, reference links. Can be shared with parents."""

    __audited__ = True
    __tablename__ = "teaching_resources"
    __table_args__ = (
        Index("ix_teaching_resources_cs", "class_subject_id", "is_active"),
        Index("ix_teaching_resources_school", "school_id", "is_active"),
    )

    class_subject_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("class_subjects.id", ondelete="CASCADE"), nullable=False
    )
    chapter_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("syllabus_chapters.id", ondelete="SET NULL")
    )
    topic_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("syllabus_topics.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    kind: Mapped[ResourceKind] = mapped_column(
        SAEnum(ResourceKind, name="resource_kind"), default=ResourceKind.document, nullable=False
    )
    # either a link ...
    url: Mapped[Optional[str]] = mapped_column(String(600))
    # ... or an uploaded file
    file_key: Mapped[Optional[str]] = mapped_column(String(300))
    file_name: Mapped[Optional[str]] = mapped_column(String(200))
    content_type: Mapped[Optional[str]] = mapped_column(String(100))
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer)
    visible_to_parents: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    downloads: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    uploaded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
