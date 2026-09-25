from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class WeeklyReportGenerateRequest(BaseModel):
    section_id: int
    week_start: date
    teacher_remark: Optional[str] = Field(None, max_length=2000)
    share_with_parents: bool = True


class WeeklyReportSetRemark(BaseModel):
    teacher_remark: Optional[str] = Field(None, max_length=2000)
    share_with_parents: Optional[bool] = None


class WeeklyReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    student_name: Optional[str] = None
    student_admission_no: Optional[str] = None
    week_start: date
    week_end: date

    attendance_marked: int
    attendance_present: int
    attendance_absent: int
    attendance_late: int
    attendance_half_day: int
    attendance_pct: float

    homework_total: int
    homework_submitted: int
    homework_submission_pct: float

    marks_summary: Optional[dict] = None
    behaviour_avg: Optional[float] = None
    teacher_remark: Optional[str] = None
    ai_summary: Optional[str] = None
    generated_by_name: Optional[str] = None
    shared_at: Optional[datetime] = None
    created_at: datetime
