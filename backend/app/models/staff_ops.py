"""What a school keeps about a member of staff beyond their contact details:
what they are qualified to do, what was seen when somebody sat in on a lesson,
and what has to be handed back when they leave.

Workload is deliberately absent from this file. It is not a fact anybody
records — it is the timetable, counted — so storing it would mean a second
number to keep in step with the first, and the two would disagree the day
somebody moves a lesson.
"""
from datetime import date as date_type, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
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

from app.core.enums import ClearanceArea, ExitClearanceStatus
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


class StaffQualification(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """A degree, certificate or training a member of staff holds.

    Separate rows rather than a text field on the staff record, because a
    school is periodically asked to prove that the person teaching physics is
    qualified to — and answering that from a paragraph somebody typed means
    reading it.

    `document_id` points at the uploaded certificate in the existing document
    store rather than at a file of its own. A qualification and its scan are
    the same fact, and one place to verify a document is enough.
    """

    __audited__ = True
    __tablename__ = "staff_qualifications"
    __table_args__ = (
        Index("ix_staff_quals_staff", "staff_id"),
        Index("ix_staff_quals_school", "school_id"),
    )

    staff_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False
    )
    qualification: Mapped[str] = mapped_column(String(120), nullable=False)
    institution: Mapped[Optional[str]] = mapped_column(String(200))
    year_awarded: Mapped[Optional[int]] = mapped_column(SmallInteger)
    subject_area: Mapped[Optional[str]] = mapped_column(String(120))
    document_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("documents.id", ondelete="SET NULL")
    )
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    verified_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class ClassroomObservation(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """What somebody saw when they sat in on a lesson.

    There is no score here, and there should not be. This codebase already
    refuses to reduce a teacher to a number — see teacher_activity in
    analytics_service — for the reason that a single ranked figure gets used
    as an appraisal it cannot support, by people who were not in the room.

    So an observation holds three things instead: what was being looked at,
    what was strong, and what to try next. Those are the sentences a teacher
    can act on, and the ones a head can defend. A five-point scale would be
    easier to sort and worth nothing to either of them.

    `shared_with_staff` is false by default: a note written during a lesson is
    a draft until the observer has spoken to the person about it.
    """

    __audited__ = True
    __tablename__ = "classroom_observations"
    __table_args__ = (
        Index("ix_observations_staff", "staff_id", "observed_on"),
        Index("ix_observations_school", "school_id", "observed_on"),
    )

    staff_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False
    )
    observed_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    observer_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    class_subject_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("class_subjects.id", ondelete="SET NULL")
    )
    section_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="SET NULL")
    )
    focus: Mapped[Optional[str]] = mapped_column(String(200))
    strengths: Mapped[Optional[str]] = mapped_column(Text)
    next_steps: Mapped[Optional[str]] = mapped_column(Text)
    follow_up_on: Mapped[Optional[date_type]] = mapped_column(Date)
    shared_with_staff: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )


class ExitClearance(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """A member of staff leaving, and the list of people who have to sign off.

    Deactivating an account already works and is not replaced by this. What
    was missing is the bit that happens before: the laptop, the library books,
    the keys, the final salary. Deactivating without those is how a school
    discovers six months later that nobody asked for the store-room key back.
    """

    __audited__ = True
    __tablename__ = "exit_clearances"
    __table_args__ = (
        Index("ix_exit_clearance_staff", "staff_id"),
        Index("ix_exit_clearance_school", "school_id", "status"),
    )

    staff_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False
    )
    last_working_day: Mapped[Optional[date_type]] = mapped_column(Date)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[ExitClearanceStatus] = mapped_column(
        SAEnum(ExitClearanceStatus, name="exit_clearance_status"),
        nullable=False,
        default=ExitClearanceStatus.in_progress,
        server_default=ExitClearanceStatus.in_progress.value,
    )
    initiated_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class ExitClearanceItem(Base, PrimaryKeyMixin, TimestampMixin):
    """One department's sign-off on somebody leaving.

    Hangs off the clearance rather than off the staff member, so cancelling a
    resignation takes its checklist with it and a half-finished list cannot
    outlive the departure it belonged to.
    """

    __tablename__ = "exit_clearance_items"
    __table_args__ = (
        UniqueConstraint("clearance_id", "area", name="uq_clearance_area_once"),
        Index("ix_clearance_items_clearance", "clearance_id"),
    )

    clearance_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("exit_clearances.id", ondelete="CASCADE"), nullable=False
    )
    area: Mapped[ClearanceArea] = mapped_column(
        SAEnum(ClearanceArea, name="clearance_area"), nullable=False
    )
    is_cleared: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    cleared_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    cleared_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    note: Mapped[Optional[str]] = mapped_column(String(300))
