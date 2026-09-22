from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AcademicYearBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=40, description="e.g. '2026-27'")
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def _check_dates(self):
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class AcademicYearCreate(AcademicYearBase):
    is_current: bool = False
    admissions_open: bool = False
    admission_opens_on: Optional[date] = None


class AcademicYearUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=40)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    admissions_open: Optional[bool] = None
    admission_opens_on: Optional[date] = None

    @model_validator(mode="after")
    def _check_dates(self):
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date <= self.start_date
        ):
            raise ValueError("end_date must be after start_date")
        return self


class AcademicYearRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    school_id: int
    name: str
    start_date: date
    end_date: date
    is_current: bool
    is_archived: bool
    admissions_open: bool = False
    admission_opens_on: Optional[date] = None
    created_at: datetime
    updated_at: datetime
