"""What a school teaches, beyond the list of subjects.

app/models/subject.py holds the subject master and its per-class assignment.
This holds the three things a school says about that list: which subjects go
together, what the whole programme is meant to be in a given year, and what
happens outside it.

None of this is a precondition for teaching. A school with no curriculum row
still has classes, subjects and timetables; the curriculum records the
intention, and the timetable records what actually happens. They are allowed
to disagree — that disagreement is often the useful fact.
"""
from datetime import date as date_type, time
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    Enum as SAEnum,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import ActivityKind, CurriculumStatus
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


class SubjectGroup(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """A set of subjects that belong together — "Sciences", "Third language".

    A group is a way of talking about subjects, not a thing a child is
    enrolled in. Putting a subject in a group changes nothing about the
    subject, and removing it changes nothing either; that is deliberate,
    because a grouping is an editorial decision and should never be able to
    damage the master list it describes.
    """

    __audited__ = True
    __tablename__ = "subject_groups"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_subject_group_code_per_school"),
        UniqueConstraint("school_id", "name", name="uq_subject_group_name_per_school"),
        Index("ix_subject_groups_school", "school_id"),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(300))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class SubjectGroupMember(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """One subject's membership of one group.

    `is_elective` says whether a child picks this one from the group or takes
    it along with the rest — the difference between "choose one of three
    languages" and "Sciences means all three".
    """

    __tablename__ = "subject_group_members"
    __table_args__ = (
        UniqueConstraint("group_id", "subject_id", name="uq_subject_once_per_group"),
        Index("ix_group_members_group", "group_id"),
        Index("ix_group_members_subject", "subject_id"),
    )

    group_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("subject_groups.id", ondelete="CASCADE"), nullable=False
    )
    # RESTRICT, not CASCADE: deleting a subject that a group still names
    # should be refused rather than quietly shrinking the group.
    subject_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False
    )
    is_elective: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Curriculum(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """The programme a class is meant to follow in a year, and whose it is.

    Only one may be active for a given year and class. Two active curricula
    for one class is a question nobody in the building can answer, so
    activating a second retires the first rather than leaving somebody to
    notice. Retired ones stay readable: what a class was supposed to be
    taught two years ago is a real question, usually asked by an inspector.
    """

    __audited__ = True
    __tablename__ = "curricula"
    __table_args__ = (
        Index("ix_curricula_school_year", "school_id", "academic_year_id"),
        Index("ix_curricula_class", "class_id"),
        Index("ix_curricula_status", "school_id", "status"),
    )

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    # Free text rather than an enum: boards differ by country and a school
    # that follows a local syllabus has a name for it that no list contains.
    board: Mapped[Optional[str]] = mapped_column(String(80))
    academic_year_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("academic_years.id", ondelete="CASCADE"), nullable=False
    )
    # Null means it spans the whole school rather than one class.
    class_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("school_classes.id", ondelete="CASCADE")
    )
    status: Mapped[CurriculumStatus] = mapped_column(
        SAEnum(CurriculumStatus, name="curriculum_status"),
        nullable=False,
        default=CurriculumStatus.draft,
    )
    effective_from: Mapped[Optional[date_type]] = mapped_column(Date)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class CurriculumSubject(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """One subject inside a curriculum, and how much of the week it wants.

    This is the intention. ClassSubject.periods_per_week is what the timetable
    generator actually aims at, and the two are kept apart on purpose: a
    curriculum saying six periods of maths while the timetable gives four is
    exactly the gap a head of department wants to see, not a contradiction to
    be resolved by overwriting one with the other.
    """

    __tablename__ = "curriculum_subjects"
    __table_args__ = (
        UniqueConstraint(
            "curriculum_id", "subject_id", name="uq_subject_once_per_curriculum"
        ),
        Index("ix_curriculum_subjects_curriculum", "curriculum_id"),
    )

    curriculum_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("curricula.id", ondelete="CASCADE"), nullable=False
    )
    subject_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False
    )
    periods_per_week: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0
    )
    is_core: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Activity(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """A club, a team, a choir — what happens outside the timetable.

    Capacity is optional because most clubs do not have one, and a default of
    thirty would be a number somebody invented rather than a rule the school
    set. Where it is set, the service refuses to exceed it.
    """

    __audited__ = True
    __tablename__ = "activities"
    __table_args__ = (
        UniqueConstraint("school_id", "name", name="uq_activity_name_per_school"),
        Index("ix_activities_school_active", "school_id", "is_active"),
    )

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    kind: Mapped[ActivityKind] = mapped_column(
        SAEnum(ActivityKind, name="activity_kind"),
        nullable=False,
        default=ActivityKind.club,
    )
    description: Mapped[Optional[str]] = mapped_column(Text)
    in_charge_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    # Null day means it does not meet on a fixed day — a team that plays
    # whenever there is a fixture, rather than a club that meets on Tuesdays.
    day_of_week: Mapped[Optional[int]] = mapped_column(SmallInteger)
    start_time: Mapped[Optional[time]] = mapped_column(Time)
    end_time: Mapped[Optional[time]] = mapped_column(Time)
    venue: Mapped[Optional[str]] = mapped_column(String(160))
    capacity: Mapped[Optional[int]] = mapped_column(SmallInteger)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ActivityMember(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """A child's membership, open while `left_on` is null.

    Leaving is recorded rather than deleted, so a child who was in the choir
    last year still was. The partial unique index means one open membership
    per child per activity while allowing them to rejoin later.
    """

    __tablename__ = "activity_members"
    __table_args__ = (
        Index(
            "uq_activity_member_open",
            "activity_id",
            "student_id",
            unique=True,
            postgresql_where=text("left_on IS NULL"),
        ),
        Index("ix_activity_members_activity", "activity_id"),
        Index("ix_activity_members_student", "student_id"),
    )

    activity_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("activities.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    joined_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    left_on: Mapped[Optional[date_type]] = mapped_column(Date)
    # Free text: captain, secretary, first violin. A dropdown here would be a
    # guess about what every club in the school calls its own jobs.
    role: Mapped[Optional[str]] = mapped_column(String(80))
