from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class LearningVideo(Base, PrimaryKeyMixin, TimestampMixin):
    """YouTube learning video posted by a teacher for a class+subject."""

    __tablename__ = "learning_videos"
    __table_args__ = (
        Index("ix_lv_school_id", "school_id"),
        Index("ix_lv_tenant_id", "tenant_id"),
        Index("ix_lv_class_subject_id", "class_subject_id"),
        Index("ix_lv_teacher_user_id", "teacher_user_id"),
        Index("ix_lv_active", "school_id", "is_active"),
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
    teacher_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    youtube_video_id: Mapped[str] = mapped_column(String(20), nullable=False)
    youtube_url: Mapped[str] = mapped_column(String(500), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class LearningVideoCompletion(Base, PrimaryKeyMixin, TimestampMixin):
    """Story 15.2 — one row per (video, student). Marks the student as having
    watched the video. Parent or student marks it; teacher reads the roster."""

    __tablename__ = "learning_video_completions"
    __table_args__ = (
        UniqueConstraint(
            "video_id", "student_id", name="uq_video_completion_per_student"
        ),
        Index("ix_lvc_tenant_id", "tenant_id"),
        Index("ix_lvc_school_id", "school_id"),
        Index("ix_lvc_video_id", "video_id"),
        Index("ix_lvc_student_id", "student_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    video_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("learning_videos.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    marked_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    marked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
