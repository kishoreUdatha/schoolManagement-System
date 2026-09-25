from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import BehaviourPeriodKind


class BehaviourRatingBase(BaseModel):
    punctuality: int = Field(..., ge=1, le=5)
    participation: int = Field(..., ge=1, le=5)
    discipline: int = Field(..., ge=1, le=5)
    respect: int = Field(..., ge=1, le=5)
    teacher_note: Optional[str] = Field(None, max_length=2000)


class BehaviourRatingSave(BehaviourRatingBase):
    student_id: int
    period_kind: BehaviourPeriodKind = BehaviourPeriodKind.weekly
    # If omitted, server computes from today's date in school timezone
    period_key: Optional[str] = Field(
        None,
        max_length=10,
        description="YYYY-WNN for weekly, YYYY-MM for monthly. Defaults to current period.",
    )


class BehaviourRatingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    student_name: Optional[str] = None
    rated_by_user_id: Optional[int] = None
    rated_by_name: Optional[str] = None
    period_kind: BehaviourPeriodKind
    period_key: str
    punctuality: int
    participation: int
    discipline: int
    respect: int
    average: float
    teacher_note: Optional[str] = None
    ai_suggested: Optional[dict] = None
    created_at: datetime
    updated_at: datetime


class SectionViewRow(BaseModel):
    student_id: int
    admission_no: str
    roll_no: int
    full_name: str
    rating: Optional[BehaviourRatingRead] = None


class SectionViewRead(BaseModel):
    section_id: int
    section_label: Optional[str] = None
    period_kind: BehaviourPeriodKind
    period_key: str
    rows: list[SectionViewRow]


class AISuggestRequest(BaseModel):
    student_id: int
    note: str = Field(..., min_length=3, max_length=2000)


class AISuggestResponse(BaseModel):
    punctuality: int
    participation: int
    discipline: int
    respect: int
    rationale: str
    source: str  # 'stub' | 'claude'
