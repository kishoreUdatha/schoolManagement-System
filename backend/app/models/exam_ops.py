"""Running an exam, as opposed to setting one up.

app/models/exam.py says what is being examined and out of how many marks.
This says where each child sits, who watches them, and — where a subject is
assessed in parts rather than by one paper — how those parts add up.

The split is deliberate. An exam can be created, marked and published without
a single row in this file; a school that does not allocate halls is not a
school with a broken exam. Everything here is an optional layer over the exam
rather than a precondition for one.
"""
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    """Every row here belongs to one school, like everything else."""

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class ExamSubjectComponent(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """One assessed part of a paper — theory, practical, internal, viva.

    A paper without components is marked as a whole, which is how most of
    them work and how every existing paper already behaves. Adding components
    does not change that: the paper still carries the total the child scored,
    and the components record how that total was arrived at. Nothing that
    reads a mark needs to know whether components exist.
    """

    __audited__ = True
    __tablename__ = "exam_subject_components"
    __table_args__ = (
        UniqueConstraint("exam_subject_id", "name", name="uq_component_name_per_paper"),
        Index("ix_components_paper", "exam_subject_id"),
        Index("ix_components_school_id", "school_id"),
    )

    exam_subject_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("exam_subjects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    max_marks: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # 0 means the component has no pass mark of its own — only the paper total
    # has to clear. A practical a child may fail while still passing the
    # subject is a real arrangement, and so is the opposite.
    pass_marks: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    sequence: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)


class MarkComponent(Base, PrimaryKeyMixin, TimestampMixin):
    """What a child scored in one part of a paper.

    Hangs off the mark rather than off the student, so deleting a mark takes
    its parts with it and the paper total can never outlive the figures it
    was added up from.
    """

    __tablename__ = "mark_components"
    __table_args__ = (
        UniqueConstraint("mark_id", "component_id", name="uq_component_per_mark"),
        Index("ix_mark_components_mark", "mark_id"),
    )

    mark_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("marks.id", ondelete="CASCADE"), nullable=False
    )
    component_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("exam_subject_components.id", ondelete="CASCADE"), nullable=False
    )
    marks_obtained: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)


class ExamRoomAllocation(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """Which room a child sits in for one paper.

    One row per child per paper, rather than a range per room. Ranges are
    tidier to write and useless to read: the question actually asked is
    "where does this child go", once per child, on the admit card.
    """

    __audited__ = True
    __tablename__ = "exam_room_allocations"
    __table_args__ = (
        UniqueConstraint("exam_subject_id", "student_id", name="uq_one_seat_per_paper"),
        Index("ix_allocations_paper_room", "exam_subject_id", "room_id"),
        Index("ix_allocations_student", "student_id"),
        Index("ix_allocations_school_id", "school_id"),
    )

    exam_subject_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("exam_subjects.id", ondelete="CASCADE"), nullable=False
    )
    room_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )


class Invigilation(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """Who is watching one room during one paper.

    A room can have more than one invigilator and one of them may be marked
    chief, which is who the office rings when something goes wrong.
    """

    __audited__ = True
    __tablename__ = "invigilations"
    __table_args__ = (
        UniqueConstraint(
            "exam_subject_id", "room_id", "user_id", name="uq_invigilator_per_room_paper"
        ),
        Index("ix_invigilations_paper", "exam_subject_id"),
        Index("ix_invigilations_user", "user_id"),
        Index("ix_invigilations_school_id", "school_id"),
    )

    exam_subject_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("exam_subjects.id", ondelete="CASCADE"), nullable=False
    )
    room_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    is_chief: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
