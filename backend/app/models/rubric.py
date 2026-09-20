"""Marking rubrics: the criteria a piece of work is judged on, and the marks a
teacher gave a submission against them."""
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
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class Rubric(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A reusable marking scheme — "Essay, Class 7" — made of criteria."""

    __audited__ = True
    __tablename__ = "rubrics"
    __table_args__ = (
        UniqueConstraint("school_id", "name", name="uq_rubric_name"),
        Index("ix_rubrics_school_active", "school_id", "is_active"),
    )

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    subject_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("subjects.id", ondelete="SET NULL")
    )
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class RubricCriterion(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __tablename__ = "rubric_criteria"
    __table_args__ = (Index("ix_rubric_criteria_rubric", "rubric_id", "sequence"),)

    rubric_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rubrics.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    max_points: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class RubricScore(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """What one submission scored on one criterion."""

    __tablename__ = "rubric_scores"
    __table_args__ = (
        UniqueConstraint("submission_id", "criterion_id", name="uq_rubric_score"),
        Index("ix_rubric_scores_submission", "submission_id"),
    )

    submission_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("homework_submissions.id", ondelete="CASCADE"), nullable=False
    )
    criterion_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rubric_criteria.id", ondelete="CASCADE"), nullable=False
    )
    points: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(String(500))
    scored_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
