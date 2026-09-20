from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import ChequeStatus, ConcessionKind, MoneyMode


class CategoryIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    is_active: bool = True


class CategoryRead(CategoryIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class ExpenseIn(BaseModel):
    spent_on: date
    category_id: int
    supplier_id: Optional[int] = None
    payee: Optional[str] = Field(None, max_length=160)
    amount: Decimal = Field(..., gt=0)
    tax_amount: Decimal = Field(Decimal("0"), ge=0)
    mode: MoneyMode
    reference: Optional[str] = Field(None, max_length=120)
    description: str = Field(..., min_length=2, max_length=300)
    bill_document_id: Optional[int] = None

    @model_validator(mode="after")
    def _check(self):
        if self.mode == MoneyMode.online:
            raise ValueError("Use bank transfer / UPI / card for expenses")
        if self.tax_amount > self.amount:
            raise ValueError("Tax can't exceed the amount")
        return self


class ExpenseRead(BaseModel):
    id: int
    spent_on: date
    category_id: int
    category_name: str
    supplier_id: Optional[int] = None
    payee_name: Optional[str] = None
    amount: Decimal
    tax_amount: Decimal
    mode: MoneyMode
    reference: Optional[str] = None
    description: str
    bill_document_id: Optional[int] = None
    recorded_by_name: Optional[str] = None
    is_void: bool
    void_reason: Optional[str] = None
    created_at: datetime


class VoidIn(BaseModel):
    reason: str = Field(..., min_length=3, max_length=300)


class IncomeIn(BaseModel):
    received_on: date
    source: str = Field(..., pattern=r"^(donation|rent|grant|interest|sponsorship|other)$")
    payer: str = Field(..., min_length=2, max_length=160)
    amount: Decimal = Field(..., gt=0)
    mode: MoneyMode
    reference: Optional[str] = Field(None, max_length=120)
    notes: Optional[str] = Field(None, max_length=300)


class IncomeRead(IncomeIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    receipt_no: str
    is_void: bool


class ChequeIn(BaseModel):
    student_id: int
    fee_ids: list[int] = Field(..., min_length=1, max_length=24)
    amount: Decimal = Field(..., gt=0)
    cheque_no: str = Field(..., pattern=r"^\d{6}$")
    bank_name: str = Field(..., min_length=2, max_length=120)
    drawer_name: Optional[str] = Field(None, max_length=160)
    cheque_date: date
    received_on: Optional[date] = None


class ChequeAction(BaseModel):
    action: str = Field(..., pattern=r"^(deposit|clear|bounce|return)$")
    on: Optional[date] = None
    bounce_reason: Optional[str] = Field(None, max_length=200)
    bounce_charge: Optional[Decimal] = Field(None, ge=0)
    bounce_fee_head_id: Optional[int] = None


class ChequeRead(BaseModel):
    id: int
    student_id: int
    student_name: str
    section_label: Optional[str] = None
    fee_ids: list[int]
    fees_label: str
    amount: Decimal
    cheque_no: str
    bank_name: str
    drawer_name: Optional[str] = None
    cheque_date: date
    received_on: date
    status: ChequeStatus
    deposited_on: Optional[date] = None
    cleared_on: Optional[date] = None
    bounce_reason: Optional[str] = None
    due_for_deposit: bool = False


class ConcessionIn(BaseModel):
    student_id: int
    fee_head_id: Optional[int] = None
    kind: ConcessionKind
    value: Decimal = Field(..., gt=0)
    reason: str = Field(..., min_length=2, max_length=80)
    valid_from: date
    valid_to: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=1000)
    apply_to_pending: bool = False  # also reduce this student's unpaid fees already raised

    @model_validator(mode="after")
    def _check(self):
        if self.kind == ConcessionKind.percent and self.value > 100:
            raise ValueError("A percentage can't exceed 100")
        if self.valid_to and self.valid_to < self.valid_from:
            raise ValueError("valid_to is before valid_from")
        return self


class ConcessionRead(BaseModel):
    id: int
    student_id: int
    student_name: str
    section_label: Optional[str] = None
    fee_head_id: Optional[int] = None
    fee_head_name: Optional[str] = None
    kind: ConcessionKind
    value: Decimal
    reason: str
    valid_from: date
    valid_to: Optional[date] = None
    approved_by_name: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    applied_to_pending: int = 0


class CollectionRead(BaseModel):
    id: int
    receipt_no: str
    collected_on: date
    student_id: int
    student_name: str
    section_label: Optional[str] = None
    fee_head_name: str
    period: str
    amount: Decimal
    mode: MoneyMode
    reference: Optional[str] = None
    collected_by_name: Optional[str] = None


class CashBook(BaseModel):
    from_date: date
    to_date: date
    income: dict  # {"fees": {mode: amt}, "fees_by_head": {head: amt}, "other": {source: amt}, "store": {payment: amt}}
    expenses: dict  # {"by_category": {cat: amt}, "payroll": amt, "refunds": amt}
    total_in: Decimal
    total_out: Decimal
    net: Decimal
    by_mode: dict[str, dict[str, Decimal]]  # {"cash": {"in": x, "out": y}}
    daily: list[dict]  # [{date, in, out}]
