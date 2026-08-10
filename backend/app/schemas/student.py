from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import Gender


class StudentBase(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=160)
    dob: Optional[date] = None
    gender: Optional[Gender] = None
    blood_group: Optional[str] = Field(None, max_length=10)
    photo_url: Optional[str] = Field(None, max_length=500)
    address: Optional[str] = None


class StudentCreate(StudentBase):
    admission_no: Optional[str] = Field(
        None,
        min_length=1,
        max_length=40,
        description="Auto-generated if omitted (S00001, S00002, ...)",
    )
    academic_year_id: int
    section_id: int
    roll_no: Optional[int] = Field(
        None,
        ge=1,
        description="Auto-assigned to (max existing in section + 1) if omitted",
    )


class StudentUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=160)
    dob: Optional[date] = None
    gender: Optional[Gender] = None
    blood_group: Optional[str] = Field(None, max_length=10)
    photo_url: Optional[str] = Field(None, max_length=500)
    address: Optional[str] = None
    section_id: Optional[int] = None
    roll_no: Optional[int] = Field(None, ge=1)


class StudentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admission_no: str
    full_name: str
    dob: Optional[date] = None
    gender: Optional[Gender] = None
    blood_group: Optional[str] = None
    photo_url: Optional[str] = None
    address: Optional[str] = None
    academic_year_id: int
    section_id: int
    roll_no: int
    is_active: bool
    created_at: datetime


class StudentDetailRead(StudentRead):
    # Placeholder analytics — backfilled when later modules land
    attendance_percent: Optional[float] = None
    fees_pending_amount: Optional[float] = None
    marks_summary: Optional[dict] = None


class StudentBulkRow(BaseModel):
    """Permissive shape for bulk import — per-row validation happens in the
    service so one bad row doesn't reject the whole upload (story 4.2 spec
    says 'show error rows, import valid records')."""

    full_name: Optional[str] = None
    dob: Optional[date] = None
    gender: Optional[Gender] = None
    blood_group: Optional[str] = Field(None, max_length=10)
    address: Optional[str] = None
    photo_url: Optional[str] = Field(None, max_length=500)


class StudentBulkCreate(BaseModel):
    academic_year_id: int
    section_id: int
    students: list[StudentBulkRow] = Field(..., min_length=1, max_length=200)


class StudentBulkResult(BaseModel):
    created: list[StudentRead]
    errors: list[dict]


class StudentPromoteRequest(BaseModel):
    source_section_id: int
    target_section_id: int
    # When omitted, promote ALL active students currently in source_section_id.
    student_ids: Optional[list[int]] = None


class StudentPromoteResult(BaseModel):
    promoted: list[StudentRead]
    errors: list[dict]
    source_section_id: int
    target_section_id: int
    target_academic_year_id: int
