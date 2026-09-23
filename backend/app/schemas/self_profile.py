"""What a member of staff sees and may change about themselves."""
from datetime import date
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class MyProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # the school's record of them: theirs to read, the office's to change
    staff_id: int
    user_id: int
    full_name: str
    email: Optional[str] = None
    employee_no: str
    role: str
    designation: Optional[str] = None
    department_name: Optional[str] = None
    joining_date: Optional[date] = None
    employment_type: Optional[str] = None
    reporting_manager_name: Optional[str] = None

    # theirs to keep up to date
    phone: Optional[str] = None
    address: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    qualification_summary: Optional[str] = None
    experience_years: Optional[Decimal] = None

    bank_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    pan: Optional[str] = None
    uan: Optional[str] = None


class MyProfileUpdate(BaseModel):
    """Only what a person may change about themselves. Their name, employee
    number, role, department and salary stay with the office."""

    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=2000)
    emergency_contact_name: Optional[str] = Field(None, max_length=160)
    emergency_contact_phone: Optional[str] = Field(None, max_length=20)
    emergency_contact_relation: Optional[str] = Field(None, max_length=60)
    qualification_summary: Optional[str] = Field(None, max_length=200)
    experience_years: Optional[Decimal] = Field(None, ge=0, le=70)

    bank_name: Optional[str] = Field(None, max_length=120)
    bank_account_no: Optional[str] = Field(None, pattern=r"^\d{6,34}$")
    bank_ifsc: Optional[str] = Field(None, pattern=r"^[A-Z]{4}0[A-Z0-9]{6}$")
    pan: Optional[str] = Field(None, pattern=r"^[A-Z]{5}\d{4}[A-Z]$")
    uan: Optional[str] = Field(None, pattern=r"^\d{12}$")
