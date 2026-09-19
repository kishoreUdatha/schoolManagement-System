from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import ClinicOutcome


class ProfileIn(BaseModel):
    allergies: Optional[str] = Field(None, max_length=2000)
    chronic_conditions: Optional[str] = Field(None, max_length=2000)
    current_medications: Optional[str] = Field(None, max_length=2000)
    dietary_restrictions: Optional[str] = Field(None, max_length=1000)
    disabilities: Optional[str] = Field(None, max_length=1000)
    doctor_name: Optional[str] = Field(None, max_length=160)
    doctor_phone: Optional[str] = Field(None, max_length=20)
    emergency_contact_name: Optional[str] = Field(None, max_length=160)
    emergency_contact_phone: Optional[str] = Field(None, max_length=20)
    emergency_contact_relation: Optional[str] = Field(None, max_length=60)
    insurance_provider: Optional[str] = Field(None, max_length=160)
    insurance_policy_no: Optional[str] = Field(None, max_length=60)
    notes: Optional[str] = Field(None, max_length=2000)


class ProfileRead(ProfileIn):
    student_id: int
    blood_group: Optional[str] = None
    updated_at: Optional[datetime] = None
    updated_by_name: Optional[str] = None


class CheckupIn(BaseModel):
    checked_on: date
    height_cm: Optional[Decimal] = Field(None, gt=30, lt=250)
    weight_kg: Optional[Decimal] = Field(None, gt=2, lt=250)
    vision_left: Optional[str] = Field(None, max_length=10)
    vision_right: Optional[str] = Field(None, max_length=10)
    dental: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=2000)


class CheckupRead(CheckupIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    bmi: Optional[Decimal] = None


class VisitIn(BaseModel):
    student_id: int
    visited_at: Optional[datetime] = None  # defaults to now
    complaint: str = Field(..., min_length=2, max_length=300)
    temperature_c: Optional[Decimal] = Field(None, ge=30, le=45)
    treatment: Optional[str] = Field(None, max_length=2000)
    medicine_given: Optional[str] = Field(None, max_length=300)
    outcome: ClinicOutcome = ClinicOutcome.back_to_class
    follow_up_on: Optional[date] = None
    notify_parent: bool = True


class VisitRead(BaseModel):
    id: int
    student_id: int
    student_name: str
    section_label: Optional[str] = None
    visited_at: datetime
    complaint: str
    temperature_c: Optional[Decimal] = None
    treatment: Optional[str] = None
    medicine_given: Optional[str] = None
    outcome: ClinicOutcome
    follow_up_on: Optional[date] = None
    parent_notified: bool
    recorded_by_name: Optional[str] = None
    allergies: Optional[str] = None  # surfaced so the nurse sees them next to the visit


class ImmunizationIn(BaseModel):
    vaccine: str = Field(..., min_length=2, max_length=120)
    dose: Optional[str] = Field(None, max_length=40)
    given_on: Optional[date] = None
    next_due_on: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=300)


class ImmunizationRead(ImmunizationIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int


class HealthRecord(BaseModel):
    student_id: int
    student_name: str
    section_label: Optional[str] = None
    profile: ProfileRead
    checkups: list[CheckupRead]
    visits: list[VisitRead]
    immunizations: list[ImmunizationRead]


class AlertRow(BaseModel):
    student_id: int
    student_name: str
    section_label: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    current_medications: Optional[str] = None
    emergency_contact_phone: Optional[str] = None


class HealthDashboard(BaseModel):
    visits_today: int
    sent_home_today: int
    referred_today: int
    students_with_alerts: int
    immunizations_due: int
    follow_ups_due: int
