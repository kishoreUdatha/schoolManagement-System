from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# --- Sections ---

class SectionBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=20)
    capacity: int = Field(0, ge=0, description="0 means uncapped")


class SectionCreate(SectionBase):
    pass


class SectionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=20)
    capacity: Optional[int] = Field(None, ge=0)
    class_teacher_user_id: Optional[int] = Field(
        None, description="User id of a teacher in this school; null to unassign"
    )


class SectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    class_id: int
    name: str
    capacity: int
    class_teacher_user_id: Optional[int] = None
    created_at: datetime


# --- Classes ---

class ClassCreate(BaseModel):
    academic_year_id: int
    name: str = Field(..., min_length=1, max_length=60)
    display_order: Optional[int] = Field(None, ge=0)


class ClassUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=60)
    display_order: Optional[int] = Field(None, ge=0)


class ClassRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    school_id: int
    academic_year_id: int
    name: str
    display_order: int
    created_at: datetime
    sections: list[SectionRead] = []


class ClassReorderRequest(BaseModel):
    class_ids: list[int] = Field(
        ..., description="Ordered list of class IDs; index becomes the new display_order"
    )
