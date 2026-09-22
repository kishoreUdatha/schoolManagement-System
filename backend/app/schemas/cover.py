from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.core.enums import StudentLeaveKind, StudentLeaveStatus
from app.schemas.attachment import AttachmentRead


# ---------- substitutions ----------


class CoverSlot(BaseModel):
    timetable_entry_id: int
    period_id: int
    period_number: int
    start_time: time
    end_time: time
    section_id: int
    section_label: str
    subject_name: str
    absent_user_id: Optional[int]
    absent_name: Optional[str]
    # why cover is needed: leave | pending_leave | marked_absent | manual
    reason: str
    substitution_id: Optional[int] = None
    substitute_user_id: Optional[int] = None
    substitute_name: Optional[str] = None
    note: Optional[str] = None


class AbsentTeacher(BaseModel):
    user_id: int
    full_name: str
    reason: str
    leave_id: Optional[int] = None
    periods: int


class CoverDay(BaseModel):
    date: date
    day_of_week: int
    is_holiday: bool
    absent: list[AbsentTeacher]
    slots: list[CoverSlot]
    covered: int
    uncovered: int


class Candidate(BaseModel):
    user_id: int
    full_name: str
    # free | busy_teaching | busy_covering | on_leave | unavailable
    status: str
    detail: Optional[str] = None
    teaches_this_class: bool
    covers_this_week: int
    periods_today: int


class AssignIn(BaseModel):
    sub_date: date
    timetable_entry_id: int
    substitute_user_id: Optional[int] = None
    note: Optional[str] = Field(None, max_length=300)
    # allow a teacher who is teaching / unavailable (admin override)
    force: bool = False


class MySubstitution(BaseModel):
    id: int
    sub_date: date
    period_number: int
    start_time: time
    end_time: time
    section_label: str
    subject_name: str
    absent_name: Optional[str]
    note: Optional[str]


class UnavailabilityIn(BaseModel):
    user_id: int
    day_of_week: int = Field(..., ge=1, le=7)
    period_number: Optional[int] = Field(None, ge=1, le=20)
    reason: Optional[str] = Field(None, max_length=200)


class UnavailabilityRead(UnavailabilityIn):
    id: int
    full_name: str


class CoverStat(BaseModel):
    user_id: int
    full_name: str
    covers: int


# ---------- student leave ----------


class StudentLeaveIn(BaseModel):
    kind: StudentLeaveKind = StudentLeaveKind.sick
    from_date: date
    to_date: date
    reason: str = Field(..., min_length=3, max_length=2000)

    @model_validator(mode="after")
    def _check(self):
        if self.to_date < self.from_date:
            raise ValueError("The leave ends before it starts")
        if (self.to_date - self.from_date).days > 60:
            raise ValueError("A single leave can't be longer than 60 days")
        return self


class DecideIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(None, max_length=500)


class StudentLeaveRead(BaseModel):
    id: int
    student_id: int
    student_name: str
    section_id: int
    section_label: str
    kind: StudentLeaveKind
    from_date: date
    to_date: date
    days: int
    reason: str
    status: StudentLeaveStatus
    applied_by_name: Optional[str]
    created_at: datetime
    decided_by_name: Optional[str]
    decided_at: Optional[datetime]
    decision_note: Optional[str]
    can_decide: bool = False
    attachments: list[AttachmentRead] = []  # supporting documents (medical note…)


class StudentLeaveUpdate(BaseModel):
    """Change a leave request the school hasn't answered yet."""

    kind: Optional[StudentLeaveKind] = None
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    reason: Optional[str] = Field(None, min_length=3, max_length=2000)
