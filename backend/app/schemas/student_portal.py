"""Shapes for the student portal and for the accounts behind it."""
from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, Field


class StudentProfile(BaseModel):
    student_id: int
    full_name: str
    admission_no: str
    roll_no: Optional[int] = None
    class_name: Optional[str] = None
    section_name: Optional[str] = None
    photo_url: Optional[str] = None
    school_name: str


# ---------- dashboard ----------


class HomeworkDue(BaseModel):
    homework_id: int
    title: str
    subject_name: Optional[str] = None
    due_date: date
    overdue: bool
    submitted: bool


class PeriodToday(BaseModel):
    period_number: int
    label: Optional[str] = None
    start_time: time
    end_time: time
    is_break: bool
    subject_name: Optional[str] = None
    teacher_name: Optional[str] = None


class AttendanceSummary(BaseModel):
    marked_days: int
    present: int
    absent: int
    half_day: int
    percent: float


class NoticeItem(BaseModel):
    notice_id: int
    title: str
    body: Optional[str] = None
    created_at: datetime


class RecentExam(BaseModel):
    exam_id: int
    name: str
    end_date: date


class StudentDashboard(StudentProfile):
    homework: list[HomeworkDue]
    homework_due: int
    homework_overdue: int
    timetable: list[PeriodToday]
    attendance: AttendanceSummary
    recent_exams: list[RecentExam]
    notices: list[NoticeItem]


# ---------- homework ----------


class HomeworkItem(BaseModel):
    """Whatever the shared homework serialiser returns; the portal shows it
    unchanged so a child and a parent are reading the same thing."""
    model_config = {"extra": "allow"}

    id: int
    title: str
    due_date: date


# ---------- results ----------


# Results reuse app/schemas/result.py — the same shapes the parent portal
# returns, so the two cannot drift into showing different things.


# ---------- accounts, from the office side ----------


class LoginCreated(BaseModel):
    """The password appears here once and is never readable again."""
    student_id: int
    admission_no: str
    student_name: str
    user_id: int
    password: str
    created: bool


class ClassLoginsCreated(BaseModel):
    class_id: int
    created: list[LoginCreated]
    reset: list[LoginCreated]
    total: int


class LoginStatusRow(BaseModel):
    student_id: int
    admission_no: str
    student_name: str
    roll_no: Optional[int] = None
    class_name: Optional[str] = None
    section_name: Optional[str] = None
    has_login: bool
    is_active: bool
    last_login_at: Optional[datetime] = None


class LoginRevoked(BaseModel):
    student_id: int
    has_login: bool
    is_active: bool
