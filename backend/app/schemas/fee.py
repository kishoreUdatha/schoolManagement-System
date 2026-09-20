from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import FeeStatus, LateFeeType


# --- Fee heads ---

class FeeHeadBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    code: str = Field(..., min_length=1, max_length=30)
    is_recurring: bool = True
    late_fee_type: LateFeeType = LateFeeType.none
    late_fee_value: Decimal = Field(default=Decimal("0"), ge=0)
    late_fee_after_days: int = Field(default=0, ge=0, le=365)


class FeeHeadCreate(FeeHeadBase):
    pass


class FeeHeadUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    code: Optional[str] = Field(None, min_length=1, max_length=30)
    is_recurring: Optional[bool] = None
    late_fee_type: Optional[LateFeeType] = None
    late_fee_value: Optional[Decimal] = Field(None, ge=0)
    late_fee_after_days: Optional[int] = Field(None, ge=0, le=365)
    is_active: Optional[bool] = None


class FeeHeadRead(FeeHeadBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool
    created_at: datetime


# --- Fee structures ---

class FeeStructureBase(BaseModel):
    academic_year_id: int
    class_id: int
    fee_head_id: int
    amount: Decimal = Field(..., ge=0)
    due_day_of_month: int = Field(default=10, ge=1, le=31)


class FeeStructureCreate(FeeStructureBase):
    pass


class FeeStructureUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, ge=0)
    due_day_of_month: Optional[int] = Field(None, ge=1, le=31)


class FeeStructureRead(FeeStructureBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    fee_head_name: str
    fee_head_code: str
    is_recurring: bool


# --- Student fees ---

class StudentFeeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int
    student_name: str
    section_label: Optional[str] = None
    fee_head_id: int
    fee_head_name: str
    fee_head_code: str
    period: str
    amount_due: Decimal
    amount_paid: Decimal
    amount_outstanding: Decimal
    due_date: date
    status: FeeStatus
    is_overdue: bool
    paid_at: Optional[datetime] = None
    payment_ref: Optional[str] = None
    payment_mode: Optional[str] = None
    notes: Optional[str] = None


class RecordPayment(BaseModel):
    amount_paid: Decimal = Field(..., gt=0)
    payment_mode: Optional[str] = Field(None, max_length=40)
    payment_ref: Optional[str] = Field(None, max_length=120)
    paid_at: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=300)


class GenerateMonthlyRequest(BaseModel):
    academic_year_id: int
    period: str = Field(
        ..., pattern=r"^\d{4}-\d{2}$",
        description="YYYY-MM, e.g. '2026-06'",
    )


class GenerateResult(BaseModel):
    created: int
    skipped: int
    period: str


class ChargeCorrection(BaseModel):
    """Fix a charge raised in error, before anything is collected against it."""

    amount_due: Optional[Decimal] = Field(None, gt=0)
    due_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=300)
