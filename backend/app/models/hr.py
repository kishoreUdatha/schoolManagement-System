"""Recruitment (openings, candidates, interviews, offers) and leave entitlement."""
from datetime import date, datetime
from decimal import Decimal
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
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import (
    ApplicationStage,
    CandidateSource,
    EmploymentType,
    InterviewMode,
    InterviewStatus,
    OfferStatus,
    OpeningStatus,
    StaffLeaveKind,
)
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class JobOpening(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A post the school is hiring for. Open + public appears on the careers page."""

    __audited__ = True
    __tablename__ = "job_openings"
    __table_args__ = (
        UniqueConstraint("school_id", "reference_no", name="uq_job_opening_reference"),
        Index("ix_job_openings_school_status", "school_id", "status"),
    )

    reference_no: Mapped[str] = mapped_column(String(24), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    department_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("departments.id", ondelete="SET NULL")
    )
    employment_type: Mapped[EmploymentType] = mapped_column(
        SAEnum(EmploymentType, name="employment_type"), default=EmploymentType.full_time, nullable=False
    )
    vacancies: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    requirements: Mapped[Optional[str]] = mapped_column(Text)
    salary_min: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    salary_max: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    status: Mapped[OpeningStatus] = mapped_column(
        SAEnum(OpeningStatus, name="opening_status"), default=OpeningStatus.draft, nullable=False
    )
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    posted_on: Mapped[Optional[date]] = mapped_column(Date)
    closes_on: Mapped[Optional[date]] = mapped_column(Date)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class Candidate(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Someone who applied, kept once per school so repeat applicants are visible."""

    __audited__ = True
    __tablename__ = "candidates"
    __table_args__ = (
        UniqueConstraint("school_id", "email", name="uq_candidate_email"),
        Index("ix_candidates_school_name", "school_id", "full_name"),
    )

    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    source: Mapped[CandidateSource] = mapped_column(
        SAEnum(CandidateSource, name="candidate_source"), default=CandidateSource.website, nullable=False
    )
    qualification: Mapped[Optional[str]] = mapped_column(String(200))
    experience_years: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 1))
    current_employer: Mapped[Optional[str]] = mapped_column(String(160))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    resume_key: Mapped[Optional[str]] = mapped_column(String(300))
    resume_name: Mapped[Optional[str]] = mapped_column(String(200))


class CandidateApplication(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __audited__ = True
    __tablename__ = "candidate_applications"
    __table_args__ = (
        UniqueConstraint("opening_id", "candidate_id", name="uq_application_per_opening"),
        Index("ix_applications_school_stage", "school_id", "stage"),
    )

    opening_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("job_openings.id", ondelete="CASCADE"), nullable=False
    )
    candidate_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    applied_on: Mapped[date] = mapped_column(Date, nullable=False)
    stage: Mapped[ApplicationStage] = mapped_column(
        SAEnum(ApplicationStage, name="application_stage"), default=ApplicationStage.applied, nullable=False
    )
    rating: Mapped[Optional[int]] = mapped_column(SmallInteger)  # 1-5 overall
    notes: Mapped[Optional[str]] = mapped_column(Text)
    rejected_reason: Mapped[Optional[str]] = mapped_column(String(500))
    hired_staff_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("staff.id", ondelete="SET NULL")
    )


class InterviewSchedule(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __audited__ = True
    __tablename__ = "interview_schedules"
    __table_args__ = (Index("ix_interviews_application", "application_id", "round_no"),)

    application_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("candidate_applications.id", ondelete="CASCADE"), nullable=False
    )
    round_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    mode: Mapped[InterviewMode] = mapped_column(
        SAEnum(InterviewMode, name="interview_mode"), default=InterviewMode.in_person, nullable=False
    )
    place_or_link: Mapped[Optional[str]] = mapped_column(String(300))
    panel_user_ids: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    status: Mapped[InterviewStatus] = mapped_column(
        SAEnum(InterviewStatus, name="interview_status"), default=InterviewStatus.scheduled, nullable=False
    )
    feedback: Mapped[Optional[str]] = mapped_column(Text)
    rating: Mapped[Optional[int]] = mapped_column(SmallInteger)
    recommended: Mapped[Optional[bool]] = mapped_column(Boolean)
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class Offer(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __audited__ = True
    __tablename__ = "offers"
    __table_args__ = (Index("ix_offers_application", "application_id"),)

    application_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("candidate_applications.id", ondelete="CASCADE"), nullable=False
    )
    role_title: Mapped[str] = mapped_column(String(160), nullable=False)
    annual_salary: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    joining_date: Mapped[date] = mapped_column(Date, nullable=False)
    valid_till: Mapped[Optional[date]] = mapped_column(Date)
    status: Mapped[OfferStatus] = mapped_column(
        SAEnum(OfferStatus, name="offer_status"), default=OfferStatus.draft, nullable=False
    )
    terms: Mapped[Optional[str]] = mapped_column(Text)
    department_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("departments.id", ondelete="SET NULL")
    )
    reporting_manager_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("staff.id", ondelete="SET NULL")
    )
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    response_note: Mapped[Optional[str]] = mapped_column(String(500))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class LeaveType(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A kind of staff leave with its yearly entitlement."""

    __audited__ = True
    __tablename__ = "leave_types"
    __table_args__ = (UniqueConstraint("school_id", "code", name="uq_leave_type_code"),)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    # which of the old fixed kinds this maps to, so existing requests still fit
    kind: Mapped[StaffLeaveKind] = mapped_column(
        SAEnum(StaffLeaveKind, name="staff_leave_kind"), default=StaffLeaveKind.casual, nullable=False
    )
    annual_days: Mapped[Decimal] = mapped_column(Numeric(5, 1), default=0, nullable=False)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    carry_forward_max: Mapped[Decimal] = mapped_column(Numeric(5, 1), default=0, nullable=False)
    # ask for a medical note / proof beyond this many days in one request
    document_after_days: Mapped[Optional[int]] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Who decides this kind of leave. Empty means the usual deciders (school
    # admin or principal); set, only that person or a school admin can.
    approver_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    approver = relationship("User", foreign_keys=[approver_user_id])

    @property
    def approver_name(self) -> Optional[str]:
        return self.approver.full_name if self.approver_user_id and self.approver else None


class LeaveBalance(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """One staff member's entitlement for a leave type in a calendar year."""

    __tablename__ = "leave_balances"
    __table_args__ = (
        UniqueConstraint("user_id", "leave_type_id", "year", name="uq_leave_balance"),
        Index("ix_leave_balances_school_year", "school_id", "year"),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    leave_type_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("leave_types.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    allotted: Mapped[Decimal] = mapped_column(Numeric(5, 1), default=0, nullable=False)
    carried_forward: Mapped[Decimal] = mapped_column(Numeric(5, 1), default=0, nullable=False)
    used: Mapped[Decimal] = mapped_column(Numeric(5, 1), default=0, nullable=False)
    # manual correction, can be negative
    adjustment: Mapped[Decimal] = mapped_column(Numeric(5, 1), default=0, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(300))
