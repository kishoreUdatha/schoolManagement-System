from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel

from app.schemas.holiday import HolidayRead


class NoticeSummary(BaseModel):
    id: int
    title: str
    audience: str
    sent_at: Optional[datetime] = None
    recipient_count: int


class UpcomingExamSummary(BaseModel):
    id: int
    name: str
    kind: str
    start_date: date
    end_date: date
    is_published: bool
    papers_count: int


class Counts(BaseModel):
    students_active: int
    teachers_active: int
    non_teaching_active: int
    parents_active: int
    classes_current_year: int
    sections_current_year: int


class FeesSummary(BaseModel):
    pending_count: int
    pending_outstanding: Decimal
    overdue_count: int
    overdue_outstanding: Decimal
    paid_this_month: Decimal


class AdmissionsSummary(BaseModel):
    this_month_count: int
    last_30_days_count: int


class AttendanceSummary(BaseModel):
    available: bool
    as_of_date: Optional[date] = None
    marked: int = 0
    present: int = 0
    absent: int = 0
    late: int = 0
    half_day: int = 0
    attendance_pct: float = 0.0
    note: Optional[str] = None


class HomeworkSummary(BaseModel):
    available: bool
    since: Optional[datetime] = None
    total_homework: int = 0
    homework_with_submission: int = 0
    total_submissions: int = 0
    reviewed_submissions: int = 0
    submission_rate_pct: float = 0.0
    review_rate_pct: float = 0.0
    note: Optional[str] = None


class ExamPerformanceSummary(BaseModel):
    available: bool
    exam_id: Optional[int] = None
    exam_name: Optional[str] = None
    marks_count: int = 0
    average_pct: float = 0.0
    pass_rate_pct: float = 0.0
    note: Optional[str] = None


class ObservationsSummary(BaseModel):
    """Lessons sat in on (classroom observations)."""
    this_month: int = 0
    this_year: int = 0
    last_observed_on: Optional[date] = None


class NotificationsSummary(BaseModel):
    since: datetime
    sent_count: int
    total_recipients: int


class DashboardRead(BaseModel):
    current_academic_year_id: Optional[int] = None
    current_academic_year_name: Optional[str] = None
    counts: Counts
    fees: FeesSummary
    admissions: AdmissionsSummary
    upcoming_holidays: list[HolidayRead]
    latest_notices: list[NoticeSummary]
    upcoming_exams: list[UpcomingExamSummary]
    attendance: AttendanceSummary
    homework: HomeworkSummary
    exam_performance: ExamPerformanceSummary
    notifications: NotificationsSummary
    observations: Optional[ObservationsSummary] = None
    generated_at: datetime
