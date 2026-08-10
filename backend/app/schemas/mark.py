from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import MarkStatus


class MarkEntry(BaseModel):
    student_id: int
    status: MarkStatus = MarkStatus.scored
    marks_obtained: Optional[int] = Field(None, ge=0)
    remark: Optional[str] = Field(None, max_length=300)

    @model_validator(mode="after")
    def _check_marks(self):
        if self.status == MarkStatus.scored and self.marks_obtained is None:
            raise ValueError("marks_obtained is required when status=scored")
        return self


class MarksSaveRequest(BaseModel):
    section_id: int
    entries: list[MarkEntry] = Field(..., min_length=1, max_length=500)


class MarkRow(BaseModel):
    """Per-student row in the entry view."""
    model_config = ConfigDict(from_attributes=True)

    student_id: int
    admission_no: str
    roll_no: int
    full_name: str
    status: Optional[MarkStatus] = None  # None = not yet marked
    marks_obtained: Optional[int] = None
    grade: Optional[str] = None
    is_pass: Optional[bool] = None
    remark: Optional[str] = None
    marked_by_user_id: Optional[int] = None
    marked_at: Optional[datetime] = None


class MarksViewRead(BaseModel):
    exam_id: int
    exam_name: str
    exam_paper_id: int
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    class_id: int
    class_name: Optional[str] = None
    section_id: int
    section_label: Optional[str] = None
    max_marks: int
    pass_marks: int
    exam_date: date
    is_published: bool
    is_editable: bool  # false when exam is published
    rows: list[MarkRow]
    summary: dict  # {'scored': N, 'absent': N, 'exempt': N, 'unmarked': N, 'pass': N, 'fail': N}


class MyPaperRead(BaseModel):
    """One row in the teacher's "my exam papers" list."""
    model_config = ConfigDict(from_attributes=True)

    exam_paper_id: int
    exam_id: int
    exam_name: str
    exam_kind: str
    exam_is_published: bool
    subject_name: str
    subject_code: str
    class_id: int
    class_name: str
    exam_date: date
    max_marks: int
    pass_marks: int
    duration_minutes: Optional[int] = None
    section_count: int
    students_in_class: int
    marks_entered: int


class MarksSaveResult(BaseModel):
    saved: int
    skipped: int
    errors: list[dict] = []
