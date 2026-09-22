"""Parent-app views of one child's day: attendance by day and by period, the
dated timetable with cover, and the datesheet for exams still to come."""
from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel

from app.core.enums import AttendanceStatus


# ---------- attendance ----------


class AttendanceDayMark(BaseModel):
    date: date
    status: AttendanceStatus
    remark: Optional[str] = None
    arrived_at: Optional[time] = None
    left_at: Optional[time] = None


class HolidayDay(BaseModel):
    date: date
    name: str


class AttendanceMonthTotals(BaseModel):
    present: int
    absent: int
    late: int
    half_day: int
    marked: int
    attendance_percent: Optional[float] = None


class AttendanceMonth(BaseModel):
    month: str  # "YYYY-MM"
    days: list[AttendanceDayMark]
    holidays: list[HolidayDay]
    totals: AttendanceMonthTotals


class PeriodMark(BaseModel):
    period_id: int
    period_number: int
    label: Optional[str] = None
    start_time: time
    end_time: time
    subject_name: Optional[str] = None
    status: AttendanceStatus
    remark: Optional[str] = None


class AttendanceDay(BaseModel):
    date: date
    # null = not marked (yet) for this day
    status: Optional[AttendanceStatus] = None
    remark: Optional[str] = None
    arrived_at: Optional[time] = None
    left_at: Optional[time] = None
    marked_by_name: Optional[str] = None
    marked_at: Optional[datetime] = None
    holiday_name: Optional[str] = None
    on_approved_leave: bool = False
    periods: list[PeriodMark] = []


# ---------- dated timetable ----------


class TimetableSlot(BaseModel):
    period_id: int
    period_number: int
    label: Optional[str] = None
    start_time: time
    end_time: time
    is_break: bool
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    teacher_name: Optional[str] = None
    room_name: Optional[str] = None
    # cover for this date
    is_substituted: bool = False
    substitute_teacher_name: Optional[str] = None
    cover_note: Optional[str] = None


class TimetableDay(BaseModel):
    date: date
    day_of_week: int  # 1 = Monday ... 7 = Sunday
    section_label: Optional[str] = None
    holiday_name: Optional[str] = None
    slots: list[TimetableSlot]


# ---------- exam schedule ----------


class SchedulePaper(BaseModel):
    paper_id: int
    subject_name: str
    subject_code: Optional[str] = None
    exam_date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    duration_minutes: Optional[int] = None
    max_marks: int
    syllabus: Optional[str] = None
    room_name: Optional[str] = None


class ExamSchedule(BaseModel):
    exam_id: int
    exam_name: str
    exam_kind: str
    start_date: date
    end_date: date
    is_published: bool
    instructions: Optional[str] = None
    class_name: Optional[str] = None
    section_name: Optional[str] = None
    papers: list[SchedulePaper]
    admit_card_available: bool
