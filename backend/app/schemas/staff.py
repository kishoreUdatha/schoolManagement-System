from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


StaffRole = Literal["teacher", "staff", "principal", "accountant"]


class StaffCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=160)
    email: str = Field(..., min_length=3, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    role: StaffRole = "teacher"
    employee_no: str = Field(..., min_length=1, max_length=40)
    designation: Optional[str] = Field(None, max_length=120)
    joining_date: Optional[date] = None


class StaffUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=160)
    phone: Optional[str] = Field(None, max_length=20)
    employee_no: Optional[str] = Field(None, min_length=1, max_length=40)
    designation: Optional[str] = Field(None, max_length=120)
    joining_date: Optional[date] = None


class StaffRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    employee_no: str
    designation: Optional[str] = None
    joining_date: Optional[date] = None
    created_at: datetime

    # Flattened user fields (handy for tables)
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str
    is_active: bool
    last_login_at: Optional[datetime] = None


class StaffCreateResponse(BaseModel):
    staff: StaffRead
    temporary_password: str = Field(
        ...,
        description="Show to school admin once — used by the new staff member to sign in",
    )


class StaffPasswordResetResponse(BaseModel):
    user_id: int
    temporary_password: str
