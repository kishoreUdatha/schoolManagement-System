from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.core.enums import Gender, ParentRelation


class ParentContact(BaseModel):
    user_id: int
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    relation: ParentRelation


class AttendanceSummary(BaseModel):
    days_present: int
    days_absent: int
    days_late: int
    days_half_day: int
    days_marked: int  # any status
    attendance_percent: Optional[float] = None  # null when days_marked == 0


class BehaviourSnapshot(BaseModel):
    id: int
    period_kind: str
    period_key: str
    average: float
    punctuality: int
    participation: int
    discipline: int
    respect: int
    teacher_note: Optional[str] = None
    rated_by_name: Optional[str] = None
    created_at: datetime


class ExamPerformance(BaseModel):
    exam_id: int
    exam_name: str
    exam_kind: str
    published_at: Optional[datetime] = None
    percentage: float
    overall_grade: str
    is_pass: bool


class HomeworkSnapshot(BaseModel):
    id: int
    title: str
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    due_date: date
    is_past_due: bool


class StudentProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # Bio
    id: int
    admission_no: str
    full_name: str
    dob: Optional[date] = None
    gender: Optional[Gender] = None
    blood_group: Optional[str] = None
    photo_url: Optional[str] = None
    address: Optional[str] = None
    is_active: bool
    roll_no: int

    # Class / academic year
    section_id: int
    section_name: Optional[str] = None
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    academic_year_id: int
    academic_year_name: Optional[str] = None
    class_teacher_name: Optional[str] = None

    # Cross-module roll-up
    parents: list[ParentContact] = []
    attendance: AttendanceSummary
    behaviour_recent: list[BehaviourSnapshot] = []
    exams: list[ExamPerformance] = []
    homework_recent: list[HomeworkSnapshot] = []
    fees_pending_amount: float = 0.0
