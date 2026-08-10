from datetime import time
from typing import Optional

from pydantic import BaseModel


class TimetableSlot(BaseModel):
    entry_id: int
    section_id: int
    section_label: str
    class_id: int
    class_name: str
    subject_id: int
    subject_name: str
    subject_code: str
    period_id: int
    period_number: int
    period_label: Optional[str] = None
    start_time: time
    end_time: time
    is_break: bool
    day_of_week: int
    day_label: str
    notes: Optional[str] = None


class TimetableDay(BaseModel):
    day_of_week: int
    day_label: str
    is_today: bool
    items: list[TimetableSlot]


class TeacherTimetableRead(BaseModel):
    today_day_of_week: int
    today_label: str
    current_time: time
    today: list[TimetableSlot]
    by_day: list[TimetableDay]
    next_class: Optional[TimetableSlot] = None
    total_entries: int
