"""Per-child fee amounts, a student's ledger, and money owed to suppliers."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import FeeCounter, SchoolAdminOrAccountant
from app.core.enums import MoneyMode, PurchaseOrderStatus
from app.database import get_db
from app.services import finance_service


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class AssignmentIn(BaseModel):
    student_id: int
    fee_head_id: int
    academic_year_id: int
    amount: Decimal = Field(..., ge=0)
    period: Optional[str] = Field(None, max_length=7)
    due_day_of_month: int = Field(10, ge=1, le=31)
    reason: str = Field(..., min_length=3, max_length=2000)
    starts_on: date
    ends_on: Optional[date] = None


class AssignmentUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, ge=0)
    period: Optional[str] = Field(None, max_length=7)
    due_day_of_month: Optional[int] = Field(None, ge=1, le=31)
    reason: Optional[str] = Field(None, min_length=3, max_length=2000)
    starts_on: Optional[date] = None
    ends_on: Optional[date] = None
    is_active: Optional[bool] = None


class OrderLineIn(BaseModel):
    item_id: Optional[int] = None
    description: str = Field(..., min_length=1, max_length=300)
    qty: Decimal = Field(..., gt=0)
    unit_cost: Decimal = Field(..., ge=0)


class OrderIn(BaseModel):
    supplier_id: int
    order_no: str = Field(..., min_length=1, max_length=40)
    ordered_on: Optional[date] = None
    expected_on: Optional[date] = None
    status: Optional[PurchaseOrderStatus] = None
    notes: Optional[str] = None
    lines: list[OrderLineIn] = Field(..., min_length=1)


class ReceiveLineIn(BaseModel):
    line_id: int
    received_qty: Decimal = Field(..., ge=0)


class ReceiveIn(BaseModel):
    lines: list[ReceiveLineIn] = Field(..., min_length=1)


class BillIn(BaseModel):
    supplier_id: int
    order_id: Optional[int] = None
    bill_no: str = Field(..., min_length=1, max_length=60)
    billed_on: date
    due_on: Optional[date] = None
    amount: Decimal = Field(..., ge=0)
    tax_amount: Decimal = Field(0, ge=0)
    notes: Optional[str] = None


class VendorPaymentIn(BaseModel):
    bill_id: int
    amount: Decimal = Field(..., gt=0)
    paid_on: Optional[date] = None
    mode: Optional[MoneyMode] = None
    reference: Optional[str] = Field(None, max_length=120)


# ----- the fees office -----


@router.get("/dashboard", summary="Today, this month, and what is late")
def dashboard(user: SchoolAdminOrAccountant, db: Db):
    return finance_service.fee_dashboard(db, user.school_id)


@router.get("/assignments", summary="Children charged something other than their class")
def list_assignments(user: SchoolAdminOrAccountant, db: Db,
                     student_id: Optional[int] = None,
                     academic_year_id: Optional[int] = None,
                     active_only: bool = Query(False)):
    return finance_service.list_assignments(
        db, user.school_id, student_id=student_id,
        academic_year_id=academic_year_id, active_only=active_only,
    )


@router.post("/assignments", status_code=status.HTTP_201_CREATED,
             summary="Set one child's amount for one head")
def create_assignment(payload: AssignmentIn, user: SchoolAdminOrAccountant, db: Db):
    return finance_service.create_assignment(
        db, user.tenant_id, user.school_id, user.id, payload.model_dump()
    )


@router.patch("/assignments/{assignment_id}", summary="Change or end an assignment")
def update_assignment(assignment_id: int, payload: AssignmentUpdate,
                      user: SchoolAdminOrAccountant, db: Db):
    return finance_service.update_assignment(
        db, user.school_id, assignment_id,
        payload.model_dump(exclude_unset=True),
    )


@router.post("/assignments/{assignment_id}/apply",
             summary="Push the amount onto charges nobody has paid against")
def apply_assignment(assignment_id: int, user: SchoolAdminOrAccountant, db: Db):
    return finance_service.apply_assignment_to_unpaid(db, user.school_id, assignment_id)


@router.get("/ledger/{student_id}", summary="Every charge and receipt, with a balance")
def ledger(student_id: int, user: FeeCounter, db: Db):
    return finance_service.ledger(db, user.school_id, student_id)


# ----- suppliers -----


@router.get("/payables", summary="What each supplier is owed")
def payables(user: SchoolAdminOrAccountant, db: Db):
    return finance_service.payables(db, user.school_id)


@router.get("/orders", summary="Purchase orders")
def list_orders(user: SchoolAdminOrAccountant, db: Db,
                supplier_id: Optional[int] = None,
                order_status: Optional[PurchaseOrderStatus] = None):
    return finance_service.list_orders(
        db, user.school_id, supplier_id=supplier_id, status=order_status
    )


@router.post("/orders", status_code=status.HTTP_201_CREATED, summary="Raise an order")
def create_order(payload: OrderIn, user: SchoolAdminOrAccountant, db: Db):
    return finance_service.create_order(
        db, user.tenant_id, user.school_id, user.id, payload.model_dump()
    )


@router.post("/orders/{order_id}/receive", summary="Record what arrived")
def receive(order_id: int, payload: ReceiveIn, user: SchoolAdminOrAccountant, db: Db):
    return finance_service.receive_lines(
        db, user.school_id, order_id, [l.model_dump() for l in payload.lines]
    )


@router.get("/bills", summary="Supplier bills")
def list_bills(user: SchoolAdminOrAccountant, db: Db,
               supplier_id: Optional[int] = None, unpaid_only: bool = Query(False)):
    return finance_service.list_bills(
        db, user.school_id, supplier_id=supplier_id, unpaid_only=unpaid_only
    )


@router.post("/bills", status_code=status.HTTP_201_CREATED, summary="Record a bill")
def create_bill(payload: BillIn, user: SchoolAdminOrAccountant, db: Db):
    return finance_service.create_bill(
        db, user.tenant_id, user.school_id, payload.model_dump()
    )


@router.post("/payments", status_code=status.HTTP_201_CREATED,
             summary="Pay a bill; never more than it is for")
def pay(payload: VendorPaymentIn, user: SchoolAdminOrAccountant, db: Db):
    return finance_service.record_vendor_payment(
        db, user.tenant_id, user.school_id, user.id, payload.model_dump()
    )


# ----- the pack -----


@router.get("/report", summary="Money in against money out, over a window")
def report(user: SchoolAdminOrAccountant, db: Db,
           frm: Optional[date] = Query(None, alias="from"),
           to: Optional[date] = None):
    return finance_service.finance_report(db, user.school_id, frm=frm, to=to)
