from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import (
    AdmissionActivityKind,
    AdmissionSource,
    AdmissionStage,
    Gender,
    ParentRelation,
)


# --- Campaigns ---

class CampaignBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    channel: AdmissionSource = AdmissionSource.campaign
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    budget: Optional[Decimal] = Field(None, ge=0)
    description: Optional[str] = Field(None, max_length=2000)

    @model_validator(mode="after")
    def _check_dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class CampaignCreate(CampaignBase):
    pass


class CampaignUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    channel: Optional[AdmissionSource] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    budget: Optional[Decimal] = Field(None, ge=0)
    description: Optional[str] = Field(None, max_length=2000)
    is_active: Optional[bool] = None


class CampaignRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    channel: AdmissionSource
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    budget: Optional[Decimal] = None
    description: Optional[str] = None
    is_active: bool
    enquiry_count: int = 0
    enrolled_count: int = 0
    created_at: datetime


# --- Enquiries ---

class EnquiryBase(BaseModel):
    student_name: str = Field(..., min_length=2, max_length=160)
    dob: Optional[date] = None
    gender: Optional[Gender] = None
    applying_for_class: Optional[str] = Field(None, max_length=60)
    previous_school: Optional[str] = Field(None, max_length=200)
    parent_name: str = Field(..., min_length=2, max_length=160)
    parent_phone: str = Field(..., min_length=6, max_length=20)
    parent_email: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = Field(None, max_length=2000)


class EnquiryCreate(EnquiryBase):
    source: AdmissionSource = AdmissionSource.walk_in
    campaign_id: Optional[int] = None
    branch_id: Optional[int] = None
    assigned_to_user_id: Optional[int] = None
    next_follow_up_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=4000)


class PublicEnquiryCreate(EnquiryBase):
    """Submitted from the school's public enquiry form. `website` is a
    honeypot: real visitors never see the field, bots fill it in."""

    message: Optional[str] = Field(None, max_length=2000)
    website: Optional[str] = None


class EnquiryUpdate(BaseModel):
    student_name: Optional[str] = Field(None, min_length=2, max_length=160)
    dob: Optional[date] = None
    gender: Optional[Gender] = None
    applying_for_class: Optional[str] = Field(None, max_length=60)
    previous_school: Optional[str] = Field(None, max_length=200)
    parent_name: Optional[str] = Field(None, min_length=2, max_length=160)
    parent_phone: Optional[str] = Field(None, min_length=6, max_length=20)
    parent_email: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = Field(None, max_length=2000)
    source: Optional[AdmissionSource] = None
    campaign_id: Optional[int] = None
    branch_id: Optional[int] = None
    assigned_to_user_id: Optional[int] = None
    next_follow_up_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=4000)


class EnquiryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_name: str
    dob: Optional[date] = None
    gender: Optional[Gender] = None
    applying_for_class: Optional[str] = None
    previous_school: Optional[str] = None
    parent_name: str
    parent_phone: str
    parent_email: Optional[str] = None
    address: Optional[str] = None
    source: AdmissionSource
    campaign_id: Optional[int] = None
    campaign_name: Optional[str] = None
    branch_id: Optional[int] = None
    branch_name: Optional[str] = None
    stage: AdmissionStage
    assigned_to_user_id: Optional[int] = None
    assigned_to_name: Optional[str] = None
    next_follow_up_date: Optional[date] = None
    lost_reason: Optional[str] = None
    notes: Optional[str] = None
    student_id: Optional[int] = None
    converted_at: Optional[datetime] = None
    created_at: datetime


class ActivityCreate(BaseModel):
    kind: AdmissionActivityKind = AdmissionActivityKind.note
    note: str = Field(..., min_length=1, max_length=4000)
    next_follow_up_date: Optional[date] = None


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: AdmissionActivityKind
    note: Optional[str] = None
    from_stage: Optional[AdmissionStage] = None
    to_stage: Optional[AdmissionStage] = None
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    created_at: datetime


class EnquiryDetail(EnquiryRead):
    activities: list[ActivityRead] = []


class StageChange(BaseModel):
    stage: AdmissionStage
    note: Optional[str] = Field(None, max_length=2000)
    lost_reason: Optional[str] = Field(None, max_length=300)

    @model_validator(mode="after")
    def _check(self):
        if self.stage == AdmissionStage.enrolled:
            raise ValueError("Use the convert endpoint to enrol a student")
        if self.stage == AdmissionStage.lost and not (self.lost_reason or "").strip():
            raise ValueError("lost_reason is required when marking an enquiry lost")
        return self


class ConvertRequest(BaseModel):
    academic_year_id: int
    section_id: int
    admission_no: Optional[str] = Field(None, min_length=1, max_length=40)
    create_parent_login: bool = True
    relation: ParentRelation = ParentRelation.guardian


class ConvertResult(BaseModel):
    enquiry_id: int
    student_id: int
    admission_no: str
    parent_user_id: Optional[int] = None
    parent_temporary_password: Optional[str] = None
    parent_login_note: Optional[str] = None


class AdmissionStats(BaseModel):
    total: int
    by_stage: dict[str, int]
    by_source: dict[str, int]
    enrolled: int
    lost: int
    open: int
    conversion_rate: float  # enrolled / (enrolled + lost), 0..100
    follow_ups_due: int


class PublicSchoolInfo(BaseModel):
    school_name: str
    logo_url: Optional[str] = None
    brand_color: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


# --- Campuses and seats, for placing a child ---

class BranchOption(BaseModel):
    id: int
    name: str
    code: str
    is_main: bool


class SectionSeats(BaseModel):
    section_id: int
    name: str
    capacity: int
    taken: int
    available: Optional[int] = None  # None when no capacity is set


class ClassSeats(BaseModel):
    class_id: int
    class_name: str
    capacity: int
    taken: int
    available: Optional[int] = None
    sections: list[SectionSeats] = []
