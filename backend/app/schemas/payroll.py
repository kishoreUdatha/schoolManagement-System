from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import PayrollRunStatus


Money = Decimal


class SettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    pf_employee_rate: Decimal
    pf_employer_rate: Decimal
    pf_wage_ceiling: Money
    esi_employee_rate: Decimal
    esi_employer_rate: Decimal
    esi_gross_ceiling: Money
    default_professional_tax: Money


class SettingsUpdate(BaseModel):
    pf_employee_rate: Optional[Decimal] = Field(None, ge=0, le=100)
    pf_employer_rate: Optional[Decimal] = Field(None, ge=0, le=100)
    pf_wage_ceiling: Optional[Money] = Field(None, ge=0)
    esi_employee_rate: Optional[Decimal] = Field(None, ge=0, le=100)
    esi_employer_rate: Optional[Decimal] = Field(None, ge=0, le=100)
    esi_gross_ceiling: Optional[Money] = Field(None, ge=0)
    default_professional_tax: Optional[Money] = Field(None, ge=0)


class SalaryIn(BaseModel):
    effective_from: date
    basic: Money = Field(..., ge=0)
    da: Money = Field(Decimal("0"), ge=0)
    hra: Money = Field(Decimal("0"), ge=0)
    conveyance: Money = Field(Decimal("0"), ge=0)
    special_allowance: Money = Field(Decimal("0"), ge=0)
    other_allowance: Money = Field(Decimal("0"), ge=0)
    pf_applicable: bool = True
    esi_applicable: bool = True
    professional_tax: Optional[Money] = Field(None, ge=0)
    tds_monthly: Money = Field(Decimal("0"), ge=0)
    bank_name: Optional[str] = Field(None, max_length=120)
    bank_account_no: Optional[str] = Field(None, max_length=34, pattern=r"^\d{6,34}$")
    bank_ifsc: Optional[str] = Field(None, pattern=r"^[A-Z]{4}0[A-Z0-9]{6}$")
    pan: Optional[str] = Field(None, pattern=r"^[A-Z]{5}\d{4}[A-Z]$")
    uan: Optional[str] = Field(None, pattern=r"^\d{12}$")


class SalaryRead(SalaryIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    staff_id: int
    monthly_gross: Money


class StaffPayRow(BaseModel):
    staff_id: int
    user_id: int
    full_name: str
    employee_no: str
    designation: Optional[str] = None
    is_active: bool
    salary: Optional[SalaryRead] = None


class RunCreate(BaseModel):
    period: str = Field(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


class RunRead(BaseModel):
    id: int
    period: str
    status: PayrollRunStatus
    staff_count: int
    total_gross: Money
    total_deductions: Money
    total_net: Money
    total_employer_cost: Money
    skipped_without_salary: list[str] = []
    finalized_at: Optional[datetime] = None
    paid_on: Optional[date] = None
    payment_ref: Optional[str] = None
    created_at: datetime


class PayslipRead(BaseModel):
    id: int
    run_id: int
    period: str
    run_status: PayrollRunStatus
    staff_id: int
    full_name: str
    employee_no: str
    designation: Optional[str] = None
    days_in_month: int
    lop_days: Decimal
    lop_days_auto: Decimal
    paid_days: Decimal
    basic: Money
    da: Money
    hra: Money
    conveyance: Money
    special_allowance: Money
    other_allowance: Money
    bonus: Money
    gross: Money
    pf_employee: Money
    esi_employee: Money
    professional_tax: Money
    tds: Money
    other_deduction: Money
    total_deductions: Money
    net_pay: Money
    pf_employer: Money
    esi_employer: Money
    remarks: Optional[str] = None


class RunDetail(RunRead):
    payslips: list[PayslipRead]


class PayslipAdjust(BaseModel):
    lop_days: Optional[Decimal] = Field(None, ge=0, le=31)
    bonus: Optional[Money] = Field(None, ge=0)
    other_deduction: Optional[Money] = Field(None, ge=0)
    tds: Optional[Money] = Field(None, ge=0)
    remarks: Optional[str] = Field(None, max_length=300)


class RunPaid(BaseModel):
    paid_on: date
    payment_ref: Optional[str] = Field(None, max_length=120)
