from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.core.enums import (
    ApplicationStatus,
    AssessmentKind,
    AssessmentStatus,
    DocumentCategory,
    Gender,
    ParentRelation,
)


class ApplicationIn(BaseModel):
    academic_year_id: Optional[int] = None
    class_id: Optional[int] = None
    applying_for_class: Optional[str] = Field(None, max_length=60)
    student_name: str = Field(..., min_length=2, max_length=160)
    dob: Optional[date] = None
    gender: Optional[Gender] = None
    previous_school: Optional[str] = Field(None, max_length=200)
    sibling_in_school: bool = False
    transport_required: bool = False
    category: Optional[str] = Field(None, max_length=60)
    father_name: Optional[str] = Field(None, max_length=160)
    mother_name: Optional[str] = Field(None, max_length=160)
    guardian_name: str = Field(..., min_length=2, max_length=160)
    phone: str = Field(..., min_length=6, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=5000)

    @model_validator(mode="after")
    def _check(self):
        if self.dob and self.dob > date.today():
            raise ValueError("The date of birth is in the future")
        return self


class PublicApplicationIn(ApplicationIn):
    # anti-spam honeypot; a filled value is treated as a bot
    website: Optional[str] = None


class DecideIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(None, max_length=2000)
    application_fee_due: bool = False


class StatusIn(BaseModel):
    status: ApplicationStatus
    note: Optional[str] = Field(None, max_length=500)


class FeeIn(BaseModel):
    amount: Decimal = Field(..., gt=0, le=10_000_000)
    paid_on: date
    receipt_no: Optional[str] = Field(None, max_length=40)


class AdmitIn(BaseModel):
    academic_year_id: int
    section_id: int
    admission_no: Optional[str] = Field(None, min_length=1, max_length=40)
    create_parent_login: bool = True
    relation: ParentRelation = ParentRelation.guardian
    # The day the child is taken on roll; starts their enrolment. Defaults to today.
    admission_date: Optional[date] = None


class AdmitResult(BaseModel):
    application_id: int
    student_id: int
    admission_no: str
    parent_user_id: Optional[int] = None
    parent_temporary_password: Optional[str] = None
    parent_login_note: Optional[str] = None


class AssessmentIn(BaseModel):
    kind: AssessmentKind = AssessmentKind.written_test
    scheduled_at: datetime
    venue: Optional[str] = Field(None, max_length=200)
    assessor_user_id: Optional[int] = None
    max_marks: Optional[Decimal] = Field(None, gt=0, le=1000)

    @model_validator(mode="after")
    def _check(self):
        if self.scheduled_at.tzinfo is None:
            raise ValueError("Send the time with a timezone offset")
        return self


class AssessmentResultIn(BaseModel):
    status: AssessmentStatus = AssessmentStatus.done
    marks_obtained: Optional[Decimal] = Field(None, ge=0, le=1000)
    passed: Optional[bool] = None
    remarks: Optional[str] = Field(None, max_length=2000)


class AssessmentRead(BaseModel):
    id: int
    kind: AssessmentKind
    scheduled_at: datetime
    venue: Optional[str]
    assessor_user_id: Optional[int]
    assessor_name: Optional[str]
    max_marks: Optional[Decimal]
    marks_obtained: Optional[Decimal]
    status: AssessmentStatus
    passed: Optional[bool]
    remarks: Optional[str]


class DocumentRead(BaseModel):
    id: int
    category: DocumentCategory
    file_name: str
    size_bytes: int
    is_verified: bool
    remark: Optional[str]
    verified_at: Optional[datetime]
    # provenance: the file belongs to this application, put there by this person
    uploaded_at: Optional[datetime] = None
    uploaded_by_name: Optional[str] = None
    verified_by_name: Optional[str] = None


class VerifyIn(BaseModel):
    verified: bool = True
    remark: Optional[str] = Field(None, max_length=300)


class HistoryRow(BaseModel):
    from_status: Optional[ApplicationStatus]
    to_status: ApplicationStatus
    note: Optional[str]
    changed_by_name: Optional[str]
    changed_at: datetime


class ApplicationRead(BaseModel):
    id: int
    application_no: str
    enquiry_id: Optional[int]
    academic_year_id: Optional[int]
    academic_year_name: Optional[str]
    class_id: Optional[int]
    class_name: Optional[str]
    applying_for_class: Optional[str]
    student_name: str
    dob: Optional[date]
    gender: Optional[Gender]
    previous_school: Optional[str]
    sibling_in_school: bool
    transport_required: bool = False
    category: Optional[str]
    father_name: Optional[str]
    mother_name: Optional[str]
    guardian_name: str
    phone: str
    email: Optional[str]
    address: Optional[str]
    notes: Optional[str]
    status: ApplicationStatus
    submitted_at: Optional[datetime]
    decided_by_name: Optional[str]
    decided_at: Optional[datetime]
    decision_note: Optional[str]
    application_fee: Optional[Decimal]
    fee_paid_on: Optional[date]
    fee_receipt_no: Optional[str]
    student_id: Optional[int]
    documents_total: int = 0
    documents_verified: int = 0
    documents: list[DocumentRead] = []
    assessments: list[AssessmentRead] = []
    history: list[HistoryRow] = []


class SourceFunnelRow(BaseModel):
    # an admission_source value, or "direct" for applications with no enquiry
    source: str
    enquiries: int
    applications: int
    confirmed: int
    pending: int
    # confirmed ÷ enquiries (÷ applications when a source has no enquiries)
    conversion: float


class ApplicationFunnel(BaseModel):
    by_status: dict[str, int]
    total: int
    in_progress: int
    admitted: int
    by_source: list[SourceFunnelRow] = []


class PublicApplicationAck(BaseModel):
    ok: bool = True
    application_no: str
    message: str
