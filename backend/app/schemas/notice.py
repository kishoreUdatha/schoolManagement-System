from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import (
    NoticeAudience,
    NoticeChannel,
    NoticeStatus,
    NotificationCategory,
    RecipientStatus,
)


class NoticeBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1)
    audience: NoticeAudience
    audience_class_id: Optional[int] = None
    audience_section_id: Optional[int] = None
    audience_student_id: Optional[int] = None
    channels: list[NoticeChannel] = Field(default_factory=lambda: [NoticeChannel.in_app])
    attachment_url: Optional[str] = Field(None, max_length=500)
    scheduled_at: Optional[datetime] = None
    category: NotificationCategory = NotificationCategory.general
    # in-app path the parent app opens, e.g. "/parent/fees"
    link: Optional[str] = Field(None, max_length=300, pattern=r"^/")
    event_date: Optional[date] = None
    event_start_time: Optional[time] = None
    event_end_time: Optional[time] = None
    event_venue: Optional[str] = Field(None, max_length=200)

    @model_validator(mode="after")
    def _check_audience(self):
        if self.audience == NoticeAudience.class_parents and not self.audience_class_id:
            raise ValueError("audience_class_id is required when audience=class_parents")
        if self.audience == NoticeAudience.section_parents and not self.audience_section_id:
            raise ValueError("audience_section_id is required when audience=section_parents")
        if self.audience == NoticeAudience.single_parent and not self.audience_student_id:
            raise ValueError("audience_student_id is required when audience=single_parent")
        if not self.channels:
            raise ValueError("Pick at least one channel")
        return self


class NoticeCreate(NoticeBase):
    pass


class NoticeUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    body: Optional[str] = Field(None, min_length=1)
    audience: Optional[NoticeAudience] = None
    audience_class_id: Optional[int] = None
    audience_section_id: Optional[int] = None
    audience_student_id: Optional[int] = None
    channels: Optional[list[NoticeChannel]] = None
    attachment_url: Optional[str] = Field(None, max_length=500)
    scheduled_at: Optional[datetime] = None
    category: Optional[NotificationCategory] = None
    link: Optional[str] = Field(None, max_length=300, pattern=r"^/")
    event_date: Optional[date] = None
    event_start_time: Optional[time] = None
    event_end_time: Optional[time] = None
    event_venue: Optional[str] = Field(None, max_length=200)


class ChannelBreakdown(BaseModel):
    channel: NoticeChannel
    total: int
    sent: int
    delivered: int
    failed: int
    skipped: int


class NoticeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    body: str
    audience: NoticeAudience
    audience_class_id: Optional[int] = None
    audience_class_name: Optional[str] = None
    audience_section_id: Optional[int] = None
    audience_section_label: Optional[str] = None
    audience_student_id: Optional[int] = None
    audience_student_label: Optional[str] = None
    channels: list[NoticeChannel]
    attachment_url: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    category: NotificationCategory = NotificationCategory.general
    link: Optional[str] = None
    event_date: Optional[date] = None
    event_start_time: Optional[time] = None
    event_end_time: Optional[time] = None
    event_venue: Optional[str] = None
    sent_at: Optional[datetime] = None
    status: NoticeStatus
    created_by_user_id: Optional[int] = None
    created_at: datetime
    recipient_count: int
    delivery: list[ChannelBreakdown] = []


# --- Parent inbox ---

class InboxNotice(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    recipient_id: int  # the NoticeRecipient row id (for mark-read)
    notice_id: int
    title: str
    body: str
    attachment_url: Optional[str] = None
    category: NotificationCategory = NotificationCategory.general
    # in-app path to the record the notice is about (e.g. "/parent/fees")
    link: Optional[str] = None
    # the child it is about, when it is about one child
    student_id: Optional[int] = None
    event_date: Optional[date] = None
    event_start_time: Optional[time] = None
    event_end_time: Optional[time] = None
    event_venue: Optional[str] = None
    sent_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    status: RecipientStatus
