from datetime import date
from typing import Optional

from pydantic import BaseModel

from app.core.enums import AttendanceStatus


class DailyAbsentRow(BaseModel):
    student_id: int
    admission_no: str
    full_name: str
    roll_no: int
    section_id: int
    class_name: str
    section_name: str
    remark: Optional[str] = None


class ClassSummaryRow(BaseModel):
    class_id: int
    class_name: str
    section_id: int
    section_name: str
    total_marks: int
    present: int
    absent: int
    late: int
    half_day: int
    distinct_days: int
    distinct_students: int
    attendance_pct: float


class StudentMonthlyRow(BaseModel):
    student_id: int
    admission_no: str
    roll_no: int
    full_name: str
    present: int
    absent: int
    late: int
    half_day: int
    marked_days: int
    attendance_pct: float


class StudentMonthlyTotals(BaseModel):
    present: int
    absent: int
    late: int
    half_day: int


class StudentMonthlyReport(BaseModel):
    section_id: int
    section_label: Optional[str] = None
    year: int
    month: int
    from_date: date
    to_date: date
    rows: list[StudentMonthlyRow]
    totals: StudentMonthlyTotals
    overall_pct: float


class StudentHistoryDay(BaseModel):
    date: date
    status: AttendanceStatus
    remark: Optional[str] = None


class StudentHistoryMonth(BaseModel):
    month: str
    present: int
    absent: int
    late: int
    half_day: int
    percent: float


class StudentHistory(BaseModel):
    """One child's attendance, for the question asked at the office counter."""

    student_id: int
    student_name: str
    admission_no: str
    section_label: Optional[str] = None
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    marked_days: int
    present: int
    absent: int
    late: int
    half_day: int
    percent: float
    months: list[StudentHistoryMonth]
    days: list[StudentHistoryDay]
