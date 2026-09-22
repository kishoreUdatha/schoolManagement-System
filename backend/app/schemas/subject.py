from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import SubjectKind


# --- Subjects ---

class SubjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    code: str = Field(..., min_length=1, max_length=20)
    kind: SubjectKind = SubjectKind.core
    display_order: int = Field(0, ge=0)
    department_id: Optional[int] = None


class SubjectCreate(SubjectBase):
    pass


class SubjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    kind: Optional[SubjectKind] = None
    display_order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None
    department_id: Optional[int] = None


class SubjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    school_id: int
    name: str
    code: str
    kind: SubjectKind
    display_order: int
    is_active: bool
    department_id: Optional[int] = None
    created_at: datetime


class SubjectBulkCreate(BaseModel):
    subjects: list[SubjectCreate] = Field(..., min_length=1, max_length=200)


class SubjectBulkResult(BaseModel):
    created: list[SubjectRead]
    errors: list[dict]  # [{"row": 0, "code": "MATH", "error": "..."}]


# --- Class-Subject assignments ---

class ClassSubjectAssign(BaseModel):
    subject_id: int
    is_optional: bool = False
    display_order: Optional[int] = Field(None, ge=0)


class ClassSubjectUpdate(BaseModel):
    is_optional: Optional[bool] = None
    display_order: Optional[int] = Field(None, ge=0)
    teacher_user_id: Optional[int] = Field(
        None, description="User id of a teacher; null to unassign"
    )
    periods_per_week: Optional[int] = Field(None, ge=0, le=40)
    room_id: Optional[int] = Field(None, description="Usual room; null to clear")


class ClassSubjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    class_id: int
    subject_id: int
    teacher_user_id: Optional[int] = None
    is_optional: bool
    display_order: int
    periods_per_week: int = 0
    room_id: Optional[int] = None
    room_name: Optional[str] = None
    subject: SubjectRead
