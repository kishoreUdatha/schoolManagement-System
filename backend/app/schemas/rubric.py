from typing import Optional

from pydantic import BaseModel, Field


class CriterionIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    max_points: float = Field(..., gt=0, le=1000)


class CriterionRead(BaseModel):
    id: int
    title: str
    description: Optional[str]
    max_points: float
    sequence: int


class RubricIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    description: Optional[str] = None
    subject_id: Optional[int] = None
    criteria: list[CriterionIn] = []


class RubricUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=160)
    description: Optional[str] = None
    subject_id: Optional[int] = None
    is_active: Optional[bool] = None


class RubricRead(BaseModel):
    id: int
    name: str
    description: Optional[str]
    subject_id: Optional[int]
    subject_name: Optional[str]
    created_by_name: Optional[str]
    is_active: bool
    in_use: bool
    max_total: float
    criteria: list[CriterionRead]


class ScoreIn(BaseModel):
    criterion_id: int
    points: float = Field(..., ge=0, le=1000)
    comment: Optional[str] = Field(None, max_length=500)


class ScoresIn(BaseModel):
    scores: list[ScoreIn] = Field(..., min_length=1)


class MarkedCriterion(BaseModel):
    criterion_id: int
    criterion_title: str
    description: Optional[str] = None
    max_points: float
    points: Optional[float] = None
    comment: Optional[str] = None


class Marking(BaseModel):
    rubric_id: int
    rubric_name: str
    max_total: float
    total: Optional[float]
    criteria: list[MarkedCriterion]
