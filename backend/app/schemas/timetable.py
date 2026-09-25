from datetime import datetime, time
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# --- Periods ---

class PeriodBase(BaseModel):
    day_of_week: int = Field(..., ge=1, le=7, description="1=Mon ... 7=Sun")
    period_number: int = Field(..., ge=1, le=20)
    start_time: time
    end_time: time
    label: Optional[str] = Field(None, max_length=60)
    is_break: bool = False

    @field_validator("end_time")
    @classmethod
    def _end_after_start(cls, v: time, info):
        start = info.data.get("start_time")
        if start is not None and v <= start:
            raise ValueError("end_time must be after start_time")
        return v


class PeriodCreate(PeriodBase):
    pass


class PeriodUpdate(BaseModel):
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    label: Optional[str] = Field(None, max_length=60)
    is_break: Optional[bool] = None


class PeriodRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    day_of_week: int
    period_number: int
    start_time: time
    end_time: time
    label: Optional[str] = None
    is_break: bool


# --- Timetable entries ---

class TimetableEntrySet(BaseModel):
    class_subject_id: int
    notes: Optional[str] = Field(None, max_length=200)


class TimetableEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    section_id: int
    period_id: int
    class_subject_id: int
    subject_name: str
    subject_code: str
    teacher_user_id: Optional[int] = None
    teacher_name: Optional[str] = None
    notes: Optional[str] = None


# --- Composite views ---

class ClassSubjectOption(BaseModel):
    id: int
    subject_id: int
    subject_name: str
    subject_code: str
    teacher_user_id: Optional[int] = None
    teacher_name: Optional[str] = None


class SectionTimetableRead(BaseModel):
    section_id: int
    section_label: Optional[str] = None
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    section_name: Optional[str] = None
    timetable_published_at: Optional[datetime] = None
    periods: list[PeriodRead] = []
    entries: list[TimetableEntryRead] = []
    class_subjects: list[ClassSubjectOption] = []
    # Filled by copy: slots left out (e.g. teacher clash), human-readable.
    skipped: list[str] = []


class TimetableClash(BaseModel):
    teacher_user_id: int
    teacher_name: Optional[str] = None
    day_of_week: int
    period_number: int
    sections: list[dict]  # [{section_id, section_label, subject_name}, ...]


class CopyTimetableRequest(BaseModel):
    source_section_id: int
    overwrite: bool = Field(
        default=False,
        description="If true, replaces existing entries in the destination",
    )


# --- Workspace scope / teacher view / HOD assignments ---

class ScopeSection(BaseModel):
    id: int
    name: str
    published: bool


class ScopeClass(BaseModel):
    id: int
    name: str
    academic_year_id: int
    sections: list[ScopeSection]


class ScopeYear(BaseModel):
    id: int
    name: str
    is_current: bool


class TimetableScopeRead(BaseModel):
    role: str
    school_wide: bool
    is_hod: bool
    academic_years: list[ScopeYear]
    classes: list[ScopeClass]


class TeacherLite(BaseModel):
    id: int
    full_name: str


class TeacherWeekEntry(BaseModel):
    id: int
    section_id: int
    section_label: str
    period_id: int
    class_subject_id: int
    subject_name: str
    subject_code: str
    notes: Optional[str] = None
    published: bool


class TeacherWeekRead(BaseModel):
    teacher_user_id: int
    teacher_name: str
    periods: list[PeriodRead]
    entries: list[TeacherWeekEntry]


class HodSection(BaseModel):
    section_id: int
    section_label: str


class HodAssignmentRead(BaseModel):
    teacher_user_id: int
    teacher_name: str
    sections: list[HodSection]


class HodAssignmentSet(BaseModel):
    section_ids: list[int] = Field(default_factory=list, max_length=500)
