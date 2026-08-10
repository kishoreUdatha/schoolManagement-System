from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import HolidayType


class HolidayBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    type: HolidayType = HolidayType.school
    start_date: date
    end_date: date
    description: Optional[str] = Field(None, max_length=2000)

    @model_validator(mode="after")
    def _check_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class HolidayCreate(HolidayBase):
    pass


class HolidayUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    type: Optional[HolidayType] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    description: Optional[str] = Field(None, max_length=2000)


class HolidayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: HolidayType
    start_date: date
    end_date: date
    description: Optional[str] = None
    days: int  # span (inclusive)
    created_at: datetime
