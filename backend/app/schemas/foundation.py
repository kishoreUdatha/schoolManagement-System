from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import EnrollmentOutcome, GuardianRelation


class EnrollmentRead(BaseModel):
    id: int
    academic_year_id: int
    academic_year_name: str
    section_id: int
    section_label: Optional[str] = None
    roll_no: int
    start_date: date
    end_date: Optional[date] = None
    outcome: EnrollmentOutcome
    notes: Optional[str] = None


class OutcomeIn(BaseModel):
    outcome: EnrollmentOutcome


class RosterRow(BaseModel):
    student_id: int
    full_name: str
    admission_no: str
    section_label: Optional[str] = None
    roll_no: int
    outcome: EnrollmentOutcome
    start_date: date
    end_date: Optional[date] = None


class GuardianIn(BaseModel):
    guardian_id: Optional[int] = None  # link an existing guardian (e.g. a sibling's parent)
    full_name: Optional[str] = Field(None, min_length=2, max_length=160)
    phone: Optional[str] = Field(None, min_length=6, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    occupation: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=1000)
    relation: GuardianRelation
    is_primary: bool = False
    can_pickup: bool = True
    is_emergency_contact: bool = True
    lives_with_student: bool = True


class GuardianUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=160)
    phone: Optional[str] = Field(None, min_length=6, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    occupation: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=1000)
    relation: Optional[GuardianRelation] = None
    is_primary: Optional[bool] = None
    can_pickup: Optional[bool] = None
    is_emergency_contact: Optional[bool] = None
    lives_with_student: Optional[bool] = None


class ParentGuardianIn(BaseModel):
    """Parents can add people allowed to collect their child (no login)."""

    full_name: str = Field(..., min_length=2, max_length=160)
    phone: str = Field(..., min_length=6, max_length=20)
    relation: GuardianRelation
    can_pickup: bool = True
    is_emergency_contact: bool = False


class GuardianRead(BaseModel):
    guardian_id: int
    link_id: int
    full_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    occupation: Optional[str] = None
    address: Optional[str] = None
    relation: GuardianRelation
    is_primary: bool
    can_pickup: bool
    is_emergency_contact: bool
    lives_with_student: bool
    has_portal_login: bool


class GuardianChild(BaseModel):
    student_id: int
    full_name: str
    admission_no: str
    section_label: Optional[str] = None
    relation: str
    is_primary: bool


class GuardianDirectoryRow(BaseModel):
    """One family contact in the school-wide directory, login or not."""

    guardian_id: int
    user_id: Optional[int] = None
    full_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    occupation: Optional[str] = None
    has_portal_login: bool
    is_active: Optional[bool] = None
    last_login_at: Optional[datetime] = None
    children: list[GuardianChild] = []


class PortalGrant(BaseModel):
    user_id: int
    email: str
    temporary_password: str


class TermIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    start_date: date
    end_date: date
    # The school's own count of teaching days; leave out to keep what is
    # saved, null to fall back to the calendar count (school_days).
    working_days: Optional[int] = Field(None, ge=0, le=366)


class TermRead(TermIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    academic_year_id: int
    sequence: int
    # Working weekdays in the term less school holidays, from the calendar.
    school_days: Optional[int] = None


class DepartmentIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    code: str = Field(..., min_length=1, max_length=20, pattern=r"^[A-Za-z0-9-]+$")
    head_user_id: Optional[int] = None
    is_active: bool = True
    # Leave out to keep what is saved; null clears.
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)


class DepartmentRead(DepartmentIn):
    id: int
    head_name: Optional[str] = None
    staff_count: int = 0
    subject_count: int = 0
