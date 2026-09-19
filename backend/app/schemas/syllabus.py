from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.core.enums import LessonPlanStatus


class ChapterIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    planned_periods: Optional[int] = Field(None, ge=0, le=1000)
    # Only on create: initial topics, one per entry.
    topics: list[str] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def _check(self):
        if self.planned_start and self.planned_end and self.planned_end < self.planned_start:
            raise ValueError("Planned end is before the planned start")
        self.topics = [t.strip()[:300] for t in self.topics if t.strip()]
        return self


class TopicsIn(BaseModel):
    titles: list[str] = Field(..., min_length=1, max_length=200)


class TopicUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    planned_periods: Optional[int] = Field(None, ge=0, le=1000)


class OrderIn(BaseModel):
    ids: list[int] = Field(..., min_length=1)


class CopyIn(BaseModel):
    source_class_subject_id: int


class CoverageIn(BaseModel):
    section_id: int
    covered: bool
    covered_on: Optional[date] = None
    note: Optional[str] = Field(None, max_length=300)


class Coverage(BaseModel):
    covered_on: date
    note: Optional[str] = None
    lesson_plan_id: Optional[int] = None


class TopicRead(BaseModel):
    id: int
    title: str
    sequence: int
    planned_periods: Optional[int]
    # section_id -> coverage
    coverage: dict[int, Coverage] = {}


class ChapterRead(BaseModel):
    id: int
    title: str
    sequence: int
    description: Optional[str]
    planned_start: Optional[date]
    planned_end: Optional[date]
    planned_periods: Optional[int]
    topics: list[TopicRead]


class SectionProgress(BaseModel):
    section_id: int
    section_label: str
    covered: int
    total: int
    percent: int
    # topics whose chapter should be finished by today but aren't covered
    behind: int


class ClassSubjectSummary(BaseModel):
    class_subject_id: int
    class_id: int
    class_name: str
    subject_id: int
    subject_name: str
    teacher_user_id: Optional[int]
    teacher_name: Optional[str]
    chapters: int
    topics: int
    can_edit: bool
    sections: list[SectionProgress]


class SyllabusDetail(ClassSubjectSummary):
    items: list[ChapterRead]


# ---------- lesson plans ----------


class LessonPlanIn(BaseModel):
    class_subject_id: int
    section_id: int
    plan_date: date
    periods: int = Field(1, ge=1, le=20)
    title: str = Field(..., min_length=2, max_length=200)
    objectives: Optional[str] = Field(None, max_length=5000)
    activities: Optional[str] = Field(None, max_length=10000)
    resources: Optional[str] = Field(None, max_length=5000)
    assessment: Optional[str] = Field(None, max_length=5000)
    homework: Optional[str] = Field(None, max_length=5000)
    topic_ids: list[int] = Field(default_factory=list, max_length=50)


class ReviewIn(BaseModel):
    decision: Literal["approve", "return"]
    comment: Optional[str] = Field(None, max_length=5000)

    @model_validator(mode="after")
    def _check(self):
        if self.decision == "return" and not (self.comment or "").strip():
            raise ValueError("Say what needs to change when returning a plan")
        return self


class DeliverIn(BaseModel):
    delivered_on: date
    note: Optional[str] = Field(None, max_length=5000)


class PlanTopic(BaseModel):
    id: int
    title: str
    chapter_title: str


class LessonPlanRead(BaseModel):
    id: int
    teacher_user_id: int
    teacher_name: str
    class_subject_id: int
    subject_name: str
    section_id: int
    section_label: str
    plan_date: date
    periods: int
    title: str
    objectives: Optional[str]
    activities: Optional[str]
    resources: Optional[str]
    assessment: Optional[str]
    homework: Optional[str]
    status: LessonPlanStatus
    submitted_at: Optional[datetime]
    reviewed_by_name: Optional[str]
    reviewed_at: Optional[datetime]
    review_comment: Optional[str]
    delivered_on: Optional[date]
    delivery_note: Optional[str]
    topics: list[PlanTopic]


# ---------- parent ----------


class ChildTopic(BaseModel):
    title: str
    covered_on: Optional[date]


class ChildChapter(BaseModel):
    title: str
    planned_start: Optional[date]
    planned_end: Optional[date]
    topics: list[ChildTopic]


class ChildSubject(BaseModel):
    subject_name: str
    teacher_name: Optional[str]
    covered: int
    total: int
    percent: int
    chapters: list[ChildChapter]
