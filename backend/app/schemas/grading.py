from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class BandIn(BaseModel):
    grade: str = Field(..., min_length=1, max_length=8)
    min_percent: Decimal = Field(..., ge=0, le=100)
    max_percent: Decimal = Field(..., ge=0, le=100)
    points: Optional[Decimal] = Field(None, ge=0, le=100)
    remark: Optional[str] = Field(None, max_length=120)
    is_pass: bool = True

    @model_validator(mode="after")
    def _check(self):
        if self.max_percent < self.min_percent:
            raise ValueError(f"Band {self.grade}: the top of the band is below the bottom")
        return self


class GradeScaleIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=1000)
    is_default: bool = False
    is_active: bool = True
    bands: list[BandIn] = Field(..., min_length=2, max_length=20)

    @model_validator(mode="after")
    def _check(self):
        bands = sorted(self.bands, key=lambda b: b.min_percent)
        grades = [b.grade.strip() for b in bands]
        if len(set(grades)) != len(grades):
            raise ValueError("Each grade can appear only once")
        if bands[0].min_percent != 0 or bands[-1].max_percent != 100:
            raise ValueError("Bands must run from 0 to 100")
        for lower, upper in zip(bands, bands[1:]):
            if upper.min_percent <= lower.max_percent:
                raise ValueError(f"Bands {lower.grade} and {upper.grade} overlap")
            if upper.min_percent - lower.max_percent > 1:
                raise ValueError(f"Nothing covers the marks between {lower.grade} and {upper.grade}")
        return self


class BandRead(BandIn):
    pass


class GradeScaleRead(BaseModel):
    id: int
    name: str
    description: Optional[str]
    is_default: bool
    is_active: bool
    used_by_exams: int
    bands: list[BandRead]


class ExamTypeIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    code: str = Field(..., min_length=1, max_length=20)
    weight_percent: Optional[Decimal] = Field(None, ge=0, le=100)
    display_order: int = Field(0, ge=0, le=999)
    is_active: bool = True


class ExamTypeRead(ExamTypeIn):
    id: int
    exams: int


class ReportCardSettingIn(BaseModel):
    show_attendance: bool = True
    show_rank: bool = False
    show_grade_scale: bool = True
    show_remarks: bool = True
    require_result_approval: bool = False
    principal_name: Optional[str] = Field(None, max_length=120)
    footer_note: Optional[str] = Field(None, max_length=2000)


class ReportCardSettingRead(ReportCardSettingIn):
    id: int


class RemarkIn(BaseModel):
    teacher_remark: Optional[str] = Field(None, max_length=2000)
    principal_remark: Optional[str] = Field(None, max_length=2000)


class RemarkRow(BaseModel):
    student_id: int
    student_name: str
    roll_no: int
    percentage: Optional[float] = None
    grade: Optional[str] = None
    rank: Optional[int] = None
    attendance_percent: Optional[int] = None
    teacher_remark: Optional[str] = None
    principal_remark: Optional[str] = None
    can_edit: bool = False
