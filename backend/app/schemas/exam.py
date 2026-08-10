from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import ExamKind


# CBSE 7-band grade scheme used across the app.
# (% lower bound, letter grade)
GRADE_BANDS = [
    (90, "A+"),
    (80, "A"),
    (70, "B+"),
    (60, "B"),
    (50, "C"),
    (40, "D"),
    (0, "F"),
]


def grade_for_percent(pct: float) -> str:
    for lower, letter in GRADE_BANDS:
        if pct >= lower:
            return letter
    return "F"


# ----- Exam Paper schemas -----

class ExamPaperBase(BaseModel):
    class_subject_id: int
    max_marks: int = Field(..., ge=1, le=999)
    pass_marks: int = Field(..., ge=0, le=999)
    exam_date: date
    duration_minutes: Optional[int] = Field(None, ge=1, le=600)

    @model_validator(mode="after")
    def _pass_le_max(self):
        if self.pass_marks > self.max_marks:
            raise ValueError("pass_marks cannot exceed max_marks")
        return self


class ExamPaperCreate(ExamPaperBase):
    pass


class ExamPaperUpdate(BaseModel):
    max_marks: Optional[int] = Field(None, ge=1, le=999)
    pass_marks: Optional[int] = Field(None, ge=0, le=999)
    exam_date: Optional[date] = None
    duration_minutes: Optional[int] = Field(None, ge=1, le=600)


class ExamPaperRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exam_id: int
    class_subject_id: int
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    class_name: Optional[str] = None
    max_marks: int
    pass_marks: int
    exam_date: date
    duration_minutes: Optional[int] = None
    marks_entered_count: int = 0


# ----- Exam schemas -----

class ExamBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    kind: ExamKind = ExamKind.term
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def _check_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class ExamCreate(ExamBase):
    academic_year_id: int


class ExamUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    kind: Optional[ExamKind] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ExamRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    academic_year_id: int
    academic_year_name: Optional[str] = None
    name: str
    kind: ExamKind
    start_date: date
    end_date: date
    is_published: bool
    published_at: Optional[datetime] = None
    created_at: datetime
    papers: list[ExamPaperRead] = []
    papers_count: int = 0
    total_marks_entered: int = 0


class UpcomingExamRead(BaseModel):
    id: int
    name: str
    kind: ExamKind
    start_date: date
    end_date: date
    is_published: bool
    papers_count: int
