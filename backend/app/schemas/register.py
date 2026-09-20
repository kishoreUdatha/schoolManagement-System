from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.core.enums import RegisterStatus, VisitPurpose, VisitStatus


class RegisterRow(BaseModel):
    section_id: int
    section_label: str
    date: date
    marked: bool
    marked_count: int
    status: RegisterStatus
    marked_by_name: Optional[str]
    locked_by_name: Optional[str]
    locked_at: Optional[datetime]
    reopened_by_name: Optional[str]
    reopen_reason: Optional[str]
    present: int
    absent: int


class LockIn(BaseModel):
    section_id: int
    date: date


class ReopenIn(LockIn):
    reason: str = Field(..., min_length=3, max_length=500)


class LockDayResult(BaseModel):
    date: date
    sections: int
    locked: int


class VisitorIn(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=160)
    phone: str = Field(..., min_length=6, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    company: Optional[str] = Field(None, max_length=160)
    id_type: Optional[str] = Field(None, max_length=40)
    id_last4: Optional[str] = Field(None, max_length=4)
    notes: Optional[str] = Field(None, max_length=2000)


class BlockIn(BaseModel):
    blocked: bool = True
    reason: Optional[str] = Field(None, max_length=500)


class VisitorRead(BaseModel):
    id: int
    full_name: str
    phone: str
    email: Optional[str]
    company: Optional[str]
    id_type: Optional[str]
    id_last4: Optional[str]
    notes: Optional[str]
    is_blocked: bool
    blocked_reason: Optional[str]
    blocked_by_name: Optional[str]
    blocked_at: Optional[datetime]
    visits: int
    last_visit_at: Optional[datetime]


class VisitorVisit(BaseModel):
    visit_id: int
    pass_no: Optional[str]
    purpose: VisitPurpose
    purpose_detail: Optional[str]
    host_name: Optional[str]
    status: VisitStatus
    expected_at: Optional[datetime]
    check_in_at: Optional[datetime]
    check_out_at: Optional[datetime]
