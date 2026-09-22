from typing import Optional

from sqlalchemy import (
    BigInteger,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import ParentRelation
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class ParentStudent(Base, PrimaryKeyMixin, TimestampMixin):
    """Link table between a parent (User row, role=parent) and one or more students.

    A parent can be linked to multiple siblings; a student can have multiple
    parents (mother + father + guardian).
    """

    __tablename__ = "parent_students"
    __table_args__ = (
        UniqueConstraint(
            "parent_user_id", "student_id", name="uq_parent_student_pair"
        ),
        Index("ix_parent_students_parent_user_id", "parent_user_id"),
        Index("ix_parent_students_student_id", "student_id"),
        Index("ix_parent_students_tenant_id", "tenant_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    parent_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )

    relation: Mapped[ParentRelation] = mapped_column(
        SAEnum(ParentRelation, name="parent_relation"),
        default=ParentRelation.guardian,
        nullable=False,
    )


class ParentNote(Base, PrimaryKeyMixin, TimestampMixin):
    """A school-side note on a parent: a call, a visit, something to remember.

    Office staff only; the parent never sees these.
    """

    __audited__ = True
    __tablename__ = "parent_notes"
    __table_args__ = (Index("ix_parent_notes_parent", "parent_user_id"),)

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    parent_user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
