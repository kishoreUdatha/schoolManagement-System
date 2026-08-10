from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import StaffAttendanceStatus


class StaffAttendanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_full_name: Optional[str] = None
    user_role: Optional[str] = None
    date: date
    check_in_at: Optional[datetime] = None
    check_out_at: Optional[datetime] = None
    status: StaffAttendanceStatus
    manually_overridden: bool
    override_remark: Optional[str] = None
    override_by_user_id: Optional[int] = None


class StaffTodayRead(BaseModel):
    date: date
    has_record: bool
    check_in_at: Optional[datetime] = None
    check_out_at: Optional[datetime] = None
    status: Optional[StaffAttendanceStatus] = None
    is_holiday: bool
    holiday_name: Optional[str] = None
    school_start_time: Optional[str] = None
    manually_overridden: bool = False
    override_remark: Optional[str] = None


class CheckInResult(BaseModel):
    record: StaffAttendanceRead
    message: str


class HistorySummary(BaseModel):
    total_days: int
    present: int
    late: int
    absent: int
    on_leave: int
    sick: int
    holiday: int


class MonthHistoryRead(BaseModel):
    year: int
    month: int
    summary: HistorySummary
    records: list[StaffAttendanceRead]


class OverrideRequest(BaseModel):
    user_id: int
    date: date
    status: StaffAttendanceStatus
    remark: Optional[str] = Field(None, max_length=300)
