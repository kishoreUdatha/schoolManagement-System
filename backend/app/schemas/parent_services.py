"""Parent services: requests the school approves, help desk, surveys,
achievements, project milestones, canteen menu, school contact hours."""
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.core.enums import ParentRelation


RequestKind = Literal["link_child", "contact_change", "transport_change", "library_renewal"]
RequestStatus = Literal["pending", "approved", "rejected", "cancelled"]


# ---------- requests ----------


class LinkChildIn(BaseModel):
    admission_no: str = Field(..., min_length=1, max_length=40)
    date_of_birth: date
    relation: ParentRelation = ParentRelation.guardian
    note: Optional[str] = Field(None, max_length=500)


class ContactChangeIn(BaseModel):
    phone: Optional[str] = Field(None, min_length=6, max_length=20, pattern=r"^\+?[0-9 ()-]{6,20}$")
    email: Optional[str] = Field(None, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    reason: Optional[str] = Field(None, max_length=500)

    @model_validator(mode="after")
    def _something(self):
        if not self.phone and not self.email:
            raise ValueError("Give a new mobile number or email address")
        return self


TransportChangeType = Literal["change_stop", "start_service", "stop_service", "temporary_pause"]


class TransportChangeIn(BaseModel):
    request_type: TransportChangeType
    effective_from: date
    until: Optional[date] = None  # temporary pause only
    requested_stop_id: Optional[int] = None
    reason: str = Field(..., min_length=3, max_length=500)

    @model_validator(mode="after")
    def _check(self):
        if self.request_type in ("change_stop", "start_service") and not self.requested_stop_id:
            raise ValueError("Choose the stop you want")
        if self.until and self.until < self.effective_from:
            raise ValueError("The end date is before the start date")
        return self


class LibraryRenewalIn(BaseModel):
    loan_id: int
    note: Optional[str] = Field(None, max_length=300)


class RequestDecision(BaseModel):
    approve: bool
    note: Optional[str] = Field(None, max_length=500)
    # link_child only: the student the office matched, when the admission
    # number alone did not find them.
    student_id: Optional[int] = None


class ParentRequestRead(BaseModel):
    id: int
    kind: RequestKind
    status: RequestStatus
    parent_user_id: int
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_email: Optional[str] = None
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    section_label: Optional[str] = None
    details: dict[str, Any]
    summary: str
    reason: Optional[str] = None
    decided_by_name: Optional[str] = None
    decided_at: Optional[datetime] = None
    decision_note: Optional[str] = None
    created_at: datetime
    # link_child, school side only: the student the details point to (the
    # admission number and date of birth both match), if any.
    matched_student_id: Optional[int] = None
    matched_student_name: Optional[str] = None


# ---------- settings ----------


class ServiceSettingsIn(BaseModel):
    communication_hours: Optional[str] = Field(None, max_length=200)
    office_hours: Optional[str] = Field(None, max_length=200)
    office_phone: Optional[str] = Field(None, max_length=20)
    office_email: Optional[str] = Field(None, max_length=255)
    help_desk_note: Optional[str] = Field(None, max_length=300)


class ServiceSettingsRead(ServiceSettingsIn):
    school_name: Optional[str] = None


# ---------- help desk ----------


class TicketIn(BaseModel):
    student_id: Optional[int] = None
    category: str = Field(..., min_length=2, max_length=60)
    subject: str = Field(..., min_length=3, max_length=150)
    description: str = Field(..., min_length=5, max_length=5000)


class TicketReplyIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)


class TicketStatusIn(BaseModel):
    status: Literal["open", "in_progress", "resolved"]


class TicketReplyRead(BaseModel):
    id: int
    author_user_id: Optional[int] = None
    author_name: Optional[str] = None
    from_parent: bool
    body: str
    created_at: datetime


class TicketRead(BaseModel):
    id: int
    parent_user_id: int
    parent_name: Optional[str] = None
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    category: str
    subject: str
    status: Literal["open", "in_progress", "resolved"]
    assigned_to_name: Optional[str] = None
    last_activity_at: Optional[datetime] = None
    parent_unread: int
    last_reply: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    replies: Optional[list[TicketReplyRead]] = None


# ---------- surveys ----------


class SurveyQuestion(BaseModel):
    id: str = Field(..., min_length=1, max_length=20)
    text: str = Field(..., min_length=2, max_length=300)
    kind: Literal["rating", "choice", "text"] = "rating"
    options: list[str] = []
    required: bool = True


class SurveyIn(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    audience: Literal["all", "class"] = "all"
    class_id: Optional[int] = None
    questions: list[SurveyQuestion] = Field(..., min_length=1, max_length=30)
    status: Literal["draft", "open", "closed"] = "draft"
    closes_on: Optional[date] = None

    @model_validator(mode="after")
    def _check(self):
        if self.audience == "class" and not self.class_id:
            raise ValueError("Choose the class this survey is for")
        ids = [q.id for q in self.questions]
        if len(set(ids)) != len(ids):
            raise ValueError("Each question needs its own id")
        for q in self.questions:
            if q.kind == "choice" and len([o for o in q.options if o.strip()]) < 2:
                raise ValueError(f"Question '{q.text}' needs at least two options")
        return self


class SurveyStatusIn(BaseModel):
    status: Literal["draft", "open", "closed"]


class SurveyAnswerIn(BaseModel):
    answers: dict[str, Any]


class SurveyRead(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    audience: Literal["all", "class"]
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    questions: list[SurveyQuestion]
    status: Literal["draft", "open", "closed"]
    closes_on: Optional[date] = None
    created_at: datetime
    # school side
    response_count: Optional[int] = None
    audience_count: Optional[int] = None
    # parent side
    submitted: Optional[bool] = None
    submitted_at: Optional[datetime] = None
    my_answers: Optional[dict[str, Any]] = None


class SurveyQuestionResult(BaseModel):
    id: str
    text: str
    kind: str
    answered: int
    average: Optional[float] = None  # rating
    counts: dict[str, int] = {}  # rating / choice
    comments: list[str] = []  # text


class SurveyResults(BaseModel):
    survey: SurveyRead
    questions: list[SurveyQuestionResult]


# ---------- achievements ----------


AchievementCategory = Literal["academic", "reading", "sports", "arts", "service", "conduct", "other"]


class AchievementIn(BaseModel):
    student_id: int
    title: str = Field(..., min_length=2, max_length=160)
    category: AchievementCategory = "academic"
    description: Optional[str] = Field(None, max_length=2000)
    status: Literal["achieved", "in_progress"] = "achieved"
    achieved_on: Optional[date] = None
    target_value: Optional[int] = Field(None, ge=1)
    current_value: Optional[int] = Field(None, ge=0)
    unit: Optional[str] = Field(None, max_length=40)
    shared_with_parents: bool = True


class AchievementUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=160)
    description: Optional[str] = Field(None, max_length=2000)
    status: Optional[Literal["achieved", "in_progress"]] = None
    achieved_on: Optional[date] = None
    current_value: Optional[int] = Field(None, ge=0)
    target_value: Optional[int] = Field(None, ge=1)
    shared_with_parents: Optional[bool] = None


class AchievementRead(BaseModel):
    id: int
    student_id: int
    student_name: Optional[str] = None
    title: str
    category: str
    description: Optional[str] = None
    status: Literal["achieved", "in_progress"]
    achieved_on: Optional[date] = None
    target_value: Optional[int] = None
    current_value: Optional[int] = None
    unit: Optional[str] = None
    shared_with_parents: bool
    recorded_by_name: Optional[str] = None
    created_at: datetime


# ---------- projects & activities ----------


class MilestoneIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    due_on: Optional[date] = None
    position: int = Field(0, ge=0, le=100)


class MilestoneRead(BaseModel):
    id: int
    project_id: int
    title: str
    due_on: Optional[date] = None
    position: int


class ActivityMembershipRead(BaseModel):
    activity_id: int
    name: str
    kind: str
    description: Optional[str] = None
    day_of_week: Optional[int] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    venue: Optional[str] = None
    in_charge_name: Optional[str] = None
    role: Optional[str] = None
    joined_on: date
    left_on: Optional[date] = None


# ---------- weekly progress by subject ----------


class SubjectWeekRead(BaseModel):
    subject_name: str
    topics: list[str]
    homework_total: int
    homework_submitted: int
    marks_pct: Optional[float] = None
    label: Literal["on_track", "practice", "no_activity"]


# ---------- meals ----------


MealName = Literal["breakfast", "lunch", "snacks", "dinner"]


class MenuSlotIn(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    meal: MealName
    items: str = Field(..., min_length=1, max_length=500)


class CanteenMenuIn(BaseModel):
    slots: list[MenuSlotIn] = Field(..., max_length=28)


class MenuSlotRead(BaseModel):
    day_of_week: int
    meal: str
    items: str


class ChildMealMenu(BaseModel):
    source: Literal["hostel", "canteen", "none"]
    name: Optional[str] = None
    week: list[MenuSlotRead]


# ---------- transport ----------


class RouteStopRead(BaseModel):
    id: int
    name: str
    sequence: int
    pickup_time: Optional[time] = None
    drop_time: Optional[time] = None
    is_mine: bool


class StopOptionRead(BaseModel):
    stop_id: int
    stop_name: str
    route_id: int
    route_name: str
    pickup_time: Optional[time] = None
    drop_time: Optional[time] = None
    monthly_fee: Optional[Decimal] = None


# ---------- fees ----------


class CounterReceiptRead(BaseModel):
    id: int
    receipt_no: str
    student_id: int
    fee_head_name: Optional[str] = None
    period: Optional[str] = None
    amount: Decimal
    mode: str
    reference: Optional[str] = None
    collected_on: date


class AcademicYearOption(BaseModel):
    id: int
    name: str
    start_date: date
    end_date: date
    is_current: bool
