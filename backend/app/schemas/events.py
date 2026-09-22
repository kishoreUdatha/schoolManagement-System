from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import ConsentResponse, EventAudience, EventKind, PtmSlotStatus
from app.schemas.attachment import AttachmentRead


class _AudienceIn(BaseModel):
    audience: EventAudience = EventAudience.everyone
    class_id: Optional[int] = None
    section_id: Optional[int] = None


# ---------- events ----------


class EventIn(_AudienceIn):
    title: str = Field(..., min_length=2, max_length=200)
    kind: EventKind = EventKind.other
    start_date: date
    end_date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    venue: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    requires_consent: bool = False
    consent_deadline: Optional[date] = None
    fee_amount: Optional[Decimal] = Field(None, ge=0, le=10_000_000)
    coordinator: Optional[str] = Field(None, max_length=160)
    capacity: Optional[int] = Field(None, ge=1, le=100_000)

    @model_validator(mode="after")
    def _check(self):
        if self.end_date is None:
            self.end_date = self.start_date
        if self.end_date < self.start_date:
            raise ValueError("End date is before the start date")
        if self.end_time and not self.start_time:
            raise ValueError("Set a start time before an end time")
        if (
            self.start_time and self.end_time and self.start_date == self.end_date
            and self.end_time <= self.start_time
        ):
            raise ValueError("End time must be after the start time")
        if self.consent_deadline and self.consent_deadline > self.start_date:
            raise ValueError("Consent deadline must be on or before the event date")
        return self


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    kind: EventKind
    start_date: date
    end_date: date
    start_time: Optional[time]
    end_time: Optional[time]
    venue: Optional[str]
    description: Optional[str]
    audience: EventAudience
    class_id: Optional[int]
    section_id: Optional[int]
    audience_label: str = ""
    requires_consent: bool
    consent_deadline: Optional[date]
    fee_amount: Optional[Decimal]
    coordinator: Optional[str] = None
    capacity: Optional[int] = None
    is_published: bool
    published_at: Optional[datetime]
    is_cancelled: bool
    consent_yes: int = 0
    consent_no: int = 0
    attachments: list[AttachmentRead] = []  # circulars, permission slips


class ConsentRow(BaseModel):
    student_id: int
    student_name: str
    admission_no: Optional[str]
    class_label: Optional[str]
    response: Optional[ConsentResponse]
    note: Optional[str]
    responded_at: Optional[datetime]
    parent_name: Optional[str]


class ConsentReport(BaseModel):
    event: EventRead
    eligible: int
    yes: int
    no: int
    pending: int
    rows: list[ConsentRow]


class ConsentIn(BaseModel):
    student_id: int
    response: ConsentResponse
    note: Optional[str] = Field(None, max_length=300)


class ChildConsent(BaseModel):
    student_id: int
    student_name: str
    response: Optional[ConsentResponse]
    note: Optional[str]


class ParentEvent(EventRead):
    consent_open: bool = False
    children: list[ChildConsent] = []


# ---------- parent-teacher meetings ----------


class PtmSessionIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    meeting_date: date
    start_time: time
    end_time: time
    slot_minutes: int = Field(10, ge=5, le=120)
    venue: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=5000)
    class_id: Optional[int] = None
    section_id: Optional[int] = None
    booking_closes_at: Optional[datetime] = None

    @model_validator(mode="after")
    def _check(self):
        if self.end_time <= self.start_time:
            raise ValueError("End time must be after the start time")
        return self


class PtmSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    meeting_date: date
    start_time: time
    end_time: time
    slot_minutes: int
    venue: Optional[str]
    notes: Optional[str]
    class_id: Optional[int]
    section_id: Optional[int]
    scope_label: str = ""
    booking_closes_at: Optional[datetime]
    is_published: bool
    teacher_count: int = 0
    slot_count: int = 0
    booked_count: int = 0


class TeachersIn(BaseModel):
    user_ids: list[int] = Field(..., min_length=1, max_length=200)


class SlotRead(BaseModel):
    id: int
    start_time: time
    end_time: time
    status: PtmSlotStatus
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    class_label: Optional[str] = None
    parent_name: Optional[str] = None
    parent_note: Optional[str] = None
    meeting_mode: Optional[str] = None
    teacher_notes: Optional[str] = None


class TeacherSlots(BaseModel):
    teacher_user_id: int
    teacher_name: str
    slots: list[SlotRead]


class PtmSessionDetail(PtmSessionRead):
    teachers: list[TeacherSlots]


class BookIn(BaseModel):
    slot_id: int
    student_id: int
    note: Optional[str] = Field(None, max_length=300)
    meeting_mode: Literal["in_person", "video", "phone"] = "in_person"


class SlotOutcomeIn(BaseModel):
    status: PtmSlotStatus
    teacher_notes: Optional[str] = Field(None, max_length=5000)


class ParentSlot(BaseModel):
    id: int
    start_time: time
    end_time: time
    # open | mine | taken; "mine" carries the child it was booked for
    state: str
    student_id: Optional[int] = None
    status: Optional[PtmSlotStatus] = None
    meeting_mode: Optional[str] = None
    teacher_notes: Optional[str] = None


class ParentTeacher(BaseModel):
    teacher_user_id: int
    teacher_name: str
    # children this teacher teaches (class teacher or a subject teacher)
    teaches: list[int]
    slots: list[ParentSlot]


class ParentPtm(PtmSessionRead):
    booking_open: bool
    eligible_children: list[int]
    teachers: list[ParentTeacher]


class TeacherPtm(PtmSessionRead):
    slots: list[SlotRead]
    # who set it up: a teacher can publish only their own draft
    created_by_user_id: Optional[int] = None


# ---------- gallery ----------


class AlbumIn(_AudienceIn):
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    album_date: date
    event_id: Optional[int] = None


class PhotoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    caption: Optional[str]
    content_type: str
    size_bytes: int


class AlbumRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str]
    album_date: date
    event_id: Optional[int]
    audience: EventAudience
    class_id: Optional[int]
    section_id: Optional[int]
    audience_label: str = ""
    is_published: bool
    photo_count: int = 0
    cover_photo_id: Optional[int] = None


class AlbumDetail(AlbumRead):
    photos: list[PhotoRead]


class CaptionIn(BaseModel):
    caption: Optional[str] = Field(None, max_length=300)


# ---------- calendar ----------


class CalendarItem(BaseModel):
    # event | holiday | exam | ptm | ptm_slot
    type: str
    id: int
    title: str
    start_date: date
    end_date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    detail: Optional[str] = None
    is_draft: bool = False
    is_cancelled: bool = False
