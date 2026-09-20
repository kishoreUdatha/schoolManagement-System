"""What the school did about a child's wellbeing, as opposed to what it knows.

app/models/health.py holds the standing facts — allergies, conditions, the
doctor's number. app/models/pastoral.py holds cases and incidents. This holds
the acts: a dose given, a cut cleaned, an appointment kept, a phone rung.

Two of these are evidence rather than data, and the models say so where it
matters. A medication register is produced when a parent asks why their child
was given something, and a counsellor's own notes are the reason a child
talks at all. Both are built to survive the day somebody wants them changed.
"""
from datetime import date as date_type, datetime, time
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AppointmentStatus, FirstAidOutcome
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


class MedicationAdministration(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """One dose, actually given, to one child.

    This is a legal record, not a note. It is what the school produces when a
    parent asks why their child was given something, and it is only worth
    producing if it cannot have been quietly tidied up afterwards. So a row
    here is never edited and never deleted: a mistake is corrected by writing
    a second row that points back at the first through `corrects_id`, and the
    original is marked `superseded_at` so a reader can see both what was
    written at the time and what the school later said was true.

    The service enforces that. There is no update path and no delete route —
    if either existed, the register would be worth exactly as much as the
    word of whoever last had access to it.
    """

    __audited__ = True
    __tablename__ = "medication_administrations"
    __table_args__ = (
        Index("ix_medication_student", "student_id", "given_on"),
        Index("ix_medication_school_day", "school_id", "given_on"),
    )

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    given_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    given_at: Mapped[time] = mapped_column(Time, nullable=False)
    medicine: Mapped[str] = mapped_column(String(200), nullable=False)
    dose: Mapped[str] = mapped_column(String(120), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String(300))
    given_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    parent_informed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # A correction is a new row, not an edit. Both stay readable.
    corrects_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("medication_administrations.id", ondelete="SET NULL")
    )
    correction_reason: Mapped[Optional[str]] = mapped_column(String(300))
    superseded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class FirstAidLog(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """A cut, a bump, a faint — and what was done about it.

    Either a child or a member of staff: adults are hurt at work too, and a
    school that only logs children ends up with no record of the caretaker who
    fell off a ladder.
    """

    __audited__ = True
    __tablename__ = "first_aid_logs"
    __table_args__ = (
        Index("ix_first_aid_school_day", "school_id", "happened_on"),
        Index("ix_first_aid_student", "student_id"),
    )

    student_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE")
    )
    staff_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    happened_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    happened_at: Mapped[time] = mapped_column(Time, nullable=False)
    place: Mapped[Optional[str]] = mapped_column(String(160))
    what_happened: Mapped[str] = mapped_column(Text, nullable=False)
    treatment: Mapped[str] = mapped_column(Text, nullable=False)
    treated_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    outcome: Mapped[FirstAidOutcome] = mapped_column(
        SAEnum(FirstAidOutcome, name="first_aid_outcome"),
        default=FirstAidOutcome.returned_to_class,
        nullable=False,
    )
    sent_home: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    parent_informed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    referred_to: Mapped[Optional[str]] = mapped_column(String(200))


class CounsellingAppointment(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """A booking in the counsellor's diary.

    Distinct from CounsellingSession, which records a meeting that happened.
    An appointment exists before the meeting and may be missed — and a run of
    missed appointments is itself worth seeing, which a table of only-what-
    happened can never show.

    `notes` is what the school may read. `private_notes` is the counsellor's
    own and is not returned by the list endpoint at all — not hidden in the
    frontend, not filtered downstream, simply not selected. A child stops
    talking the moment they believe the counsellor's notebook circulates, so
    the narrow read path is the feature.
    """

    __audited__ = True
    __tablename__ = "counselling_appointments"
    __table_args__ = (
        Index("ix_appointments_day", "school_id", "scheduled_on"),
        Index("ix_appointments_counsellor", "counsellor_user_id", "scheduled_on"),
        Index("ix_appointments_student", "student_id"),
    )

    case_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("counselling_cases.id", ondelete="SET NULL")
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    scheduled_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    scheduled_at: Mapped[time] = mapped_column(Time, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(SmallInteger, default=30, nullable=False)
    counsellor_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    status: Mapped[AppointmentStatus] = mapped_column(
        SAEnum(AppointmentStatus, name="appointment_status"),
        default=AppointmentStatus.booked,
        nullable=False,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    private_notes: Mapped[Optional[str]] = mapped_column(Text)


class EmergencyEscalation(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """Who to ring, in order, when something has happened to a child.

    The medical profile already holds one emergency contact. One is not a
    chain: the person who answers is whoever is free, and a school standing
    in a corridor with an injured child needs the next number, and the one
    after that.

    `sequence` is contiguous from 1 and the service keeps it that way when a
    contact is removed. A chain with a hole in it invites somebody to stop at
    the gap rather than carry on down the list.
    """

    __audited__ = True
    __tablename__ = "emergency_escalations"
    __table_args__ = (
        UniqueConstraint("student_id", "sequence", name="uq_escalation_order"),
        Index("ix_escalations_student", "student_id", "sequence"),
    )

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    contact_name: Mapped[str] = mapped_column(String(160), nullable=False)
    relationship: Mapped[str] = mapped_column(String(60), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(String(300))
