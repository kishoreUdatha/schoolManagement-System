from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator

from app.core.enums import (
    AttemptStatus,
    BloomLevel,
    Difficulty,
    OnlineTestStatus,
    QuestionKind,
    ResultVisibility,
)


class OptionIn(BaseModel):
    key: str = Field(..., min_length=1, max_length=4)
    text: str = Field(..., min_length=1, max_length=1000)


class QuestionIn(BaseModel):
    subject_id: int
    class_level: Optional[str] = Field(None, max_length=60)
    chapter_id: Optional[int] = None
    topic: Optional[str] = Field(None, max_length=200)
    kind: QuestionKind
    text: str = Field(..., min_length=2, max_length=5000)
    options: list[OptionIn] = Field(default_factory=list, max_length=8)
    # choice kinds: {"keys": [...]}; numeric: {"value": x, "tolerance": t}; short: {} or {"model_answer": "..."}
    answer: dict[str, Any] = Field(default_factory=dict)
    explanation: Optional[str] = Field(None, max_length=5000)
    marks: Decimal = Field(Decimal(1), gt=0, le=100)
    bloom_level: BloomLevel
    difficulty: Difficulty = Difficulty.medium

    @model_validator(mode="after")
    def _check(self):
        k = self.kind
        if k == QuestionKind.true_false:
            self.options = [OptionIn(key="T", text="True"), OptionIn(key="F", text="False")]
        if k in (QuestionKind.single, QuestionKind.multiple, QuestionKind.true_false):
            keys = [o.key for o in self.options]
            if len(keys) < 2:
                raise ValueError("Add at least two options")
            if len(set(keys)) != len(keys):
                raise ValueError("Option keys must be unique")
            correct = self.answer.get("keys") or []
            if not isinstance(correct, list) or not correct or any(c not in keys for c in correct):
                raise ValueError("Mark the correct option(s)")
            if k != QuestionKind.multiple and len(correct) != 1:
                raise ValueError("Exactly one option must be correct")
            self.answer = {"keys": sorted(set(correct))}
        elif k == QuestionKind.numeric:
            try:
                value = float(self.answer.get("value"))
                tol = float(self.answer.get("tolerance") or 0)
            except (TypeError, ValueError):
                raise ValueError("Enter the correct numeric answer")
            if tol < 0:
                raise ValueError("Tolerance can't be negative")
            self.options, self.answer = [], {"value": value, "tolerance": tol}
        else:
            self.options = []
            model = (self.answer.get("model_answer") or "").strip()
            self.answer = {"model_answer": model[:5000]} if model else {}
        return self


class QuestionRead(BaseModel):
    id: int
    subject_id: int
    subject_name: str
    class_level: Optional[str]
    chapter_id: Optional[int]
    chapter_title: Optional[str]
    topic: Optional[str]
    kind: QuestionKind
    text: str
    options: list[OptionIn]
    answer: dict[str, Any]
    explanation: Optional[str]
    marks: Decimal
    bloom_level: BloomLevel
    difficulty: Difficulty
    is_active: bool
    used_in_tests: int = 0


class QuestionPage(BaseModel):
    total: int
    items: list[QuestionRead]
    by_bloom: dict[str, int]


# ---------- tests ----------


class TestIn(BaseModel):
    class_subject_id: int
    section_id: Optional[int] = None
    title: str = Field(..., min_length=2, max_length=200)
    instructions: Optional[str] = Field(None, max_length=5000)
    starts_at: datetime
    ends_at: datetime
    duration_minutes: int = Field(..., ge=1, le=600)
    shuffle_questions: bool = True
    shuffle_options: bool = True
    negative_marking: Decimal = Field(Decimal(0), ge=0, le=1)
    result_visibility: ResultVisibility = ResultVisibility.after_close

    @model_validator(mode="after")
    def _check(self):
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("Send times with a timezone offset")
        if self.ends_at <= self.starts_at:
            raise ValueError("The window must end after it starts")
        if (self.ends_at - self.starts_at).total_seconds() < self.duration_minutes * 60:
            raise ValueError("The window is shorter than the test duration")
        return self


class TestQuestionsIn(BaseModel):
    question_ids: list[int] = Field(..., min_length=1, max_length=200)
    marks: Optional[Decimal] = Field(None, gt=0, le=100)


class PickRule(BaseModel):
    count: int = Field(..., ge=1, le=100)
    bloom_level: Optional[BloomLevel] = None
    difficulty: Optional[Difficulty] = None
    chapter_id: Optional[int] = None
    kind: Optional[QuestionKind] = None


class AutoPickIn(BaseModel):
    rules: list[PickRule] = Field(..., min_length=1, max_length=20)


class OrderIn(BaseModel):
    question_ids: list[int] = Field(..., min_length=1)


class TestQuestionRead(QuestionRead):
    test_marks: Decimal
    sequence: int


class TestRead(BaseModel):
    id: int
    class_subject_id: int
    class_name: str
    subject_id: int
    subject_name: str
    section_id: Optional[int]
    audience_label: str
    title: str
    instructions: Optional[str]
    starts_at: datetime
    ends_at: datetime
    duration_minutes: int
    shuffle_questions: bool
    shuffle_options: bool
    negative_marking: Decimal
    result_visibility: ResultVisibility
    status: OnlineTestStatus
    is_open: bool
    question_count: int
    total_marks: Decimal
    attempts: int
    can_edit: bool
    by_bloom: dict[str, Decimal] = {}


class TestDetail(TestRead):
    questions: list[TestQuestionRead]


class AttemptRow(BaseModel):
    student_id: int
    student_name: str
    section_label: str
    attempt_id: Optional[int]
    status: Optional[AttemptStatus]
    started_at: Optional[datetime]
    submitted_at: Optional[datetime]
    auto_submitted: bool = False
    score: Optional[Decimal]
    max_score: Optional[Decimal]
    percent: Optional[int]
    pending_grading: int = 0


class QuestionStat(BaseModel):
    question_id: int
    sequence: int
    text: str
    kind: QuestionKind
    bloom_level: BloomLevel
    answered: int
    correct: int
    percent_correct: Optional[int]
    avg_marks: Optional[Decimal]


class BloomStat(BaseModel):
    bloom_level: BloomLevel
    max_marks: Decimal
    avg_percent: Optional[int]


class TestResults(BaseModel):
    test: TestRead
    eligible: int
    attempted: int
    average_percent: Optional[int]
    highest: Optional[Decimal]
    lowest: Optional[Decimal]
    rows: list[AttemptRow]
    questions: list[QuestionStat]
    blooms: list[BloomStat]


class GradeIn(BaseModel):
    marks: Decimal = Field(..., ge=0)
    comment: Optional[str] = Field(None, max_length=500)


# ---------- taking a test ----------


class PaperQuestion(BaseModel):
    question_id: int
    number: int
    kind: QuestionKind
    text: str
    options: list[OptionIn]
    marks: Decimal
    response: dict[str, Any] = {}


class Paper(BaseModel):
    attempt_id: int
    test_id: int
    title: str
    instructions: Optional[str]
    student_id: int
    student_name: str
    deadline_at: datetime
    seconds_left: int
    status: AttemptStatus
    questions: list[PaperQuestion]


class AnswersIn(BaseModel):
    # question_id -> response
    answers: dict[int, dict[str, Any]] = Field(..., max_length=200)


class ReviewQuestion(PaperQuestion):
    correct: dict[str, Any]
    explanation: Optional[str]
    is_correct: Optional[bool]
    marks_awarded: Optional[Decimal]
    teacher_comment: Optional[str]
    bloom_level: BloomLevel


class AttemptResult(BaseModel):
    attempt_id: int
    test_id: int
    title: str
    student_id: int
    student_name: str
    status: AttemptStatus
    submitted_at: Optional[datetime]
    auto_submitted: bool
    visible: bool
    score: Optional[Decimal] = None
    max_score: Optional[Decimal] = None
    percent: Optional[int] = None
    pending_grading: int = 0
    questions: list[ReviewQuestion] = []


class ChildTest(BaseModel):
    id: int
    title: str
    subject_name: str
    student_id: int
    student_name: str
    starts_at: datetime
    ends_at: datetime
    duration_minutes: int
    question_count: int
    total_marks: Decimal
    # upcoming | open | in_progress | done | missed
    state: str
    attempt_id: Optional[int] = None
    score: Optional[Decimal] = None
    percent: Optional[int] = None
    result_visible: bool = False
