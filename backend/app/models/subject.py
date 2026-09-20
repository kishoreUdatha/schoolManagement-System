from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import SubjectKind
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class Subject(Base, PrimaryKeyMixin, TimestampMixin):
    """School-wide subject master (e.g. 'Mathematics' / 'MATH').

    Reused across academic years and classes. Per-class assignment lives in
    ClassSubject below.
    """

    __tablename__ = "subjects"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_subject_code_per_school"),
        UniqueConstraint("school_id", "name", name="uq_subject_name_per_school"),
        Index("ix_subjects_school_id", "school_id"),
        Index("ix_subjects_tenant_id", "tenant_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    kind: Mapped[SubjectKind] = mapped_column(
        SAEnum(SubjectKind, name="subject_kind"),
        default=SubjectKind.core,
        nullable=False,
    )
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    department_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("departments.id", ondelete="SET NULL")
    )


class ClassSubject(Base, PrimaryKeyMixin, TimestampMixin):
    """Assignment of a Subject to a SchoolClass (+ optional teacher)."""

    __tablename__ = "class_subjects"
    __table_args__ = (
        UniqueConstraint(
            "class_id", "subject_id", name="uq_class_subject_unique"
        ),
        Index("ix_class_subjects_class_id", "class_id"),
        Index("ix_class_subjects_subject_id", "subject_id"),
        Index("ix_class_subjects_teacher_user_id", "teacher_user_id"),
        Index("ix_class_subjects_tenant_id", "tenant_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    class_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("school_classes.id", ondelete="CASCADE"),
        nullable=False,
    )
    subject_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("subjects.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # Set later in Story 2.5 once teacher accounts exist
    teacher_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    # How many periods a week this subject wants. The generator needs a
    # target to aim at; without one it can only be told to fill every
    # slot, which is not a timetable, just a grid with no empty squares.
    periods_per_week: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default="0", default=0
    )
    is_optional: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    subject: Mapped[Subject] = relationship()
