from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import ParentRelation


class StudentLink(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    student_id: int
    full_name: str
    admission_no: str
    section_id: int
    section_label: Optional[str] = None  # e.g. "Grade 1 A" (populated by service)
    relation: ParentRelation
    # This parent is the child's primary contact (student_guardians.is_primary).
    is_primary_contact: bool = False


class ParentCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=160)
    email: str = Field(..., min_length=3, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    student_id: int
    relation: ParentRelation = ParentRelation.guardian
    # Kept on the family contact (guardians) that mirrors this login.
    occupation: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=2000)
    # Make this parent the child's primary contact. Left out, they become it
    # only when the child has none yet.
    primary_contact: Optional[bool] = None


class ParentUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=160)
    phone: Optional[str] = Field(None, max_length=20)
    occupation: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=2000)
    # True makes this parent the primary contact for every child they are linked to.
    primary_contact: Optional[bool] = None


class ParentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: int
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool
    last_login_at: Optional[datetime] = None
    occupation: Optional[str] = None
    address: Optional[str] = None
    children: list[StudentLink] = []


class ParentNoteIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


class ParentNoteRead(BaseModel):
    id: int
    parent_user_id: int
    body: str
    created_by_user_id: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: datetime


class ParentCreateResponse(BaseModel):
    parent: ParentRead
    temporary_password: str


class ParentPasswordResetResponse(BaseModel):
    user_id: int
    temporary_password: str


class LinkChildRequest(BaseModel):
    student_id: int
    relation: ParentRelation = ParentRelation.guardian


# --- Parent portal ---

class ChildOverview(BaseModel):
    """Trimmed-down student view returned to the parent portal."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    admission_no: str
    roll_no: int
    section_id: int
    section_label: Optional[str] = None
    photo_url: Optional[str] = None
    is_active: bool
    # Placeholders for later modules
    attendance_percent: Optional[float] = None
    fees_pending_amount: Optional[float] = None
    relation: ParentRelation
