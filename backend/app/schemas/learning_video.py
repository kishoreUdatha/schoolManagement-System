import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


# Accept: https://www.youtube.com/watch?v=ID, https://youtu.be/ID,
# https://m.youtube.com/watch?v=ID, https://youtube.com/shorts/ID
_YT_PATTERNS = [
    re.compile(r"(?:https?://)?(?:www\.|m\.)?youtube\.com/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})"),
    re.compile(r"(?:https?://)?youtu\.be/([A-Za-z0-9_-]{11})"),
    re.compile(r"(?:https?://)?(?:www\.|m\.)?youtube\.com/shorts/([A-Za-z0-9_-]{11})"),
    re.compile(r"(?:https?://)?(?:www\.|m\.)?youtube\.com/embed/([A-Za-z0-9_-]{11})"),
]


def extract_video_id(url: str) -> Optional[str]:
    url = url.strip()
    for pat in _YT_PATTERNS:
        m = pat.search(url)
        if m:
            return m.group(1)
    return None


class LearningVideoBase(BaseModel):
    title: str
    description: Optional[str] = None
    youtube_url: str

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("title cannot be blank")
        if len(v) > 200:
            raise ValueError("title too long")
        return v

    @field_validator("youtube_url")
    @classmethod
    def _check_url(cls, v: str) -> str:
        v = v.strip()
        if not extract_video_id(v):
            raise ValueError(
                "Not a recognised YouTube URL. Use a youtube.com/watch?v= or youtu.be/ link."
            )
        return v


class LearningVideoCreate(LearningVideoBase):
    class_subject_id: int


class LearningVideoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    youtube_url: Optional[str] = None

    @field_validator("youtube_url")
    @classmethod
    def _check_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not extract_video_id(v):
            raise ValueError("Not a recognised YouTube URL.")
        return v


class LearningVideoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    class_subject_id: int
    subject_name: Optional[str] = None
    subject_code: Optional[str] = None
    class_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    youtube_video_id: str
    youtube_url: str
    thumbnail_url: str
    embed_url: str
    teacher_user_id: int
    teacher_name: Optional[str] = None
    is_active: bool
    created_at: datetime

    # Story 15.2 — completion stats hydrated by the service
    completion_count: int = 0
    eligible_student_count: int = 0
    # Parent-view only: true if THIS child has marked completion
    is_completed: Optional[bool] = None
    completed_at: Optional[datetime] = None


class CompletionRosterRow(BaseModel):
    student_id: int
    admission_no: str
    roll_no: int
    full_name: str
    section_label: str
    completed: bool
    completed_at: Optional[datetime] = None


class CompletionRosterRead(BaseModel):
    video_id: int
    completion_count: int
    eligible_student_count: int
    rows: list[CompletionRosterRow]
