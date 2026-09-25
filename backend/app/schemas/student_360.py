"""The shape of one child's whole record, as the teacher's Student 360 reads it."""

from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel

from app.schemas.student_profile import BehaviourSnapshot, ParentContact


class Kpis(BaseModel):
    attendance_percent: Optional[float] = None
    average_percent: Optional[float] = None
    homework_done: int = 0
    homework_total: int = 0
    behaviour: Optional[str] = None
    transport: str
    fees_pending: float = 0.0


class TodayStatus(BaseModel):
    status: Optional[str] = None
    arrived_at: Optional[time] = None
    left_at: Optional[time] = None
    remark: Optional[str] = None


class SubjectRow(BaseModel):
    subject_name: str
    marks: list[Optional[float]] = []
    average: Optional[float] = None


class ExamRow(BaseModel):
    exam_id: int
    exam_name: str
    kind: str
    start_date: Optional[date] = None
    percent: float = 0.0
    obtained: int = 0
    out_of: int = 0
    marked: int = 0


class AcademicSummary(BaseModel):
    columns: list[str] = []
    rows: list[SubjectRow] = []
    average: Optional[float] = None
    exams: list[ExamRow] = []


class TrendDay(BaseModel):
    label: str
    date: date
    status: str
    value: int


class AttendanceDay(BaseModel):
    date: date
    status: str
    arrived_at: Optional[time] = None
    left_at: Optional[time] = None
    remark: Optional[str] = None


class Attendance(BaseModel):
    days_present: int
    days_absent: int
    days_late: int
    days_half_day: int
    days_marked: int
    attendance_percent: Optional[float] = None
    trend: list[TrendDay] = []
    recent: list[AttendanceDay] = []


class HomeworkRow(BaseModel):
    id: int
    title: str
    subject_name: Optional[str] = None
    due_date: date
    is_past_due: bool
    status: str
    submitted_at: Optional[datetime] = None
    marks: Optional[float] = None
    max_marks: Optional[float] = None
    teacher_remark: Optional[str] = None


class GuardianRow(BaseModel):
    guardian_id: int
    user_id: Optional[int] = None
    full_name: str
    relation: str
    phone: Optional[str] = None
    email: Optional[str] = None
    occupation: Optional[str] = None
    address: Optional[str] = None
    is_primary: bool = False
    can_pickup: bool = False
    is_emergency_contact: bool = False
    lives_with_student: bool = False


class Health(BaseModel):
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    current_medications: Optional[str] = None
    dietary_restrictions: Optional[str] = None
    disabilities: Optional[str] = None
    doctor_name: Optional[str] = None
    doctor_phone: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    notes: Optional[str] = None
    on_file: bool = False


class Transport(BaseModel):
    active: bool = False
    route_name: Optional[str] = None
    stop_name: Optional[str] = None
    direction: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class FeeRow(BaseModel):
    id: int
    head: Optional[str] = None
    period: Optional[str] = None
    due_date: date
    amount_due: float
    amount_paid: float
    status: str
    paid_at: Optional[datetime] = None


class Fees(BaseModel):
    total_due: float = 0.0
    total_paid: float = 0.0
    pending: float = 0.0
    rows: list[FeeRow] = []


class DocumentRow(BaseModel):
    id: int
    title: str
    original_name: str
    category: str
    size_bytes: int
    content_type: str
    uploaded_on: datetime


class UpcomingRow(BaseModel):
    kind: str
    title: str
    on: datetime
    note: Optional[str] = None


class ActivityRow(BaseModel):
    kind: str
    on: datetime
    title: str
    note: Optional[str] = None


class Student360Read(BaseModel):
    id: int
    admission_no: str
    full_name: str
    dob: Optional[date] = None
    gender: Optional[str] = None
    photo_url: Optional[str] = None
    address: Optional[str] = None
    is_active: bool
    roll_no: int
    joined_on: Optional[date] = None

    section_id: int
    section_name: Optional[str] = None
    class_name: Optional[str] = None
    class_label: Optional[str] = None
    academic_year_name: Optional[str] = None
    class_teacher_name: Optional[str] = None

    kpis: Kpis
    today: TodayStatus
    academic: AcademicSummary
    attendance: Attendance
    homework: list[HomeworkRow] = []
    notes: list[BehaviourSnapshot] = []
    parents: list[ParentContact] = []
    guardians: list[GuardianRow] = []
    health: Health
    transport: Transport
    fees: Fees
    documents: list[DocumentRow] = []
    upcoming: list[UpcomingRow] = []
    activity: list[ActivityRow] = []
