from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SubjectResult(BaseModel):
    exam_paper_id: int
    subject_name: str
    subject_code: str
    max_marks: int
    pass_marks: int
    exam_date: date
    status: Optional[str] = None  # 'scored' | 'absent' | 'exempt' | None (not marked yet)
    marks_obtained: Optional[int] = None
    grade: Optional[str] = None
    is_pass: Optional[bool] = None
    remark: Optional[str] = None


class ResultSummary(BaseModel):
    total_max: int
    total_obtained: int
    percentage: float
    overall_grade: str
    is_pass: bool  # all considered subjects passed
    subjects_total: int
    subjects_passed: int
    subjects_failed: int
    subjects_absent: int
    subjects_exempt: int
    subjects_pending: int  # not yet graded


class ExamResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    exam_id: int
    exam_name: str
    exam_kind: str
    start_date: date
    end_date: date
    is_published: bool
    published_at: Optional[datetime] = None
    student_id: int
    student_name: str
    student_admission_no: str
    student_roll_no: int
    class_name: Optional[str] = None
    section_name: Optional[str] = None
    subjects: list[SubjectResult]
    summary: ResultSummary


class ExamSummaryForList(BaseModel):
    exam_id: int
    exam_name: str
    exam_kind: str
    start_date: date
    end_date: date
    published_at: Optional[datetime] = None
    summary: ResultSummary
