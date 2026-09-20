"""Per-child fee plans, the ledger behind a bill, and money owed to suppliers.

Three things live here.

An assignment is the amount one child is charged for one head. It overrides
the class structure and can charge a head the class does not have — see
app/models/fee_plan.py for why that is not the same job as a concession, and
why both still exist.

A ledger is every charge and every receipt for one child in date order, with
a running balance. Nothing is stored: the balance is the arithmetic, and a
stored balance is a second opinion that drifts the first time a receipt is
corrected.

Payables are what a supplier is owed — their bills less their payments,
computed when asked, for the same reason.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import BillStatus, FeeStatus, MoneyMode, PurchaseOrderStatus
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.accounts import Expense, ExpenseCategory, FeeCollection
from app.models.fee import FeeHead, FeeStructure, StudentFee
from app.models.fee_plan import StudentFeeAssignment
from app.models.inventory import Supplier
from app.models.purchasing import (
    PurchaseOrder,
    PurchaseOrderLine,
    VendorBill,
    VendorPayment,
)
from app.models.student import Student
from app.models.user import User

ZERO = Decimal("0")

# The marker a generated row carries when nothing in the class structure asked
# for it. StudentFee already has a partial unique index on
# (student_id, source, source_id, period), so this gives idempotency for free
# rather than needing a constraint of its own.
ASSIGNMENT_SOURCE = "assignment"


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _400(why: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, why)


def _money(v) -> Decimal:
    return Decimal(v or 0)


# ---------- per-child amounts ----------


def active_assignment(
    db: Session, student_id: int, fee_head_id: int, academic_year_id: int, on: date
) -> Optional[StudentFeeAssignment]:
    """The one assignment in force for this child, head and day, if any.

    Called by fee generation. Returning at most one row is the point: two
    live answers to "what does she pay" is the state the unique constraint
    exists to prevent, and this is where the rest of the system relies on it.
    """
    return db.execute(
        select(StudentFeeAssignment).where(
            StudentFeeAssignment.student_id == student_id,
            StudentFeeAssignment.fee_head_id == fee_head_id,
            StudentFeeAssignment.academic_year_id == academic_year_id,
            StudentFeeAssignment.is_active.is_(True),
            StudentFeeAssignment.starts_on <= on,
            or_(
                StudentFeeAssignment.ends_on.is_(None),
                StudentFeeAssignment.ends_on >= on,
            ),
        )
    ).scalars().first()


def assignment_to_dict(db: Session, a: StudentFeeAssignment) -> dict:
    student = db.get(Student, a.student_id)
    head = db.get(FeeHead, a.fee_head_id)
    year = db.get(AcademicYear, a.academic_year_id)
    approver = db.get(User, a.approved_by_user_id) if a.approved_by_user_id else None

    # What the class would have charged, so the difference is visible rather
    # than something the reader has to go and look up.
    class_amount = None
    if student and student.section_id:
        section = db.get(Section, student.section_id)
        if section:
            structure = db.execute(
                select(FeeStructure).where(
                    FeeStructure.class_id == section.class_id,
                    FeeStructure.fee_head_id == a.fee_head_id,
                    FeeStructure.academic_year_id == a.academic_year_id,
                )
            ).scalars().first()
            if structure:
                class_amount = structure.amount

    return {
        "id": a.id,
        "student_id": a.student_id,
        "student_name": student.full_name if student else None,
        "admission_no": student.admission_no if student else None,
        "fee_head_id": a.fee_head_id,
        "fee_head_name": head.name if head else None,
        "academic_year_id": a.academic_year_id,
        "academic_year_name": year.name if year else None,
        "amount": a.amount,
        "class_amount": class_amount,
        "difference": (a.amount - class_amount) if class_amount is not None else None,
        "is_extra": class_amount is None,
        "period": a.period,
        "due_day_of_month": a.due_day_of_month,
        "reason": a.reason,
        "starts_on": a.starts_on,
        "ends_on": a.ends_on,
        "is_active": a.is_active,
        "approved_by": approver.full_name if approver else None,
    }


def list_assignments(
    db: Session, school_id: int, *, student_id: Optional[int] = None,
    academic_year_id: Optional[int] = None, active_only: bool = False,
) -> list[dict]:
    stmt = select(StudentFeeAssignment).where(
        StudentFeeAssignment.school_id == school_id
    )
    if student_id:
        stmt = stmt.where(StudentFeeAssignment.student_id == student_id)
    if academic_year_id:
        stmt = stmt.where(StudentFeeAssignment.academic_year_id == academic_year_id)
    if active_only:
        stmt = stmt.where(StudentFeeAssignment.is_active.is_(True))
    rows = db.execute(stmt.order_by(StudentFeeAssignment.created_at.desc())).scalars()
    return [assignment_to_dict(db, a) for a in rows]


def create_assignment(
    db: Session, tenant_id: int, school_id: int, actor_id: int, data: dict
) -> dict:
    student = db.get(Student, int(data["student_id"]))
    if not student or student.school_id != school_id:
        raise _404("Student")
    head = db.get(FeeHead, int(data["fee_head_id"]))
    if not head or head.school_id != school_id:
        raise _404("Fee head")
    year = db.get(AcademicYear, int(data["academic_year_id"]))
    if not year or year.school_id != school_id:
        raise _404("Academic year")
    if Decimal(str(data["amount"])) < 0:
        raise _400("An amount cannot be negative. To charge nothing, set it to zero.")
    if not str(data.get("reason") or "").strip():
        raise _400("Say why this child is charged differently.")
    ends = data.get("ends_on")
    if ends and ends < data["starts_on"]:
        raise _400("It cannot end before it starts.")

    row = StudentFeeAssignment(
        tenant_id=tenant_id,
        school_id=school_id,
        student_id=student.id,
        fee_head_id=head.id,
        academic_year_id=year.id,
        amount=Decimal(str(data["amount"])),
        period=(data.get("period") or None),
        due_day_of_month=int(data.get("due_day_of_month") or 10),
        reason=str(data["reason"]).strip(),
        starts_on=data["starts_on"],
        ends_on=ends,
        is_active=True,
        approved_by_user_id=actor_id,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{student.full_name} already has an amount set for {head.name} this year. "
            "Edit that one rather than adding a second.",
        )
    db.refresh(row)
    return assignment_to_dict(db, row)


def update_assignment(
    db: Session, school_id: int, assignment_id: int, data: dict
) -> dict:
    row = db.get(StudentFeeAssignment, assignment_id)
    if not row or row.school_id != school_id:
        raise _404("Assignment")

    for field in ("amount", "period", "due_day_of_month", "reason",
                  "starts_on", "ends_on", "is_active"):
        if field in data:
            setattr(row, field, data[field])
    if row.ends_on and row.ends_on < row.starts_on:
        raise _400("It cannot end before it starts.")
    if not str(row.reason or "").strip():
        raise _400("Say why this child is charged differently.")
    db.commit()
    db.refresh(row)
    return assignment_to_dict(db, row)


def apply_assignment_to_unpaid(
    db: Session, school_id: int, assignment_id: int
) -> dict:
    """Push a changed amount onto charges already raised — but only the ones
    nobody has paid against.

    A charge with money against it is part of a receipt. Rewriting it would
    make the receipt describe a bill that no longer exists, so those are left
    alone and reported back, for somebody to refund or waive deliberately.
    """
    row = db.get(StudentFeeAssignment, assignment_id)
    if not row or row.school_id != school_id:
        raise _404("Assignment")

    fees = list(db.execute(
        select(StudentFee).where(
            StudentFee.student_id == row.student_id,
            StudentFee.fee_head_id == row.fee_head_id,
            StudentFee.school_id == school_id,
            StudentFee.due_date >= row.starts_on,
        )
    ).scalars())

    changed, skipped = 0, []
    for fee in fees:
        if row.ends_on and fee.due_date > row.ends_on:
            continue
        if row.period and fee.period != row.period:
            continue
        if _money(fee.amount_paid) > 0 or fee.status == FeeStatus.paid:
            skipped.append({
                "fee_id": fee.id, "period": fee.period,
                "amount_due": fee.amount_due, "amount_paid": fee.amount_paid,
            })
            continue
        if fee.status == FeeStatus.waived:
            continue
        if fee.amount_due != row.amount:
            fee.amount_due = row.amount
            changed += 1
    db.commit()
    return {
        "assignment_id": assignment_id,
        "updated": changed,
        "left_alone": skipped,
        "left_alone_count": len(skipped),
    }


# ---------- one child's ledger ----------


def ledger(db: Session, school_id: int, student_id: int) -> dict:
    """Every charge and every receipt, in date order, with a running balance."""
    student = db.get(Student, student_id)
    if not student or student.school_id != school_id:
        raise _404("Student")

    fees = list(db.execute(
        select(StudentFee, FeeHead)
        .join(FeeHead, FeeHead.id == StudentFee.fee_head_id, isouter=True)
        .where(StudentFee.student_id == student_id)
    ).all())
    receipts = list(db.execute(
        select(FeeCollection).where(FeeCollection.student_id == student_id)
    ).scalars())

    entries = []
    for fee, head in fees:
        entries.append({
            "on": fee.due_date,
            "kind": "charge",
            "detail": f"{head.name if head else 'Fee'} · {fee.period}",
            "reference": None,
            "charged": _money(fee.amount_due),
            "paid": ZERO,
            "fee_id": fee.id,
            "status": fee.status.value,
            "note": fee.notes,
        })
    for r in receipts:
        entries.append({
            "on": r.collected_on,
            "kind": "receipt",
            "detail": f"Receipt {r.receipt_no}",
            "reference": r.reference,
            "charged": ZERO,
            "paid": _money(r.amount),
            "fee_id": r.student_fee_id,
            "status": None,
            "note": r.notes,
        })

    # A charge raised on the day a receipt lands is shown first: you cannot
    # pay a bill that has not been raised, and a balance that dips negative
    # for one line reads as an error.
    entries.sort(key=lambda e: (e["on"], 0 if e["kind"] == "charge" else 1))

    balance = ZERO
    for e in entries:
        balance += e["charged"] - e["paid"]
        e["balance"] = balance

    charged = sum((e["charged"] for e in entries), ZERO)
    paid = sum((e["paid"] for e in entries), ZERO)
    waived = sum(
        (_money(f.amount_due) for f, _ in fees if f.status == FeeStatus.waived), ZERO
    )
    section = db.get(Section, student.section_id) if student.section_id else None
    cls = db.get(SchoolClass, section.class_id) if section else None

    return {
        "student_id": student.id,
        "student_name": student.full_name,
        "admission_no": student.admission_no,
        "class_name": cls.name if cls else None,
        "section_name": section.name if section else None,
        "entries": entries,
        "total_charged": charged,
        "total_paid": paid,
        "total_waived": waived,
        "balance": balance,
    }


# ---------- suppliers ----------


def _bill_paid(db: Session, bill_id: int) -> Decimal:
    return _money(db.execute(
        select(func.coalesce(func.sum(VendorPayment.amount), 0))
        .where(VendorPayment.bill_id == bill_id)
    ).scalar_one())


def bill_to_dict(db: Session, b: VendorBill) -> dict:
    supplier = db.get(Supplier, b.supplier_id)
    paid = _bill_paid(db, b.id)
    total = _money(b.amount) + _money(b.tax_amount)
    return {
        "id": b.id,
        "supplier_id": b.supplier_id,
        "supplier_name": supplier.name if supplier else None,
        "order_id": b.order_id,
        "bill_no": b.bill_no,
        "billed_on": b.billed_on,
        "due_on": b.due_on,
        "amount": _money(b.amount),
        "tax_amount": _money(b.tax_amount),
        "total": total,
        "paid": paid,
        "outstanding": total - paid,
        "status": b.status.value,
        "overdue": bool(
            b.due_on and b.due_on < date.today()
            and b.status not in (BillStatus.paid, BillStatus.cancelled)
        ),
        "notes": b.notes,
    }


def record_vendor_payment(
    db: Session, tenant_id: int, school_id: int, actor_id: int, data: dict
) -> dict:
    bill = db.get(VendorBill, int(data["bill_id"]))
    if not bill or bill.school_id != school_id:
        raise _404("Bill")
    if bill.status == BillStatus.cancelled:
        raise _400("That bill has been cancelled.")

    amount = Decimal(str(data["amount"]))
    if amount <= 0:
        raise _400("A payment has to be more than nothing.")

    total = _money(bill.amount) + _money(bill.tax_amount)
    already = _bill_paid(db, bill.id)
    if already + amount > total:
        raise _400(
            f"That is more than the bill. {total - already} is outstanding "
            f"on a bill of {total}."
        )

    db.add(VendorPayment(
        tenant_id=tenant_id, school_id=school_id, bill_id=bill.id,
        paid_on=data.get("paid_on") or date.today(),
        amount=amount,
        mode=MoneyMode(data.get("mode") or MoneyMode.bank_transfer.value),
        reference=data.get("reference"),
        paid_by_user_id=actor_id,
    ))
    now_paid = already + amount
    bill.status = (
        BillStatus.paid if now_paid >= total
        else BillStatus.part_paid if now_paid > 0
        else BillStatus.unpaid
    )
    db.commit()
    return bill_to_dict(db, bill)


def payables(db: Session, school_id: int) -> dict:
    """What each supplier is owed, worked out rather than stored."""
    suppliers = list(db.execute(
        select(Supplier).where(Supplier.school_id == school_id)
    ).scalars())

    rows, total_owed, total_overdue = [], ZERO, ZERO
    for s in suppliers:
        bills = list(db.execute(
            select(VendorBill).where(
                VendorBill.supplier_id == s.id,
                VendorBill.status != BillStatus.cancelled,
            )
        ).scalars())
        if not bills:
            continue
        billed = sum((_money(b.amount) + _money(b.tax_amount) for b in bills), ZERO)
        paid = sum((_bill_paid(db, b.id) for b in bills), ZERO)
        overdue = sum(
            (
                (_money(b.amount) + _money(b.tax_amount) - _bill_paid(db, b.id))
                for b in bills
                if b.due_on and b.due_on < date.today() and b.status != BillStatus.paid
            ),
            ZERO,
        )
        owed = billed - paid
        total_owed += owed
        total_overdue += overdue
        rows.append({
            "supplier_id": s.id,
            "supplier_name": s.name,
            "phone": s.phone,
            "email": s.email,
            "gstin": s.gstin,
            "is_active": s.is_active,
            "bills": len(bills),
            "billed": billed,
            "paid": paid,
            "outstanding": owed,
            "overdue": overdue,
            "unpaid_bills": sum(1 for b in bills if b.status != BillStatus.paid),
        })

    rows.sort(key=lambda r: -r["outstanding"])
    return {
        "suppliers": rows,
        "total_outstanding": total_owed,
        "total_overdue": total_overdue,
        "suppliers_owed": sum(1 for r in rows if r["outstanding"] > 0),
    }


# ---------- purchase orders ----------


def order_to_dict(db: Session, o: PurchaseOrder) -> dict:
    supplier = db.get(Supplier, o.supplier_id)
    lines = list(db.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.order_id == o.id)
        .order_by(PurchaseOrderLine.id)
    ).scalars())
    billed = _money(db.execute(
        select(func.coalesce(func.sum(VendorBill.amount + VendorBill.tax_amount), 0))
        .where(VendorBill.order_id == o.id, VendorBill.status != BillStatus.cancelled)
    ).scalar_one())
    return {
        "id": o.id,
        "supplier_id": o.supplier_id,
        "supplier_name": supplier.name if supplier else None,
        "order_no": o.order_no,
        "ordered_on": o.ordered_on,
        "expected_on": o.expected_on,
        "status": o.status.value,
        "notes": o.notes,
        "total": _money(o.total),
        "billed": billed,
        "unbilled": _money(o.total) - billed,
        "lines": [
            {
                "id": ln.id,
                "item_id": ln.item_id,
                "description": ln.description,
                "qty": _money(ln.qty),
                "unit_cost": _money(ln.unit_cost),
                "line_total": _money(ln.qty) * _money(ln.unit_cost),
                "received_qty": _money(ln.received_qty),
                "outstanding_qty": _money(ln.qty) - _money(ln.received_qty),
            }
            for ln in lines
        ],
    }


def create_order(
    db: Session, tenant_id: int, school_id: int, actor_id: int, data: dict
) -> dict:
    supplier = db.get(Supplier, int(data["supplier_id"]))
    if not supplier or supplier.school_id != school_id:
        raise _404("Supplier")
    lines = data.get("lines") or []
    if not lines:
        raise _400("An order with no lines is not an order.")

    order = PurchaseOrder(
        tenant_id=tenant_id, school_id=school_id, supplier_id=supplier.id,
        order_no=str(data["order_no"]).strip(),
        ordered_on=data.get("ordered_on") or date.today(),
        expected_on=data.get("expected_on"),
        status=PurchaseOrderStatus(data.get("status") or PurchaseOrderStatus.draft.value),
        notes=data.get("notes"),
        total=ZERO,
        raised_by_user_id=actor_id,
    )
    db.add(order)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That order number is already used.")

    total = ZERO
    for ln in lines:
        qty = Decimal(str(ln["qty"]))
        cost = Decimal(str(ln["unit_cost"]))
        if qty <= 0:
            raise _400("Every line needs a quantity.")
        db.add(PurchaseOrderLine(
            order_id=order.id, item_id=ln.get("item_id"),
            description=str(ln["description"]).strip(),
            qty=qty, unit_cost=cost, received_qty=ZERO,
        ))
        total += qty * cost
    # The header follows the lines rather than being typed beside them.
    order.total = total
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That order number is already used.")
    db.refresh(order)
    return order_to_dict(db, order)


def receive_lines(db: Session, school_id: int, order_id: int, lines: list[dict]) -> dict:
    """Mark quantities as arrived, and let the order's status follow."""
    order = db.get(PurchaseOrder, order_id)
    if not order or order.school_id != school_id:
        raise _404("Order")
    if order.status == PurchaseOrderStatus.cancelled:
        raise _400("That order was cancelled.")

    by_id = {
        ln.id: ln for ln in db.execute(
            select(PurchaseOrderLine).where(PurchaseOrderLine.order_id == order_id)
        ).scalars()
    }
    for entry in lines:
        ln = by_id.get(int(entry["line_id"]))
        if ln is None:
            raise _404("Order line")
        got = Decimal(str(entry["received_qty"]))
        if got < 0:
            raise _400("A received quantity cannot be negative.")
        if got > _money(ln.qty):
            raise _400(
                f"More {ln.description} arrived than was ordered "
                f"({got} against {ln.qty}). Raise a second order rather than "
                "overstating this one."
            )
        ln.received_qty = got

    all_lines = list(by_id.values())
    if all(_money(l.received_qty) >= _money(l.qty) for l in all_lines):
        order.status = PurchaseOrderStatus.received
    elif any(_money(l.received_qty) > 0 for l in all_lines):
        order.status = PurchaseOrderStatus.part_received
    db.commit()
    return order_to_dict(db, order)


# ---------- the finance pack ----------


def finance_report(
    db: Session, school_id: int, *, frm: Optional[date] = None, to: Optional[date] = None
) -> dict:
    """Money in against money out, over a window.

    Fee collections are the only income this system records. Expenditure is
    both halves of how a school pays for things: direct expenses, and
    payments against supplier bills. Leaving either out would flatter the
    figure.
    """
    from app.services import analytics_service

    to = to or date.today()
    frm = frm or to.replace(day=1)

    income = analytics_service.fee_collection(db, school_id, frm=frm, to=to)

    expenses = list(db.execute(
        select(Expense, ExpenseCategory.name)
        .join(ExpenseCategory, ExpenseCategory.id == Expense.category_id, isouter=True)
        .where(
            Expense.school_id == school_id,
            Expense.spent_on >= frm,
            Expense.spent_on <= to,
        )
    ).all())
    vendor_paid = list(db.execute(
        select(VendorPayment, Supplier.name)
        .join(VendorBill, VendorBill.id == VendorPayment.bill_id)
        .join(Supplier, Supplier.id == VendorBill.supplier_id, isouter=True)
        .where(
            VendorPayment.school_id == school_id,
            VendorPayment.paid_on >= frm,
            VendorPayment.paid_on <= to,
        )
    ).all())

    by_category: dict[str, Decimal] = {}
    by_month_out: dict[str, Decimal] = {}
    spent = ZERO
    for e, category in expenses:
        amt = _money(e.amount) + _money(e.tax_amount)
        spent += amt
        label = category or "Uncategorised"
        by_category[label] = by_category.get(label, ZERO) + amt
        key = f"{e.spent_on:%Y-%m}"
        by_month_out[key] = by_month_out.get(key, ZERO) + amt
    for p, supplier in vendor_paid:
        amt = _money(p.amount)
        spent += amt
        label = "Suppliers"
        by_category[label] = by_category.get(label, ZERO) + amt
        key = f"{p.paid_on:%Y-%m}"
        by_month_out[key] = by_month_out.get(key, ZERO) + amt

    received = _money(income["total"])
    months = sorted({m["month"] for m in income["by_month"]} | set(by_month_out))
    in_by_month = {m["month"]: _money(m["amount"]) for m in income["by_month"]}

    return {
        "from_date": frm,
        "to_date": to,
        "received": received,
        "receipts": income["receipts"],
        "spent": spent,
        "net": received - spent,
        "income_by_head": income["by_head"],
        "income_by_mode": income["by_mode"],
        "spend_by_category": [
            {"label": k, "amount": v}
            for k, v in sorted(by_category.items(), key=lambda kv: -kv[1])
        ],
        "by_month": [
            {
                "month": m,
                "received": in_by_month.get(m, ZERO),
                "spent": by_month_out.get(m, ZERO),
                "net": in_by_month.get(m, ZERO) - by_month_out.get(m, ZERO),
            }
            for m in months
        ],
    }


def fee_dashboard(db: Session, school_id: int) -> dict:
    """What the fees office looks at first: today, this month, and what is late."""
    from app.services import analytics_service

    today = date.today()
    month_start = today.replace(day=1)

    collected_today = _money(db.execute(
        select(func.coalesce(func.sum(FeeCollection.amount), 0)).where(
            FeeCollection.school_id == school_id,
            FeeCollection.collected_on == today,
        )
    ).scalar_one())
    collected_month = _money(db.execute(
        select(func.coalesce(func.sum(FeeCollection.amount), 0)).where(
            FeeCollection.school_id == school_id,
            FeeCollection.collected_on >= month_start,
        )
    ).scalar_one())

    ageing = analytics_service.dues_ageing(db, school_id)
    raised_month = _money(db.execute(
        select(func.coalesce(func.sum(StudentFee.amount_due), 0)).where(
            StudentFee.school_id == school_id,
            StudentFee.due_date >= month_start,
            StudentFee.due_date <= today,
        )
    ).scalar_one())

    return {
        "collected_today": collected_today,
        "collected_this_month": collected_month,
        "raised_this_month": raised_month,
        "collection_rate": (
            round(float(collected_month / raised_month) * 100, 1) if raised_month else 0.0
        ),
        "outstanding": _money(ageing["total"]),
        "students_owing": ageing["students_owing"],
        "buckets": ageing["buckets"],
        "top_defaulters": ageing["defaulters"][:10],
        "by_month": analytics_service.fee_collection(db, school_id)["by_month"],
    }


def list_orders(
    db: Session, school_id: int, *, supplier_id: Optional[int] = None,
    status: Optional[PurchaseOrderStatus] = None,
) -> list[dict]:
    stmt = select(PurchaseOrder).where(PurchaseOrder.school_id == school_id)
    if supplier_id:
        stmt = stmt.where(PurchaseOrder.supplier_id == supplier_id)
    if status:
        stmt = stmt.where(PurchaseOrder.status == status)
    rows = db.execute(stmt.order_by(PurchaseOrder.ordered_on.desc())).scalars()
    return [order_to_dict(db, o) for o in rows]


def list_bills(
    db: Session, school_id: int, *, supplier_id: Optional[int] = None,
    unpaid_only: bool = False,
) -> list[dict]:
    stmt = select(VendorBill).where(VendorBill.school_id == school_id)
    if supplier_id:
        stmt = stmt.where(VendorBill.supplier_id == supplier_id)
    if unpaid_only:
        stmt = stmt.where(VendorBill.status.in_([BillStatus.unpaid, BillStatus.part_paid]))
    rows = db.execute(stmt.order_by(VendorBill.billed_on.desc())).scalars()
    return [bill_to_dict(db, b) for b in rows]


def create_bill(db: Session, tenant_id: int, school_id: int, data: dict) -> dict:
    supplier = db.get(Supplier, int(data["supplier_id"]))
    if not supplier or supplier.school_id != school_id:
        raise _404("Supplier")
    if data.get("order_id"):
        order = db.get(PurchaseOrder, int(data["order_id"]))
        if not order or order.school_id != school_id:
            raise _404("Order")
        if order.supplier_id != supplier.id:
            raise _400("That order belongs to a different supplier.")
    due = data.get("due_on")
    if due and due < data["billed_on"]:
        raise _400("A bill cannot fall due before it was raised.")

    bill = VendorBill(
        tenant_id=tenant_id, school_id=school_id, supplier_id=supplier.id,
        order_id=data.get("order_id"),
        bill_no=str(data["bill_no"]).strip(),
        billed_on=data["billed_on"], due_on=due,
        amount=Decimal(str(data["amount"])),
        tax_amount=Decimal(str(data.get("tax_amount") or 0)),
        status=BillStatus.unpaid,
        notes=data.get("notes"),
    )
    db.add(bill)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{supplier.name} already has a bill numbered {data['bill_no']}.",
        )
    db.refresh(bill)
    return bill_to_dict(db, bill)
