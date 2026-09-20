"""Discipline incidents and counselling cases.

Counselling notes are sensitive: they are kept apart from discipline records
and are never shown to parents through the portal.
"""
from datetime import date, datetime
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
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    CaseStatus,
    CounsellingCategory,
    DisciplineActionKind,
    DisciplineCategory,
    IncidentSeverity,
    IncidentStatus,
    Priority,
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


class DisciplineIncident(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __audited__ = True
    __tablename__ = "discipline_incidents"
    __table_args__ = (
        UniqueConstraint("school_id", "reference_no", name="uq_discipline_reference"),
        Index("ix_discipline_incidents_student", "student_id", "occurred_on"),
        Index("ix_discipline_incidents_school_status", "school_id", "status"),
    )

    reference_no: Mapped[str] = mapped_column(String(24), nullable=False)
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    section_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("sections.id", ondelete="SET NULL")
    )
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    place: Mapped[Optional[str]] = mapped_column(String(160))
    category: Mapped[DisciplineCategory] = mapped_column(
        SAEnum(DisciplineCategory, name="discipline_category"), nullable=False
    )
    severity: Mapped[IncidentSeverity] = mapped_column(
        SAEnum(IncidentSeverity, name="incident_severity"), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    witnesses: Mapped[Optional[str]] = mapped_column(String(500))
    status: Mapped[IncidentStatus] = mapped_column(
        SAEnum(IncidentStatus, name="incident_status"), default=IncidentStatus.reported, nullable=False
    )
    reported_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    # what the school concluded
    resolution: Mapped[Optional[str]] = mapped_column(Text)
    closed_on: Mapped[Optional[date]] = mapped_column(Date)
    closed_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    # parents only see incidents the school shares
    shared_with_parents: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    parent_informed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class DisciplineAction(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __audited__ = True
    __tablename__ = "discipline_actions"
    __table_args__ = (Index("ix_discipline_actions_incident", "incident_id"),)

    incident_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("discipline_incidents.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[DisciplineActionKind] = mapped_column(
        SAEnum(DisciplineActionKind, name="discipline_action_kind"), nullable=False
    )
    details: Mapped[Optional[str]] = mapped_column(Text)
    # detention / suspension run over dates
    start_date: Mapped[Optional[date]] = mapped_column(Date)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    assigned_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    completed_on: Mapped[Optional[date]] = mapped_column(Date)
    # completed_on existed but nothing ever set it, so an outstanding detention
    # and a served one looked the same. Naming who signed it off is what makes
    # "served" a fact rather than an assertion.
    completed_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    counselling_case_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("counselling_cases.id", ondelete="SET NULL")
    )


class CounsellingCase(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A pastoral case. Visible to the assigned counsellor, the principal and
    the school admin; a sensitive case is hidden from everyone else, including
    the teacher who referred it."""

    __audited__ = True
    __tablename__ = "counselling_cases"
    __table_args__ = (
        UniqueConstraint("school_id", "reference_no", name="uq_counselling_reference"),
        Index("ix_counselling_cases_student", "student_id"),
        Index("ix_counselling_cases_school_status", "school_id", "status"),
    )

    reference_no: Mapped[str] = mapped_column(String(24), nullable=False)
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[CounsellingCategory] = mapped_column(
        SAEnum(CounsellingCategory, name="counselling_category"), nullable=False
    )
    concern: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[Priority] = mapped_column(SAEnum(Priority, name="priority"), default=Priority.medium, nullable=False)
    status: Mapped[CaseStatus] = mapped_column(
        SAEnum(CaseStatus, name="case_status"), default=CaseStatus.open, nullable=False
    )
    is_sensitive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    opened_on: Mapped[date] = mapped_column(Date, nullable=False)
    referred_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    counsellor_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    parent_informed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    referred_to: Mapped[Optional[str]] = mapped_column(String(200))
    outcome: Mapped[Optional[str]] = mapped_column(Text)
    closed_on: Mapped[Optional[date]] = mapped_column(Date)


class CounsellingSession(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __tablename__ = "counselling_sessions"
    __table_args__ = (Index("ix_counselling_sessions_case", "case_id", "met_on"),)

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("counselling_cases.id", ondelete="CASCADE"), nullable=False
    )
    met_on: Mapped[date] = mapped_column(Date, nullable=False)
    minutes: Mapped[Optional[int]] = mapped_column(Integer)
    attendees: Mapped[Optional[str]] = mapped_column(String(300))
    notes: Mapped[str] = mapped_column(Text, nullable=False)
    next_session_on: Mapped[Optional[date]] = mapped_column(Date)
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
