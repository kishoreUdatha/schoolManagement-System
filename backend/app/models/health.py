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
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import ClinicOutcome
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _StudentScoped:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )


class MedicalProfile(Base, PrimaryKeyMixin, TimestampMixin, _StudentScoped):
    """One per student. Blood group lives on Student already."""

    __audited__ = True

    __tablename__ = "medical_profiles"
    __table_args__ = (Index("uq_medical_profile_student", "student_id", unique=True),)

    allergies: Mapped[Optional[str]] = mapped_column(Text)
    chronic_conditions: Mapped[Optional[str]] = mapped_column(Text)
    current_medications: Mapped[Optional[str]] = mapped_column(Text)
    dietary_restrictions: Mapped[Optional[str]] = mapped_column(Text)
    disabilities: Mapped[Optional[str]] = mapped_column(Text)
    doctor_name: Mapped[Optional[str]] = mapped_column(String(160))
    doctor_phone: Mapped[Optional[str]] = mapped_column(String(20))
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String(160))
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String(20))
    emergency_contact_relation: Mapped[Optional[str]] = mapped_column(String(60))
    insurance_provider: Mapped[Optional[str]] = mapped_column(String(160))
    insurance_policy_no: Mapped[Optional[str]] = mapped_column(String(60))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    # Guardian consent for the school to act on this record (first aid, medicine).
    # Null means nobody has been asked yet; False is a recorded refusal.
    guardian_consent: Mapped[Optional[bool]] = mapped_column(Boolean)
    consent_given_by: Mapped[Optional[str]] = mapped_column(String(160))
    consent_on: Mapped[Optional[date]] = mapped_column(Date)
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class HealthCheckup(Base, PrimaryKeyMixin, TimestampMixin, _StudentScoped):
    __tablename__ = "health_checkups"
    __table_args__ = (Index("ix_health_checkups_student", "student_id", "checked_on"),)

    checked_on: Mapped[date] = mapped_column(Date, nullable=False)
    height_cm: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 1))
    weight_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 1))
    vision_left: Mapped[Optional[str]] = mapped_column(String(10))  # 6/6
    vision_right: Mapped[Optional[str]] = mapped_column(String(10))
    dental: Mapped[Optional[str]] = mapped_column(String(200))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class ClinicVisit(Base, PrimaryKeyMixin, TimestampMixin, _StudentScoped):
    __audited__ = True

    __tablename__ = "clinic_visits"
    __table_args__ = (
        Index("ix_clinic_visits_school_time", "school_id", "visited_at"),
        Index("ix_clinic_visits_student", "student_id"),
    )

    visited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    complaint: Mapped[str] = mapped_column(String(300), nullable=False)
    temperature_c: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 1))
    treatment: Mapped[Optional[str]] = mapped_column(Text)
    medicine_given: Mapped[Optional[str]] = mapped_column(String(300))
    outcome: Mapped[ClinicOutcome] = mapped_column(
        SAEnum(ClinicOutcome, name="clinic_outcome"), nullable=False
    )
    follow_up_on: Mapped[Optional[date]] = mapped_column(Date)
    parent_notified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class Immunization(Base, PrimaryKeyMixin, TimestampMixin, _StudentScoped):
    __tablename__ = "immunizations"
    __table_args__ = (Index("ix_immunizations_student", "student_id"),)

    vaccine: Mapped[str] = mapped_column(String(120), nullable=False)
    dose: Mapped[Optional[str]] = mapped_column(String(40))
    given_on: Mapped[Optional[date]] = mapped_column(Date)
    next_due_on: Mapped[Optional[date]] = mapped_column(Date)
    notes: Mapped[Optional[str]] = mapped_column(String(300))
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
