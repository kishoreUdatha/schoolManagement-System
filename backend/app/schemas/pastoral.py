from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.core.enums import (
    CaseStatus,
    CounsellingCategory,
    DisciplineActionKind,
    DisciplineCategory,
    IncidentSeverity,
    IncidentStatus,
    Priority,
)


# ---------- discipline ----------


class IncidentIn(BaseModel):
    student_id: int
    occurred_on: date
    place: Optional[str] = Field(None, max_length=160)
    category: DisciplineCategory = DisciplineCategory.other
    severity: IncidentSeverity = IncidentSeverity.low
    description: str = Field(..., min_length=5, max_length=5000)
    witnesses: Optional[str] = Field(None, max_length=500)


class IncidentUpdate(BaseModel):
    occurred_on: Optional[date] = None
    place: Optional[str] = Field(None, max_length=160)
    category: Optional[DisciplineCategory] = None
    severity: Optional[IncidentSeverity] = None
    description: Optional[str] = Field(None, min_length=5, max_length=5000)
    witnesses: Optional[str] = Field(None, max_length=500)
    status: Optional[IncidentStatus] = None
    resolution: Optional[str] = Field(None, max_length=5000)


class ActionIn(BaseModel):
    kind: DisciplineActionKind
    details: Optional[str] = Field(None, max_length=5000)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    completed_on: Optional[date] = None
    notify_parents: bool = False
    open_counselling_case: bool = False


class ActionRead(BaseModel):
    id: int
    kind: DisciplineActionKind
    details: Optional[str]
    start_date: Optional[date]
    end_date: Optional[date]
    assigned_by_name: Optional[str]
    completed_on: Optional[date]
    counselling_case_id: Optional[int]


class IncidentRead(BaseModel):
    id: int
    reference_no: str
    student_id: int
    student_name: str
    admission_no: Optional[str] = None
    section_id: Optional[int]
    section_label: Optional[str]
    occurred_on: date
    place: Optional[str]
    category: DisciplineCategory
    severity: IncidentSeverity
    description: str
    witnesses: Optional[str] = None
    status: IncidentStatus
    reported_by_name: Optional[str]
    resolution: Optional[str]
    closed_on: Optional[date]
    closed_by_name: Optional[str]
    shared_with_parents: bool
    parent_informed_at: Optional[datetime]
    can_edit: bool = False
    is_office: bool = False
    actions: list[ActionRead] = []


class ShareIn(BaseModel):
    message: Optional[str] = Field(None, max_length=1000)


class RepeatRow(BaseModel):
    student_id: int
    student_name: str
    incidents: int


class DisciplineSummary(BaseModel):
    from_date: date
    to_date: date
    total: int
    open: int
    by_category: dict[str, int]
    by_severity: dict[str, int]
    by_section: dict[str, int]
    repeat_students: list[RepeatRow]


# ---------- counselling ----------


class CaseIn(BaseModel):
    student_id: int
    title: str = Field(..., min_length=3, max_length=200)
    category: CounsellingCategory = CounsellingCategory.other
    concern: str = Field(..., min_length=5, max_length=5000)
    priority: Priority = Priority.medium
    is_sensitive: bool = False
    counsellor_user_id: Optional[int] = None


class CaseUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    category: Optional[CounsellingCategory] = None
    concern: Optional[str] = Field(None, min_length=5, max_length=5000)
    priority: Optional[Priority] = None
    status: Optional[CaseStatus] = None
    is_sensitive: Optional[bool] = None
    counsellor_user_id: Optional[int] = None
    referred_to: Optional[str] = Field(None, max_length=200)
    outcome: Optional[str] = Field(None, max_length=5000)


class SessionIn(BaseModel):
    met_on: date
    minutes: Optional[int] = Field(None, ge=1, le=600)
    attendees: Optional[str] = Field(None, max_length=300)
    notes: str = Field(..., min_length=3, max_length=10000)
    support_plan: Optional[str] = Field(None, max_length=10000)
    next_session_on: Optional[date] = None


class SessionRead(BaseModel):
    id: int
    met_on: date
    minutes: Optional[int]
    attendees: Optional[str]
    notes: str
    support_plan: Optional[str] = None
    next_session_on: Optional[date]
    recorded_by_name: Optional[str]


class CaseRead(BaseModel):
    id: int
    reference_no: str
    student_id: int
    student_name: str
    section_label: Optional[str]
    title: str
    category: CounsellingCategory
    concern: str
    priority: Priority
    status: CaseStatus
    is_sensitive: bool
    opened_on: date
    referred_by_name: Optional[str]
    counsellor_user_id: Optional[int]
    counsellor_name: Optional[str]
    parent_informed: bool
    referred_to: Optional[str]
    outcome: Optional[str]
    closed_on: Optional[date]
    session_count: int
    can_write: bool = False
    sessions: list[SessionRead] = []


class InformIn(BaseModel):
    message: str = Field(..., min_length=5, max_length=1000)
