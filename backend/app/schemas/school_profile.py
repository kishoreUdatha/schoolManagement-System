from datetime import datetime, time
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import SchoolStatus

VALID_DAYS = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"}


class SchoolProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    code: str
    logo_url: Optional[str] = None
    address: Optional[str] = None
    timezone: str
    currency: str
    status: SchoolStatus

    # Branding (Story 21.1)
    brand_color: Optional[str] = None
    app_name: Optional[str] = None

    principal_name: Optional[str] = None
    phone_primary: Optional[str] = None
    phone_secondary: Optional[str] = None
    email: Optional[str] = None
    working_days: str
    school_start_time: Optional[time] = None
    school_end_time: Optional[time] = None
    break_start_time: Optional[time] = None
    break_end_time: Optional[time] = None

    created_at: datetime
    updated_at: datetime


class SchoolProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    logo_url: Optional[str] = Field(None, max_length=500)
    address: Optional[str] = None
    timezone: Optional[str] = Field(None, max_length=60)
    currency: Optional[str] = Field(None, max_length=8)

    # Branding (Story 21.1) — brand_color must be '#RRGGBB'
    brand_color: Optional[str] = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    app_name: Optional[str] = Field(None, max_length=60)

    principal_name: Optional[str] = Field(None, max_length=160)
    phone_primary: Optional[str] = Field(None, max_length=20)
    phone_secondary: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    working_days: Optional[str] = Field(
        None,
        description="Comma-separated day codes, e.g. 'MON,TUE,WED,THU,FRI,SAT'",
        max_length=40,
    )
    school_start_time: Optional[time] = None
    school_end_time: Optional[time] = None
    break_start_time: Optional[time] = None
    break_end_time: Optional[time] = None

    @field_validator("working_days")
    @classmethod
    def validate_days(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        parts = [p.strip().upper() for p in v.split(",") if p.strip()]
        if not parts:
            raise ValueError("working_days cannot be empty")
        for p in parts:
            if p not in VALID_DAYS:
                raise ValueError(
                    f"Invalid day '{p}'. Use any of: {','.join(sorted(VALID_DAYS))}"
                )
        return ",".join(parts)
