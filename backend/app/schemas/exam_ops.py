"""Shapes for running an exam.

The reads here are wide and flat on purpose: a seating plan and a duty roster
are printed far more often than they are queried, and a shape that matches
the sheet of paper needs no assembling on the way out.
"""
from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, Field

from app.core.enums import MarkStatus


class PaperLabel(BaseModel):
    """Enough of a paper to name it on any of these screens."""
    paper_id: int
    class_subject_id: int
    subject_name: str
    subject_code: Optional[str] = None
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    exam_date: date
    start_time: Optional[time] = None
    duration_minutes: Optional[int] = None
    max_marks: int
    pass_marks: int


# ---------- dashboard ----------


class DashboardPaper(PaperLabel):
    candidates: int
    marks_entered: int
    marks_complete: bool
    verified: bool
    allocated: int
    rooms_used: int
    fully_allocated: bool
    invigilators: int
    invigilators_missing: bool


class Blocker(BaseModel):
    """One reason results are not out yet, in words somebody can act on."""
    kind: str
    count: int
    detail: str


class ExamDashboard(BaseModel):
    exam_id: int
    exam_name: str
    kind: str
    start_date: date
    end_date: date
    is_published: bool
    marks_open: bool
    results_approved_at: Optional[datetime] = None
    papers: int
    candidates: int
    marks_entered: int
    marks_percent: float
    papers_verified: int
    papers_allocated: int
    rows: list[DashboardPaper]
    blockers: list[Blocker]
    ready_to_publish: bool


# ---------- datesheet ----------


class DatesheetPaper(PaperLabel):
    ends_at: time
    has_time: bool


class Clash(BaseModel):
    class_id: int
    class_name: Optional[str] = None
    exam_date: date
    papers: list[PaperLabel]


class DatesheetDay(BaseModel):
    date: date
    papers: list[DatesheetPaper]


class Datesheet(BaseModel):
    exam_id: int
    exam_name: str
    start_date: date
    end_date: date
    days: list[DatesheetDay]
    clashes: list[Clash]
    papers_without_time: int


# ---------- halls ----------


class ExamRoom(BaseModel):
    id: int
    name: str
    code: str
    kind: str
    capacity: int
    building: Optional[str] = None
    floor: Optional[str] = None


class SeatedStudent(BaseModel):
    student_id: int
    admission_no: str
    student_name: str
    roll_no: Optional[int] = None
    section_name: Optional[str] = None


class RoomSeating(BaseModel):
    room_id: int
    room_name: str
    capacity: int
    seated: int
    over_capacity: bool
    students: list[SeatedStudent]


class Allocation(PaperLabel):
    candidates: int
    seated: int
    rooms: list[RoomSeating]
    unplaced: list[SeatedStudent]


class AllocateIn(BaseModel):
    room_ids: list[int] = Field(..., min_length=1)


class MoveStudentIn(BaseModel):
    student_id: int
    room_id: int


# ---------- invigilation ----------


class DutyStaff(BaseModel):
    invigilation_id: int
    user_id: int
    name: str
    role: str
    is_chief: bool


class RoomDuty(BaseModel):
    room_id: int
    room_name: str
    seated: int
    staff: list[DutyStaff]


class Invigilators(PaperLabel):
    rooms: list[RoomDuty]
    unwatched: list[RoomDuty]


class AvailableStaff(BaseModel):
    user_id: int
    name: str
    role: str
    assigned_here: bool
    clash: Optional[str] = None
    available: bool


class AssignInvigilatorIn(BaseModel):
    room_id: int
    user_id: int
    is_chief: bool = False


class Duty(BaseModel):
    paper_id: int
    subject_name: str
    class_name: Optional[str] = None
    exam_date: date
    start_time: Optional[time] = None
    room_name: str
    is_chief: bool


class RosterPerson(BaseModel):
    user_id: int
    name: str
    role: str
    count: int
    duties: list[Duty]


class DutyRoster(BaseModel):
    exam_id: int
    staff: list[RosterPerson]
    total_duties: int


# ---------- admit cards ----------


class Sitting(BaseModel):
    paper_id: int
    subject_name: str
    subject_code: Optional[str] = None
    exam_date: date
    start_time: Optional[time] = None
    ends_at: time
    duration_minutes: Optional[int] = None
    max_marks: int
    room_name: Optional[str] = None
    building: Optional[str] = None


class AdmitCard(BaseModel):
    exam_id: int
    exam_name: str
    school_name: str
    school_address: Optional[str] = None
    student_id: int
    student_name: str
    admission_no: str
    roll_no: Optional[int] = None
    class_name: Optional[str] = None
    section_name: Optional[str] = None
    photo_url: Optional[str] = None
    sittings: list[Sitting]
    rooms_allocated: int


# ---------- components ----------


class ComponentIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    max_marks: int = Field(..., gt=0)
    pass_marks: int = Field(0, ge=0)


class ComponentsIn(BaseModel):
    components: list[ComponentIn]


class Component(ComponentIn):
    id: int
    sequence: int


class Components(PaperLabel):
    components: list[Component]
    allocated: int
    unallocated: int


class ComponentMarkRow(BaseModel):
    student_id: int
    admission_no: str
    student_name: str
    roll_no: Optional[int] = None
    section_name: Optional[str] = None
    status: str
    total: Optional[int] = None
    # keyed by component id as a string, because JSON object keys are strings
    values: dict[str, Optional[int]]


class ComponentHead(BaseModel):
    id: int
    name: str
    max_marks: int
    pass_marks: int


class ComponentMarks(PaperLabel):
    components: list[ComponentHead]
    rows: list[ComponentMarkRow]


class SaveComponentRow(BaseModel):
    student_id: int
    status: MarkStatus = MarkStatus.scored
    values: dict[str, Optional[int]]


class SaveComponentMarksIn(BaseModel):
    rows: list[SaveComponentRow]


# ---------- promotion ----------


class PromotionRow(BaseModel):
    student_id: int
    admission_no: str
    student_name: str
    class_id: int
    class_name: Optional[str] = None
    section_name: Optional[str] = None
    subjects: int
    passed: int
    failed: int
    absent: int
    unmarked: int
    obtained: int
    out_of: int
    percent: float
    suggestion: str
    because: str


class PromotionPreview(BaseModel):
    exam_id: int
    exam_name: str
    is_published: bool
    students: list[PromotionRow]
    counts: dict[str, int]
    total: int
