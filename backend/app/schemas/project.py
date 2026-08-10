from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import ProjectKind, ProjectProgressStatus


class ProjectCreate(BaseModel):
    class_subject_id: int
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1)
    attachment_url: Optional[str] = Field(None, max_length=500)
    deadline: date
    kind: ProjectKind = ProjectKind.individual
    notify_parents: bool = False


class ProjectUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, min_length=1)
    attachment_url: Optional[str] = Field(None, max_length=500)
    deadline: Optional[date] = None
    kind: Optional[ProjectKind] = None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    class_subject_id: int
    class_name: Optional[str] = None
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    title: str
    description: str
    attachment_url: Optional[str] = None
    deadline: date
    kind: ProjectKind
    created_by_user_id: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: datetime
    is_past_due: bool
    progress_count: int = 0
    eligible_student_count: int = 0


class ProgressUpdate(BaseModel):
    status: Optional[ProjectProgressStatus] = None
    attachment_url: Optional[str] = Field(None, max_length=500)
    comment: Optional[str] = Field(None, max_length=2000)


class ProgressReview(BaseModel):
    teacher_remark: Optional[str] = Field(None, max_length=2000)
    rating: Optional[int] = Field(None, ge=0, le=5)


class ProgressRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    student_id: int
    student_name: Optional[str] = None
    student_admission_no: Optional[str] = None
    status: ProjectProgressStatus
    attachment_url: Optional[str] = None
    comment: Optional[str] = None
    submitted_at: Optional[datetime] = None
    teacher_remark: Optional[str] = None
    rating: Optional[int] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    updated_at: datetime
