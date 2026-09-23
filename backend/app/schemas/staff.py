from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import EmploymentType


StaffRole = Literal["teacher", "staff", "principal", "accountant"]


class StaffCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=160)
    email: str = Field(..., min_length=3, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    role: StaffRole = "teacher"
    employee_no: Optional[str] = Field(
        None, max_length=40, description="Left out, the school's next EMP number is used"
    )
    designation: Optional[str] = Field(None, max_length=120)
    joining_date: Optional[date] = None
    department_id: Optional[int] = None
    qualification_summary: Optional[str] = Field(None, max_length=200)
    experience_years: Optional[Decimal] = Field(None, ge=0, le=70)
    address: Optional[str] = Field(None, max_length=2000)
    emergency_contact_name: Optional[str] = Field(None, max_length=160)
    emergency_contact_phone: Optional[str] = Field(None, max_length=20)
    emergency_contact_relation: Optional[str] = Field(None, max_length=60)
    employment_type: Optional[EmploymentType] = None
    reporting_manager_id: Optional[int] = Field(None, description="Staff id of their manager")
    max_periods_per_week: Optional[int] = Field(None, ge=0, le=80)
    other_duty_periods: Optional[int] = Field(None, ge=0, le=80)
    other_duties: Optional[str] = Field(None, max_length=300)


class StaffUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=160)
    phone: Optional[str] = Field(None, max_length=20)
    employee_no: Optional[str] = Field(None, min_length=1, max_length=40)
    designation: Optional[str] = Field(None, max_length=120)
    joining_date: Optional[date] = None
    department_id: Optional[int] = None
    qualification_summary: Optional[str] = Field(None, max_length=200)
    experience_years: Optional[Decimal] = Field(None, ge=0, le=70)
    address: Optional[str] = Field(None, max_length=2000)
    emergency_contact_name: Optional[str] = Field(None, max_length=160)
    emergency_contact_phone: Optional[str] = Field(None, max_length=20)
    emergency_contact_relation: Optional[str] = Field(None, max_length=60)
    employment_type: Optional[EmploymentType] = None
    reporting_manager_id: Optional[int] = Field(None, description="Staff id of their manager")
    max_periods_per_week: Optional[int] = Field(None, ge=0, le=80)
    other_duty_periods: Optional[int] = Field(None, ge=0, le=80)
    other_duties: Optional[str] = Field(None, max_length=300)


class StaffRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    employee_no: str
    designation: Optional[str] = None
    joining_date: Optional[date] = None
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    created_at: datetime
    qualification_summary: Optional[str] = None
    experience_years: Optional[Decimal] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    employment_type: Optional[EmploymentType] = None
    reporting_manager_id: Optional[int] = None
    reporting_manager_name: Optional[str] = None
    max_periods_per_week: Optional[int] = None
    other_duty_periods: Optional[int] = None
    other_duties: Optional[str] = None

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
