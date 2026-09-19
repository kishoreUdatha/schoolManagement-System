from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import (
    CertificateKind,
    CertificateStatus,
    DocumentCategory,
    DocumentOwner,
    VerificationStatus,
)


# --- Documents ---

class DocumentRead(BaseModel):
    id: int
    owner_type: DocumentOwner
    owner_id: Optional[int] = None
    owner_name: Optional[str] = None
    category: DocumentCategory
    title: str
    content_type: str
    size_bytes: int
    original_name: str
    expires_on: Optional[date] = None
    visible_to_parent: bool
    uploaded_by_name: Optional[str] = None
    uploaded_by_parent: bool = False
    verification_status: VerificationStatus
    verified_by_name: Optional[str] = None
    verified_at: Optional[datetime] = None
    remarks: Optional[str] = None
    created_at: datetime


class DocumentUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[DocumentCategory] = None
    expires_on: Optional[date] = None
    visible_to_parent: Optional[bool] = None


class DocumentVerify(BaseModel):
    status: VerificationStatus
    remarks: Optional[str] = Field(None, max_length=500)


class DocumentSummary(BaseModel):
    pending_verification: int
    expiring_soon: int
    by_owner: dict[str, int]


# --- Certificate templates ---

class TemplateCreate(BaseModel):
    kind: CertificateKind
    name: str = Field(..., min_length=1, max_length=120)
    title: str = Field(..., min_length=1, max_length=160)
    body: str = Field(..., min_length=10, max_length=8000)
    serial_prefix: str = Field(..., min_length=1, max_length=12, pattern=r"^[A-Za-z0-9-]+$")
    parent_can_request: bool = False


class TemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    title: Optional[str] = Field(None, min_length=1, max_length=160)
    body: Optional[str] = Field(None, min_length=10, max_length=8000)
    serial_prefix: Optional[str] = Field(None, min_length=1, max_length=12, pattern=r"^[A-Za-z0-9-]+$")
    parent_can_request: Optional[bool] = None
    is_active: Optional[bool] = None


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: CertificateKind
    name: str
    title: str
    body: str
    serial_prefix: str
    parent_can_request: bool
    is_active: bool


# --- Certificates ---

class TCFields(BaseModel):
    """Transfer certificate specifics (CBSE-style)."""

    date_of_leaving: date
    reason_for_leaving: str = Field(..., min_length=2, max_length=200)
    last_class_studied: Optional[str] = Field(None, max_length=60)
    promoted_to: Optional[str] = Field(None, max_length=60)
    conduct: str = Field("Good", max_length=60)
    fees_paid_up_to: Optional[str] = Field(None, max_length=40)
    remarks: Optional[str] = Field(None, max_length=300)
    deactivate_student: bool = True
    allow_with_dues: bool = False


class CertificateIssueCreate(BaseModel):
    template_id: int
    student_id: int
    purpose: Optional[str] = Field(None, max_length=300)
    fields: dict[str, Any] = {}
    tc: Optional[TCFields] = None  # required when the template kind is 'transfer'


class CertificateRequestCreate(BaseModel):
    template_id: int
    purpose: str = Field(..., min_length=3, max_length=300)


class CertificateDecision(BaseModel):
    approve: bool
    remarks: Optional[str] = Field(None, max_length=500)
    fields: dict[str, Any] = {}
    tc: Optional[TCFields] = None


class CertificateCancel(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class CertificateRead(BaseModel):
    id: int
    kind: CertificateKind
    template_id: Optional[int] = None
    template_name: Optional[str] = None
    student_id: int
    student_name: str
    admission_no: str
    section_label: Optional[str] = None
    status: CertificateStatus
    purpose: Optional[str] = None
    fields: dict[str, Any]
    serial_no: Optional[str] = None
    title: Optional[str] = None
    rendered_body: Optional[str] = None
    issued_on: Optional[date] = None
    issued_by_name: Optional[str] = None
    requested_by_name: Optional[str] = None
    remarks: Optional[str] = None
    print_count: int
    created_at: datetime


class PreviewRead(BaseModel):
    title: str
    body: str
    missing: list[str]
