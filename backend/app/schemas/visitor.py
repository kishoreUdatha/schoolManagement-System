from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.enums import GatePassStatus, IncidentSeverity, VisitPurpose, VisitStatus


class VisitIn(BaseModel):
    visitor_name: str = Field(..., min_length=2, max_length=160)
    phone: str = Field(..., min_length=6, max_length=20)
    id_type: Optional[str] = Field(None, max_length=40)
    id_number: Optional[str] = Field(None, max_length=40)  # only the last 4 digits are stored
    company: Optional[str] = Field(None, max_length=160)
    purpose: VisitPurpose
    purpose_detail: Optional[str] = Field(None, max_length=300)
    host_user_id: Optional[int] = None
    student_id: Optional[int] = None
    people_count: int = Field(1, ge=1, le=50)
    vehicle_no: Optional[str] = Field(None, max_length=20)
    expected_at: Optional[datetime] = None  # set → pre-registration, else walk-in check-in
    notes: Optional[str] = Field(None, max_length=500)


class VisitRead(BaseModel):
    id: int
    visitor_name: str
    phone: str
    id_type: Optional[str] = None
    id_last4: Optional[str] = None
    company: Optional[str] = None
    purpose: VisitPurpose
    purpose_detail: Optional[str] = None
    host_user_id: Optional[int] = None
    host_name: Optional[str] = None
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    people_count: int
    vehicle_no: Optional[str] = None
    status: VisitStatus
    expected_at: Optional[datetime] = None
    check_in_at: Optional[datetime] = None
    check_out_at: Optional[datetime] = None
    pass_no: Optional[str] = None
    minutes_inside: Optional[int] = None
    notes: Optional[str] = None


class GatePassIn(BaseModel):
    student_id: int
    leave_on: date
    leave_time: Optional[str] = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    reason: str = Field(..., min_length=3, max_length=300)
    pickup_name: str = Field(..., min_length=2, max_length=160)
    pickup_relation: Optional[str] = Field(None, max_length=60)
    pickup_phone: Optional[str] = Field(None, max_length=20)


class ParentGatePassIn(BaseModel):
    leave_on: date
    leave_time: Optional[str] = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    reason: str = Field(..., min_length=3, max_length=300)
    pickup_name: str = Field(..., min_length=2, max_length=160)
    pickup_relation: Optional[str] = Field(None, max_length=60)
    pickup_phone: Optional[str] = Field(None, max_length=20)


class GatePassDecision(BaseModel):
    approve: bool
    note: Optional[str] = Field(None, max_length=300)


class GateVerify(BaseModel):
    code: str = Field(..., pattern=r"^\d{6}$")


class GatePassRead(BaseModel):
    id: int
    student_id: int
    student_name: str
    section_label: Optional[str] = None
    leave_on: date
    leave_time: Optional[str] = None
    reason: str
    pickup_name: str
    pickup_relation: Optional[str] = None
    pickup_phone: Optional[str] = None
    code: Optional[str] = None  # shown to the office and the parent, not in gate lookups
    status: GatePassStatus
    requested_by_name: Optional[str] = None
    requested_by_parent: bool = False
    pickup_listed: Optional[bool] = None  # named collector is a guardian allowed to pick up
    decision_note: Optional[str] = None
    departed_at: Optional[datetime] = None
    created_at: datetime


class IncidentIn(BaseModel):
    occurred_at: datetime
    location: Optional[str] = Field(None, max_length=160)
    category: str = Field(..., min_length=2, max_length=80)
    severity: IncidentSeverity = IncidentSeverity.low
    description: str = Field(..., min_length=5, max_length=4000)
    action_taken: Optional[str] = Field(None, max_length=4000)

    @field_validator("occurred_at")
    @classmethod
    def _not_future(cls, v: datetime) -> datetime:
        from datetime import timezone

        if v.tzinfo and v > datetime.now(timezone.utc):
            raise ValueError("occurred_at is in the future")
        return v


class IncidentUpdate(BaseModel):
    action_taken: Optional[str] = Field(None, max_length=4000)
    is_closed: Optional[bool] = None
    severity: Optional[IncidentSeverity] = None


class IncidentRead(BaseModel):
    id: int
    occurred_at: datetime
    location: Optional[str] = None
    category: str
    severity: IncidentSeverity
    description: str
    action_taken: Optional[str] = None
    is_closed: bool
    reported_by_name: Optional[str] = None
    created_at: datetime


class FrontDeskDashboard(BaseModel):
    inside_now: int
    visitors_today: int
    expected_today: int
    gate_passes_today: int
    gate_passes_pending: int
    open_incidents: int
