from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import AttendanceStatus


class AttendanceEntry(BaseModel):
    student_id: int
    status: AttendanceStatus
    remark: Optional[str] = Field(None, max_length=300)


class AttendanceSaveRequest(BaseModel):
    section_id: int
    date: date
    entries: list[AttendanceEntry] = Field(..., min_length=1, max_length=500)


class AttendanceRow(BaseModel):
    """One row per student in the roster — includes existing attendance if any."""
    model_config = ConfigDict(from_attributes=True)

    student_id: int
    admission_no: str
    roll_no: int
    full_name: str
    photo_url: Optional[str] = None
    status: Optional[AttendanceStatus] = None  # None = not yet marked
    remark: Optional[str] = None
    marked_by_user_id: Optional[int] = None
    marked_at: Optional[datetime] = None


class AttendanceViewRead(BaseModel):
    section_id: int
    section_label: Optional[str] = None
    date: date
    is_holiday: bool
    holiday_name: Optional[str] = None
    is_editable: bool
    edit_window_days: int
    rows: list[AttendanceRow]
    summary: dict  # {'present': N, 'absent': N, 'late': N, 'half_day': N, 'unmarked': N, 'total': N}


class AttendanceSaveResult(BaseModel):
    section_id: int
    date: date
    saved: int
    skipped: int
    errors: list[dict] = []
    absence_alerts_sent: int = 0
