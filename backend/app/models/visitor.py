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

from app.core.enums import GatePassStatus, IncidentSeverity, VisitPurpose, VisitStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class Visit(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Visitor register. Staff can pre-register an expected visitor; the gate
    checks them in (issuing a pass number) and out."""

    __audited__ = True

    __tablename__ = "visits"
    __table_args__ = (
        UniqueConstraint("school_id", "pass_no", name="uq_visit_pass_no"),
        Index("ix_visits_school_status", "school_id", "status"),
        Index("ix_visits_school_checkin", "school_id", "check_in_at"),
    )

    visitor_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("visitors.id", ondelete="SET NULL")
    )
    visitor_name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    id_type: Mapped[Optional[str]] = mapped_column(String(40))
    # Only the last 4 digits of the ID are kept; the full number isn't needed.
    id_last4: Mapped[Optional[str]] = mapped_column(String(4))
    company: Mapped[Optional[str]] = mapped_column(String(160))
    purpose: Mapped[VisitPurpose] = mapped_column(SAEnum(VisitPurpose, name="visit_purpose"), nullable=False)
    purpose_detail: Mapped[Optional[str]] = mapped_column(String(300))
    host_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    student_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="SET NULL")
    )
    people_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    vehicle_no: Mapped[Optional[str]] = mapped_column(String(20))
    status: Mapped[VisitStatus] = mapped_column(SAEnum(VisitStatus, name="visit_status"), nullable=False)
    expected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    check_in_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    check_out_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    pass_no: Mapped[Optional[str]] = mapped_column(String(24))
    registered_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    checked_in_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    notes: Mapped[Optional[str]] = mapped_column(String(500))
    # the host saying "yes, I'm expecting them" before the gate lets them in
    host_approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    host_approved_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    host_declined_reason: Mapped[Optional[str]] = mapped_column(String(300))


class GatePass(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A student leaving before the end of the day. Whoever collects the
    child shows the 6-digit code at the gate."""

    __audited__ = True

    __tablename__ = "gate_passes"
    __table_args__ = (
        Index("ix_gate_passes_school_date", "school_id", "leave_on"),
        Index("ix_gate_passes_student", "student_id"),
    )

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    leave_on: Mapped[date] = mapped_column(Date, nullable=False)
    leave_time: Mapped[Optional[str]] = mapped_column(String(5))  # HH:MM
    reason: Mapped[str] = mapped_column(String(300), nullable=False)
    pickup_name: Mapped[str] = mapped_column(String(160), nullable=False)
    pickup_relation: Mapped[Optional[str]] = mapped_column(String(60))
    pickup_phone: Mapped[Optional[str]] = mapped_column(String(20))
    code: Mapped[str] = mapped_column(String(6), nullable=False)
    status: Mapped[GatePassStatus] = mapped_column(SAEnum(GatePassStatus, name="gate_pass_status"), nullable=False)
    requested_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    decision_note: Mapped[Optional[str]] = mapped_column(String(300))
    departed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    released_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class SecurityIncident(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __tablename__ = "security_incidents"
    __table_args__ = (Index("ix_security_incidents_school", "school_id", "occurred_at"),)

    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[IncidentSeverity] = mapped_column(
        SAEnum(IncidentSeverity, name="incident_severity"), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    action_taken: Mapped[Optional[str]] = mapped_column(Text)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reported_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
