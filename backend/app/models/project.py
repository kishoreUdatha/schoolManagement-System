from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import ProjectKind, ProjectProgressStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class Project(Base, PrimaryKeyMixin, TimestampMixin):
    """Story 10.1 — assignment of a hands-on project to a class-subject."""

    __tablename__ = "projects"
    __table_args__ = (
        Index("ix_projects_school_id", "school_id"),
        Index("ix_projects_tenant_id", "tenant_id"),
        Index("ix_projects_class_subject_id", "class_subject_id"),
        Index("ix_projects_deadline", "school_id", "deadline"),
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
    deadline: Mapped[date] = mapped_column(Date, nullable=False)
    kind: Mapped[ProjectKind] = mapped_column(
        SAEnum(ProjectKind, name="project_kind"),
        default=ProjectKind.individual,
        nullable=False,
    )

    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class ProjectProgress(Base, PrimaryKeyMixin, TimestampMixin):
    """Story 10.2 — per-student progress + teacher review for a project."""

    __tablename__ = "project_progress"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "student_id", name="uq_project_progress_per_student"
        ),
        Index("ix_project_progress_project_id", "project_id"),
        Index("ix_project_progress_student_id", "student_id"),
        Index("ix_project_progress_tenant_id", "tenant_id"),
        Index("ix_project_progress_school_id", "school_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )

    status: Mapped[ProjectProgressStatus] = mapped_column(
        SAEnum(ProjectProgressStatus, name="project_progress_status"),
        default=ProjectProgressStatus.not_started,
        nullable=False,
    )
    attachment_url: Mapped[Optional[str]] = mapped_column(String(500))
    comment: Mapped[Optional[str]] = mapped_column(Text)
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    submitted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )

    teacher_remark: Mapped[Optional[str]] = mapped_column(Text)
    rating: Mapped[Optional[int]] = mapped_column(SmallInteger)  # 0..5
    reviewed_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
