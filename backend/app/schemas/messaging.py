from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ConversationStartRequest(BaseModel):
    """Used by a parent to open a thread with a specific teacher about a child."""

    teacher_user_id: int
    student_id: int
    body: str = Field(..., min_length=1, max_length=5000)
    attachment_url: Optional[str] = Field(None, max_length=2000)


class MessageSend(BaseModel):
    body: str = Field(..., min_length=1, max_length=5000)
    attachment_url: Optional[str] = Field(None, max_length=2000)


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    sender_user_id: Optional[int] = None
    sender_name: Optional[str] = None
    sender_role: Optional[str] = None
    body: str
    attachment_url: Optional[str] = None
    is_read_by_recipient: bool
    created_at: datetime


class ConversationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parent_user_id: int
    parent_name: Optional[str] = None
    teacher_user_id: int
    teacher_name: Optional[str] = None
    student_id: int
    student_name: Optional[str] = None
    last_message_at: Optional[datetime] = None
    last_message_body: Optional[str] = None
    unread_for_viewer: int
    is_closed: bool = False
    created_at: datetime


class TeacherContactCard(BaseModel):
    teacher_user_id: int
    teacher_name: str
    subjects: list[str]


class ConversationClose(BaseModel):
    """Put a settled conversation away, or bring it back."""

    closed: bool = True
