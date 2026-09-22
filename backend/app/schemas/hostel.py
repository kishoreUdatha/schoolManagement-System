from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.core.enums import (
    ComplaintStatus,
    HostelAttendanceStatus,
    HostelKind,
    MealKind,
    OutingKind,
    OutingStatus,
    RollCallSession,
)


class HostelIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    kind: HostelKind
    warden_user_id: Optional[int] = None
    address: Optional[str] = Field(None, max_length=300)
    monthly_fee: Decimal = Field(Decimal("0"), ge=0)
    curfew: Optional[str] = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    is_active: bool = True


class HostelRead(HostelIn):
    id: int
    warden_name: Optional[str] = None
    warden_phone: Optional[str] = None
    rooms: int
    beds: int
    occupied: int


class RoomIn(BaseModel):
    room_no: str = Field(..., min_length=1, max_length=20)
    floor: Optional[str] = Field(None, max_length=20)
    room_type: Optional[str] = Field(None, max_length=40)
    beds: int = Field(..., ge=1, le=40)
    monthly_fee: Optional[Decimal] = Field(None, ge=0)


class RoomUpdate(BaseModel):
    floor: Optional[str] = Field(None, max_length=20)
    room_type: Optional[str] = Field(None, max_length=40)
    beds: Optional[int] = Field(None, ge=1, le=40)
    monthly_fee: Optional[Decimal] = Field(None, ge=0)
    is_active: Optional[bool] = None


class BedRead(BaseModel):
    id: int
    label: str
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    section_label: Optional[str] = None
    allocation_id: Optional[int] = None
    since: Optional[date] = None


class RoomRead(BaseModel):
    id: int
    room_no: str
    floor: Optional[str] = None
    room_type: Optional[str] = None
    monthly_fee: Optional[Decimal] = None
    effective_fee: Decimal
    is_active: bool
    beds: list[BedRead]


class AllocationIn(BaseModel):
    student_id: int
    bed_id: int
    start_date: Optional[date] = None


class Resident(BaseModel):
    allocation_id: int
    student_id: int
    student_name: str
    admission_no: str
    section_label: Optional[str] = None
    room_no: str
    bed_label: str
    since: date
    today: dict = {}  # {"morning": status, "night": status}
    # {"morning": {"checked_in_at", "is_late", "remark"}, ...}
    today_details: dict = {}
    out_now: bool = False


class RollCallMark(BaseModel):
    student_id: int
    status: HostelAttendanceStatus
    checked_in_at: Optional[time] = None
    is_late: bool = False  # only meaningful when present
    remark: Optional[str] = Field(None, max_length=300)


class RollCallIn(BaseModel):
    date: date
    session: RollCallSession
    marks: list[RollCallMark] = Field(..., min_length=1)


class OutingIn(BaseModel):
    student_id: int
    kind: OutingKind = OutingKind.outing
    leave_at: datetime
    return_by: datetime
    reason: str = Field(..., min_length=3, max_length=300)
    escort_name: Optional[str] = Field(None, max_length=160)

    @model_validator(mode="after")
    def _order(self):
        if self.return_by <= self.leave_at:
            raise ValueError("return_by must be after leave_at")
        return self


class ParentOutingIn(BaseModel):
    kind: OutingKind = OutingKind.home_leave
    leave_at: datetime
    return_by: datetime
    reason: str = Field(..., min_length=3, max_length=300)
    escort_name: Optional[str] = Field(None, max_length=160)

    @model_validator(mode="after")
    def _order(self):
        if self.return_by <= self.leave_at:
            raise ValueError("return_by must be after leave_at")
        return self


class OutingDecision(BaseModel):
    approve: bool
    note: Optional[str] = Field(None, max_length=300)


class OutingRead(BaseModel):
    id: int
    student_id: int
    student_name: str
    kind: OutingKind
    leave_at: datetime
    return_by: datetime
    reason: str
    escort_name: Optional[str] = None
    status: OutingStatus
    requested_by_name: Optional[str] = None
    requested_by_parent: bool = False
    decision_note: Optional[str] = None
    went_out_at: Optional[datetime] = None
    returned_at: Optional[datetime] = None
    overdue: bool = False
    late_by_minutes: Optional[int] = None


class MenuSlot(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    meal: MealKind
    items: str = Field(..., min_length=1, max_length=500)


class MenuIn(BaseModel):
    slots: list[MenuSlot]


class ComplaintIn(BaseModel):
    category: str = Field(..., pattern=r"^(maintenance|food|cleanliness|security|roommate|other)$")
    description: str = Field(..., min_length=5, max_length=2000)
    student_id: Optional[int] = None


class ComplaintUpdate(BaseModel):
    status: ComplaintStatus
    resolution: Optional[str] = Field(None, max_length=2000)


class ComplaintRead(BaseModel):
    id: int
    hostel_id: int
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    category: str
    description: str
    status: ComplaintStatus
    raised_by_name: Optional[str] = None
    resolution: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime


class HostelFeeGenerate(BaseModel):
    fee_head_id: int
    period: str = Field(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    due_day: int = Field(10, ge=1, le=31)


class ChildHostel(BaseModel):
    hostel_id: int
    hostel_name: str
    room_no: str
    bed_label: str
    since: date
    warden_name: Optional[str] = None
    warden_phone: Optional[str] = None
    curfew: Optional[str] = None
    menu_today: dict[str, str] = {}
    attendance_last_7_days: list[dict] = []


class TransferIn(BaseModel):
    """Move a resident to another bed in one step."""

    bed_id: int
    moved_on: Optional[date] = None  # defaults to today
