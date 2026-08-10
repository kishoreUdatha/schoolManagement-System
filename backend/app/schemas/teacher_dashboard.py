from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TodayClassRow(BaseModel):
    period_id: int
    period_number: int
    start_time: str
    end_time: str
    section_id: int
    section_label: str
    subject_name: str
    subject_code: str
    is_break: bool


class ClassTeacherCard(BaseModel):
    section_id: int
    section_label: str
    class_id: int
    capacity: int


class TeacherDashboardRead(BaseModel):
    today_iso_date: str
    today_day_of_week: int
    todays_classes: list[TodayClassRow]
    class_teacher_of: list[ClassTeacherCard]
    unread_notices: int
    generated_at: datetime
