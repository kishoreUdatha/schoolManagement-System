from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# --- Sections ---

class SectionBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=20)
    capacity: int = Field(0, ge=0, description="0 means uncapped")


class SectionCreate(SectionBase):
    room_id: Optional[int] = Field(None, description="Room (Facilities) the section sits in")


class SectionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=20)
    capacity: Optional[int] = Field(None, ge=0)
    class_teacher_user_id: Optional[int] = Field(
        None, description="User id of a teacher in this school; null to unassign"
    )
    room_id: Optional[int] = Field(
        None, description="Room the section normally sits in; null to clear"
    )


class SectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    class_id: int
    name: str
    capacity: int
    class_teacher_user_id: Optional[int] = None
    room_id: Optional[int] = None
    room_name: Optional[str] = None
    created_at: datetime


# --- Classes ---

SCHOOL_LEVELS = ("Pre-primary", "Primary", "Middle school", "Secondary", "Senior secondary")


class ClassCreate(BaseModel):
    academic_year_id: int
    name: str = Field(..., min_length=1, max_length=60)
    display_order: Optional[int] = Field(None, ge=0)
    code: Optional[str] = Field(None, max_length=20)
    school_level: Optional[str] = Field(None, max_length=40, description=", ".join(SCHOOL_LEVELS))
    capacity: Optional[int] = Field(None, ge=0, le=5000)
    coordinator_user_id: Optional[int] = None
    is_active: bool = True


class ClassUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=60)
    display_order: Optional[int] = Field(None, ge=0)
    code: Optional[str] = Field(None, max_length=20)
    school_level: Optional[str] = Field(None, max_length=40)
    capacity: Optional[int] = Field(None, ge=0, le=5000)
    coordinator_user_id: Optional[int] = Field(None, description="Null to clear")
    is_active: Optional[bool] = None


class ClassRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    school_id: int
    academic_year_id: int
    name: str
    display_order: int
    code: Optional[str] = None
    school_level: Optional[str] = None
    capacity: Optional[int] = None
    coordinator_user_id: Optional[int] = None
    coordinator_name: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    sections: list[SectionRead] = []


class ClassReorderRequest(BaseModel):
    class_ids: list[int] = Field(
        ..., description="Ordered list of class IDs; index becomes the new display_order"
    )
