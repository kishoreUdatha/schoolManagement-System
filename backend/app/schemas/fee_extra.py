from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.core.enums import LateFeeBasis, MoneyMode, RefundStatus


class LateFeeRuleIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    fee_head_id: Optional[int] = None  # empty = applies to every head
    charge_head_id: int
    basis: LateFeeBasis = LateFeeBasis.per_day
    amount: Decimal = Field(..., gt=0, le=1_000_000)
    grace_days: int = Field(0, ge=0, le=365)
    max_amount: Optional[Decimal] = Field(None, gt=0, le=1_000_000)
    is_active: bool = True

    @model_validator(mode="after")
    def _check(self):
        if self.basis == LateFeeBasis.percent_per_month and self.amount > 100:
            raise ValueError("A percentage can't be more than 100")
        return self


class LateFeeRuleRead(BaseModel):
    id: int
    name: str
    fee_head_id: Optional[int]
    fee_head_name: Optional[str]
    charge_head_id: int
    charge_head_name: str
    basis: LateFeeBasis
    amount: Decimal
    grace_days: int
    max_amount: Optional[Decimal]
    is_active: bool


class LateFeeRow(BaseModel):
    student_fee_id: int
    student_id: int
    student_name: str
    period: str
    head_name: str
    due_date: date
    days_late: int
    outstanding: Decimal
    rule_name: str
    charge: Decimal
    already_charged: Decimal
    delta: Decimal


class LateFeePreview(BaseModel):
    date: date
    rules: int
    rows: list[LateFeeRow]
    total: Decimal


class ApplyLateFeesIn(BaseModel):
    on: Optional[date] = None
    notify_parents: bool = False


class ApplyResult(BaseModel):
    date: date
    created: int
    updated: int
    total: Decimal


class RefundIn(BaseModel):
    student_id: int
    student_fee_id: Optional[int] = None
    amount: Decimal = Field(..., gt=0, le=10_000_000)
    reason: str = Field(..., min_length=3, max_length=2000)
    mode: MoneyMode = MoneyMode.bank_transfer


class RefundDecideIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(None, max_length=500)


class RefundProcessIn(BaseModel):
    processed_on: date
    reference: Optional[str] = Field(None, max_length=120)


class RefundRead(BaseModel):
    id: int
    student_id: int
    student_name: str
    section_label: Optional[str]
    student_fee_id: Optional[int]
    fee_label: Optional[str]
    amount: Decimal
    reason: str
    mode: MoneyMode
    status: RefundStatus
    requested_by_name: Optional[str]
    created_at: datetime
    decided_by_name: Optional[str]
    decided_at: Optional[datetime]
    decision_note: Optional[str]
    processed_on: Optional[date]
    processed_by_name: Optional[str]
    reference: Optional[str]


class RefundOption(BaseModel):
    student_fee_id: int
    label: str
    paid: Decimal
    refundable: Decimal
    receipt_no: Optional[str]
