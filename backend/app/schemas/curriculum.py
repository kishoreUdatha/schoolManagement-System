from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.core.enums import BloomLevel, ResourceKind


class TopicRef(BaseModel):
    id: int
    title: str


class OutcomeIn(BaseModel):
    class_subject_id: int
    chapter_id: Optional[int] = None
    code: str = Field(..., min_length=1, max_length=40)
    statement: str = Field(..., min_length=3)
    bloom_level: Optional[BloomLevel] = None
    topic_ids: list[int] = []


class OutcomeUpdate(BaseModel):
    chapter_id: Optional[int] = None
    code: Optional[str] = Field(None, min_length=1, max_length=40)
    statement: Optional[str] = Field(None, min_length=3)
    bloom_level: Optional[BloomLevel] = None
    sequence: Optional[int] = Field(None, ge=1)
    is_active: Optional[bool] = None
    topic_ids: Optional[list[int]] = None


class OutcomeRead(BaseModel):
    id: int
    class_subject_id: int
    chapter_id: Optional[int]
    chapter_title: Optional[str]
    code: str
    statement: str
    bloom_level: Optional[BloomLevel]
    sequence: int
    is_active: bool
    topics: list[TopicRef]
    # only filled when a section is asked about
    topics_covered: Optional[int] = None
    status: Optional[Literal["covered", "in_progress", "not_started"]] = None


class OutcomeCoverage(BaseModel):
    class_subject_id: int
    subject_name: str
    section_id: int
    section_label: Optional[str]
    total: int
    covered: int
    in_progress: int
    not_started: int
    unmapped: int
    outcomes: list[OutcomeRead]


class ResourceUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    kind: Optional[ResourceKind] = None
    url: Optional[str] = Field(None, max_length=600)
    chapter_id: Optional[int] = None
    topic_id: Optional[int] = None
    visible_to_parents: Optional[bool] = None
    is_active: Optional[bool] = None


class ResourceRead(BaseModel):
    id: int
    class_subject_id: int
    subject_name: Optional[str]
    chapter_id: Optional[int]
    chapter_title: Optional[str]
    topic_id: Optional[int]
    topic_title: Optional[str]
    title: str
    description: Optional[str]
    kind: ResourceKind
    url: Optional[str]
    file_name: Optional[str]
    size_bytes: Optional[int]
    has_file: bool
    visible_to_parents: bool
    downloads: int
    uploaded_by_name: Optional[str]
    created_at: datetime
    is_active: bool
