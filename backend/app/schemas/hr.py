from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

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


# ---------- openings ----------


class OpeningIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=160)
    department_id: Optional[int] = None
    employment_type: EmploymentType = EmploymentType.full_time
    vacancies: int = Field(1, ge=1, le=500)
    description: Optional[str] = Field(None, max_length=10000)
    requirements: Optional[str] = Field(None, max_length=10000)
    salary_min: Optional[Decimal] = Field(None, ge=0, le=100_000_000)
    salary_max: Optional[Decimal] = Field(None, ge=0, le=100_000_000)
    is_public: bool = True
    closes_on: Optional[date] = None


class OpeningRead(BaseModel):
    id: int
    reference_no: str
    title: str
    department_id: Optional[int]
    department_name: Optional[str]
    employment_type: EmploymentType
    vacancies: int
    description: Optional[str]
    requirements: Optional[str]
    salary_min: Optional[Decimal]
    salary_max: Optional[Decimal]
    status: OpeningStatus
    is_public: bool
    posted_on: Optional[date]
    closes_on: Optional[date]
    applications: int = 0
    hired: int = 0


class PublicOpening(BaseModel):
    id: int
    reference_no: str
    title: str
    department_name: Optional[str] = None
    employment_type: EmploymentType
    vacancies: int
    description: Optional[str]
    requirements: Optional[str]
    closes_on: Optional[date]


# ---------- candidates ----------


class CandidateIn(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=160)
    email: str = Field(..., min_length=5, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    source: CandidateSource = CandidateSource.website
    qualification: Optional[str] = Field(None, max_length=200)
    experience_years: Optional[Decimal] = Field(None, ge=0, le=60)
    current_employer: Optional[str] = Field(None, max_length=160)
    notes: Optional[str] = Field(None, max_length=5000)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1] or " " in v:
            raise ValueError("Enter a valid email address")
        return v


class CandidateRead(BaseModel):
    id: int
    full_name: str
    email: str
    phone: Optional[str]
    source: CandidateSource
    qualification: Optional[str]
    experience_years: Optional[Decimal]
    current_employer: Optional[str]
    notes: Optional[str]
    has_resume: bool
    resume_name: Optional[str]
    applications: int


# ---------- applications ----------


class ApplicationIn(BaseModel):
    opening_id: int
    candidate: CandidateIn
    notes: Optional[str] = Field(None, max_length=5000)


class PublicApplyIn(BaseModel):
    candidate: CandidateIn
    message: Optional[str] = Field(None, max_length=2000)


class StageIn(BaseModel):
    stage: ApplicationStage
    rating: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = Field(None, max_length=5000)
    reason: Optional[str] = Field(None, max_length=500)


class InterviewIn(BaseModel):
    round_no: Optional[int] = Field(None, ge=1, le=10)
    scheduled_at: datetime
    minutes: int = Field(30, ge=5, le=480)
    mode: InterviewMode = InterviewMode.in_person
    place_or_link: Optional[str] = Field(None, max_length=300)
    panel_user_ids: list[int] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def _check(self):
        if self.scheduled_at.tzinfo is None:
            raise ValueError("Send the time with a timezone offset")
        return self


class FeedbackIn(BaseModel):
    status: InterviewStatus = InterviewStatus.done
    feedback: Optional[str] = Field(None, max_length=5000)
    rating: Optional[int] = Field(None, ge=1, le=5)
    recommended: Optional[bool] = None


class InterviewRead(BaseModel):
    id: int
    round_no: int
    scheduled_at: datetime
    minutes: int
    mode: InterviewMode
    place_or_link: Optional[str]
    panel_user_ids: list[int]
    panel_names: list[str]
    status: InterviewStatus
    feedback: Optional[str]
    rating: Optional[int]
    recommended: Optional[bool]


class OfferIn(BaseModel):
    role_title: str = Field(..., min_length=2, max_length=160)
    annual_salary: Decimal = Field(..., gt=0, le=100_000_000)
    joining_date: date
    valid_till: Optional[date] = None
    terms: Optional[str] = Field(None, max_length=10000)
    department_id: Optional[int] = None
    reporting_manager_id: Optional[int] = Field(None, description="Staff id of the manager they will report to")


class OfferRespondIn(BaseModel):
    accept: bool
    note: Optional[str] = Field(None, max_length=500)


class OfferRead(BaseModel):
    id: int
    role_title: str
    annual_salary: Decimal
    joining_date: date
    valid_till: Optional[date]
    status: OfferStatus
    terms: Optional[str]
    sent_at: Optional[datetime]
    responded_at: Optional[datetime]
    response_note: Optional[str]
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    reporting_manager_id: Optional[int] = None
    reporting_manager_name: Optional[str] = None


class HireIn(BaseModel):
    employee_no: Optional[str] = Field(None, max_length=40, description="Left out, the next EMP number is used")
    role: str = Field("teacher", description="teacher | staff | principal | accountant")


class HireResult(BaseModel):
    staff_id: int
    user_id: int
    employee_no: str
    temporary_password: str
    opening_status: OpeningStatus


class ApplicationRead(BaseModel):
    id: int
    opening_id: int
    opening_title: str
    candidate_id: int
    candidate_name: str
    candidate_email: str
    candidate_phone: Optional[str]
    qualification: Optional[str]
    experience_years: Optional[Decimal]
    has_resume: bool
    applied_on: date
    stage: ApplicationStage
    rating: Optional[int]
    notes: Optional[str]
    rejected_reason: Optional[str]
    hired_staff_id: Optional[int]
    interviews: list[InterviewRead] = []
    offer: Optional[OfferRead] = None


class Pipeline(BaseModel):
    by_stage: dict[str, int]
    open_positions: int
    openings_open: int
    in_progress: int


# ---------- leave ----------


class LeaveTypeIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    code: str = Field(..., min_length=1, max_length=20)
    kind: StaffLeaveKind = StaffLeaveKind.casual
    annual_days: Decimal = Field(0, ge=0, le=365)
    is_paid: bool = True
    carry_forward_max: Decimal = Field(0, ge=0, le=365)
    document_after_days: Optional[int] = Field(None, ge=1, le=365)
    is_active: bool = True
    approver_user_id: Optional[int] = Field(
        None, description="Principal or school admin who decides this kind of leave; null for anyone who can"
    )


class LeaveTypeRead(LeaveTypeIn):
    id: int
    approver_name: Optional[str] = None


class BalanceAdjustIn(BaseModel):
    adjustment: Decimal = Field(..., ge=-365, le=365)
    note: Optional[str] = Field(None, max_length=300)


class AllotIn(BaseModel):
    year: int = Field(..., ge=2000, le=2100)
    carry_forward: bool = True


class AllotResult(BaseModel):
    year: int
    staff: int
    types: int
    created: int
    updated: int


class BalanceRead(BaseModel):
    id: int
    user_id: int
    user_name: str
    leave_type_id: int
    leave_type_name: str
    year: int
    allotted: Decimal
    carried_forward: Decimal
    adjustment: Decimal
    used: Decimal
    available: Decimal
    note: Optional[str]
    is_paid: bool
