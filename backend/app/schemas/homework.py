from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import SubmissionStatus
from app.schemas.attachment import AttachmentRead
from app.schemas.rubric import Marking


class HomeworkBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1)
    attachment_url: Optional[str] = Field(None, max_length=500)
    due_date: date


class HomeworkCreate(HomeworkBase):
    class_subject_id: int
    rubric_id: Optional[int] = None
    publish_on: Optional[date] = None
    notify_parents: bool = Field(
        default=False,
        description="If true, also post a Notice to parents of the section(s) for this class",
    )


class HomeworkUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, min_length=1)
    attachment_url: Optional[str] = Field(None, max_length=500)
    due_date: Optional[date] = None
    rubric_id: Optional[int] = None
    publish_on: Optional[date] = None


class CloseIn(BaseModel):
    closed: bool = True


class HomeworkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    class_subject_id: int
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    class_name: Optional[str] = None
    title: str
    description: str
    attachment_url: Optional[str] = None
    due_date: date
    created_by_user_id: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: datetime
    is_past_due: bool
    can_edit: bool  # tells the UI whether the current viewer can edit
    rubric_id: Optional[int] = None
    rubric_name: Optional[str] = None
    is_closed: bool = False
    closed_at: Optional[datetime] = None
    closed_by_name: Optional[str] = None
    attachments: list[AttachmentRead] = []  # uploaded files; attachment_url stays for links
    publish_on: Optional[date] = None
    is_scheduled: bool = False  # not yet visible to children and parents


# --- Story 9.3 — Submissions ---

class SubmissionCreate(BaseModel):
    attachment_url: Optional[str] = Field(None, max_length=500)
    comment: Optional[str] = Field(None, max_length=2000)


class SubmissionUpdate(BaseModel):
    """Parent edits their own submission. Resets status back to 'submitted'."""

    attachment_url: Optional[str] = Field(None, max_length=500)
    comment: Optional[str] = Field(None, max_length=2000)


class SubmissionReview(BaseModel):
    """Teacher action — approve or reject with an optional remark."""

    status: SubmissionStatus
    teacher_remark: Optional[str] = Field(None, max_length=2000)


class SubmissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    homework_id: int
    student_id: int
    student_admission_no: Optional[str] = None
    student_name: Optional[str] = None
    submitted_by_user_id: Optional[int] = None
    submitted_by_name: Optional[str] = None
    attachment_url: Optional[str] = None
    comment: Optional[str] = None
    submitted_at: datetime
    status: SubmissionStatus
    teacher_remark: Optional[str] = None
    reviewed_by_user_id: Optional[int] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    marking: Optional[Marking] = None  # only when the homework uses a rubric
    files: list[AttachmentRead] = []  # uploaded with the work
    review_files: list[AttachmentRead] = []  # the teacher's files on the evaluation
