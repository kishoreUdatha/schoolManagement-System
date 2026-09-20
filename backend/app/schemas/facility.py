from datetime import date, time
from typing import Optional

from pydantic import BaseModel, Field

from app.core.enums import BookingStatus, RoomKind


class RoomIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    code: str = Field(..., min_length=1, max_length=20)
    kind: RoomKind = RoomKind.classroom
    capacity: Optional[int] = Field(None, ge=1, le=2000)
    building: Optional[str] = Field(None, max_length=80)
    floor: Optional[str] = Field(None, max_length=40)
    branch_id: Optional[int] = None
    section_id: Optional[int] = None
    notes: Optional[str] = Field(None, max_length=2000)
    is_active: bool = True


class RoomRead(BaseModel):
    id: int
    name: str
    code: str
    kind: RoomKind
    capacity: Optional[int]
    building: Optional[str]
    floor: Optional[str]
    branch_id: Optional[int]
    branch_name: Optional[str]
    section_id: Optional[int]
    section_label: Optional[str]
    notes: Optional[str]
    is_active: bool


class LabIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    code: str = Field(..., min_length=1, max_length=20)
    room_id: Optional[int] = None
    subject_id: Optional[int] = None
    in_charge_user_id: Optional[int] = None
    capacity: Optional[int] = Field(None, ge=1, le=500)
    equipment: Optional[str] = Field(None, max_length=5000)
    safety_notes: Optional[str] = Field(None, max_length=5000)
    is_active: bool = True


class LabRead(BaseModel):
    id: int
    name: str
    code: str
    room_id: Optional[int]
    room_name: Optional[str]
    subject_id: Optional[int]
    subject_name: Optional[str]
    in_charge_user_id: Optional[int]
    in_charge_name: Optional[str]
    capacity: Optional[int]
    equipment: Optional[str]
    safety_notes: Optional[str]
    is_active: bool
    upcoming_bookings: int = 0


class BookingIn(BaseModel):
    lab_id: int
    booking_date: date
    period_id: int
    section_id: Optional[int] = None
    class_subject_id: Optional[int] = None
    teacher_user_id: Optional[int] = None
    purpose: Optional[str] = Field(None, max_length=300)
    students: Optional[int] = Field(None, ge=1, le=500)


class BookingRead(BaseModel):
    id: int
    lab_id: int
    lab_name: str
    booking_date: date
    period_id: int
    period_number: int
    start_time: Optional[time]
    end_time: Optional[time]
    section_id: Optional[int]
    section_label: Optional[str]
    class_subject_id: Optional[int]
    subject_name: Optional[str]
    teacher_user_id: Optional[int]
    teacher_name: Optional[str]
    purpose: Optional[str]
    students: Optional[int]
    status: BookingStatus
    cancel_reason: Optional[str]


class LabSlot(BaseModel):
    lab_id: int
    lab_name: str
    free: bool
    booking_id: Optional[int]
    booked_for: Optional[str]
    booked_by: Optional[str]


class PeriodRow(BaseModel):
    period_id: int
    period_number: int
    start_time: time
    end_time: time
    labs: list[LabSlot]


class Availability(BaseModel):
    date: date
    is_holiday: bool
    holiday_name: Optional[str]
    labs: list[dict]
    periods: list[PeriodRow]
