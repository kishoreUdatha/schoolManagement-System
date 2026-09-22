"""Accounts: expenses, other income, cheques (PDC), concessions, fee
collection receipts and the cash book."""
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import ChequeStatus, ConcessionKind, FeeStatus, MoneyMode, PayrollRunStatus, StorePayment
from app.core.scoping import get_school_student, section_label, section_labels
from app.models.accounts import Cheque, Concession, Expense, ExpenseCategory, FeeCollection, OtherIncome
from app.models.document import Document
from app.models.fee import FeeHead, StudentFee
from app.models.inventory import StoreSale, Supplier
from app.models.payroll import PayrollRun, Payslip
from app.models.purchasing import VendorPayment
from app.models.student import Student
from app.models.user import User
from app.schemas.accounts import (
    CategoryIn,
    ChequeAction,
    ChequeIn,
    ConcessionIn,
    ConcessionUpdate,
    ExpenseIn,
    ExpenseUpdate,
    IncomeIn,
)
from app.schemas.fee import RecordPayment
from app.services import ledger_service


ZERO = Decimal("0")
DEFAULT_CATEGORIES = ["Electricity & water", "Maintenance & repairs", "Stationery & printing", "Events & functions",
                      "Transport & fuel", "Rent", "Internet & phone", "Housekeeping", "Professional fees", "Miscellaneous"]


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _scoped(db: Session, model, obj_id: Optional[int], school_id: int, what: str):
    if obj_id is None:
        return None
    o = db.get(model, obj_id)
    if not o or o.school_id != school_id:
        raise _404(what)
    return o


def _name(db: Session, user_id: Optional[int]) -> Optional[str]:
    u = db.get(User, user_id) if user_id else None
    return u.full_name if u else None


# --- Expenses ---

def categories(db: Session, user: User) -> list[ExpenseCategory]:
    rows = list(db.execute(select(ExpenseCategory).where(ExpenseCategory.school_id == user.school_id).order_by(ExpenseCategory.name)).scalars())
    if not rows:
        for n in DEFAULT_CATEGORIES:
            db.add(ExpenseCategory(tenant_id=user.tenant_id, school_id=user.school_id, name=n))
        db.commit()
        return categories(db, user)
    return rows


def save_category(db: Session, user: User, data: CategoryIn, category_id: Optional[int] = None) -> ExpenseCategory:
    c = _scoped(db, ExpenseCategory, category_id, user.school_id, "Category") if category_id else ExpenseCategory(tenant_id=user.tenant_id, school_id=user.school_id)
    c.name, c.is_active = data.name.strip(), data.is_active
    if category_id is None:
        db.add(c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category already exists")
    db.refresh(c)
    return c


def add_expense(db: Session, user: User, data: ExpenseIn) -> Expense:
    cat = _scoped(db, ExpenseCategory, data.category_id, user.school_id, "Category")
    if not cat.is_active:
        raise _400("Category is inactive")
    _scoped(db, Supplier, data.supplier_id, user.school_id, "Supplier")
    _scoped(db, Document, data.bill_document_id, user.school_id, "Bill document")
    if not data.supplier_id and not (data.payee or "").strip():
        raise _400("Pick a supplier or enter who was paid")
    if data.spent_on > date.today():
        raise _400("Expense date is in the future")
    e = Expense(tenant_id=user.tenant_id, school_id=user.school_id, recorded_by_user_id=user.id, **data.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def update_expense(db: Session, expense_id: int, user: User, data: ExpenseUpdate) -> Expense:
    """Amend a voucher — a mistyped amount, the wrong category, a bill number
    that came later. A voided voucher stays as it was; that is the record of
    what was cancelled."""
    e = _scoped(db, Expense, expense_id, user.school_id, "Expense")
    if e.is_void:
        raise _400("This voucher is void — raise a new one instead")
    fields = data.model_dump(exclude_unset=True)
    if "category_id" in fields:
        _scoped(db, ExpenseCategory, fields["category_id"], user.school_id, "Category")
    if fields.get("supplier_id"):
        _scoped(db, Supplier, fields["supplier_id"], user.school_id, "Supplier")
    if fields.get("bill_document_id"):
        _scoped(db, Document, fields["bill_document_id"], user.school_id, "Bill document")
    if fields.get("spent_on") and fields["spent_on"] > date.today():
        raise _400("Expense date is in the future")
    for k, v in fields.items():
        setattr(e, k, v)
    if not e.supplier_id and not (e.payee or "").strip():
        raise _400("Pick a supplier or enter who was paid")
    db.commit()
    db.refresh(e)
    return e


def void_expense(db: Session, expense_id: int, user: User, reason: str) -> Expense:
    e = _scoped(db, Expense, expense_id, user.school_id, "Expense")
    if e.is_void:
        raise _400("Already void")
    e.is_void, e.void_reason = True, reason
    db.commit()
    db.refresh(e)
    return e


def expense_to_read(db: Session, e: Expense) -> dict:
    cat = db.get(ExpenseCategory, e.category_id)
    sup = db.get(Supplier, e.supplier_id) if e.supplier_id else None
    return {
        **{k: getattr(e, k) for k in ("id", "spent_on", "category_id", "supplier_id", "amount", "tax_amount", "mode",
                                       "reference", "description", "bill_document_id", "is_void", "void_reason", "created_at")},
        "category_name": cat.name if cat else "",
        "payee_name": sup.name if sup else e.payee,
        "recorded_by_name": _name(db, e.recorded_by_user_id),
    }


def list_expenses(db: Session, school_id: int, frm: date, to: date, category_id: Optional[int] = None) -> list[Expense]:
    stmt = select(Expense).where(Expense.school_id == school_id, Expense.spent_on.between(frm, to))
    if category_id:
        stmt = stmt.where(Expense.category_id == category_id)
    return list(db.execute(stmt.order_by(Expense.spent_on.desc(), Expense.id.desc())).scalars())


# --- Other income ---

def add_income(db: Session, user: User, data: IncomeIn) -> OtherIncome:
    if data.received_on > date.today():
        raise _400("Date is in the future")
    for _ in range(3):
        prefix = f"OI{data.received_on:%y%m}-"
        n = db.execute(select(func.count(OtherIncome.id)).where(OtherIncome.school_id == user.school_id, OtherIncome.receipt_no.like(f"{prefix}%"))).scalar_one()
        row = OtherIncome(tenant_id=user.tenant_id, school_id=user.school_id, recorded_by_user_id=user.id,
                          receipt_no=f"{prefix}{n + 1:04d}", **data.model_dump())
        try:
            with db.begin_nested():
                db.add(row)
                db.flush()
            db.commit()
            db.refresh(row)
            return row
        except IntegrityError:
            continue
    raise _400("Couldn't allocate a receipt number; try again")


def void_income(db: Session, income_id: int, user: User) -> OtherIncome:
    i = _scoped(db, OtherIncome, income_id, user.school_id, "Income entry")
    i.is_void = True
    db.commit()
    db.refresh(i)
    return i


def list_income(db: Session, school_id: int, frm: date, to: date) -> list[OtherIncome]:
    return list(db.execute(select(OtherIncome).where(OtherIncome.school_id == school_id, OtherIncome.received_on.between(frm, to)).order_by(OtherIncome.received_on.desc())).scalars())


# --- Cheques ---

def _cheque_fees(db: Session, student_id: int, fee_ids: list[int]) -> list[tuple[StudentFee, FeeHead]]:
    rows = db.execute(
        select(StudentFee, FeeHead).join(FeeHead, StudentFee.fee_head_id == FeeHead.id)
        .where(StudentFee.id.in_(fee_ids), StudentFee.student_id == student_id)
        .order_by(StudentFee.due_date)
    ).all()
    if len(rows) != len(set(fee_ids)):
        raise _404("Some of those fees")
    return rows


def record_cheque(db: Session, user: User, data: ChequeIn) -> Cheque:
    student = get_school_student(db, data.student_id, user.school_id)
    fees = _cheque_fees(db, student.id, data.fee_ids)
    outstanding = sum((sf.amount_due - sf.amount_paid for sf, _ in fees if sf.status == FeeStatus.pending), ZERO)
    if outstanding <= 0:
        raise _400("Those fees have nothing outstanding")
    if data.amount > outstanding:
        raise _400(f"Cheque is more than what's due on those fees (Rs. {outstanding:,.2f})")
    dup = db.execute(select(Cheque.id).where(
        Cheque.school_id == user.school_id, Cheque.cheque_no == data.cheque_no, Cheque.bank_name == data.bank_name,
        Cheque.status.in_((ChequeStatus.received, ChequeStatus.deposited, ChequeStatus.cleared)),
    )).first()
    if dup:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This cheque is already recorded")
    c = Cheque(tenant_id=user.tenant_id, school_id=user.school_id, recorded_by_user_id=user.id,
               status=ChequeStatus.received, **{**data.model_dump(), "received_on": data.received_on or date.today(),
                                                 "fee_ids": sorted(set(data.fee_ids))})
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def cheque_action(db: Session, cheque_id: int, user: User, data: ChequeAction) -> Cheque:
    from app.services import fee_service  # local: fee_service imports ledger_service

    c = _scoped(db, Cheque, cheque_id, user.school_id, "Cheque")
    on = data.on or date.today()
    flow = {
        "deposit": ({ChequeStatus.received}, ChequeStatus.deposited),
        "clear": ({ChequeStatus.deposited, ChequeStatus.received}, ChequeStatus.cleared),
        "bounce": ({ChequeStatus.deposited}, ChequeStatus.bounced),
        "return": ({ChequeStatus.received}, ChequeStatus.returned),
    }
    allowed, to = flow[data.action]
    if c.status not in allowed:
        raise _400(f"Cheque is {c.status.value}; can't {data.action} it")
    if data.action == "deposit":
        if on < c.cheque_date:
            raise _400(f"Post-dated: can't deposit before {c.cheque_date:%d %b %Y}")
        c.deposited_on = on
    elif data.action == "clear":
        # Credit the fees oldest-due first, each as its own receipt.
        remaining = c.amount
        for sf, head in _cheque_fees(db, c.student_id, c.fee_ids):
            if remaining <= 0 or sf.status != FeeStatus.pending:
                continue
            take = min(remaining, sf.amount_due - sf.amount_paid)
            if take <= 0:
                continue
            fee_service.record_payment(
                db, sf.id, c.school_id,
                RecordPayment(amount_paid=take, payment_mode="cheque", payment_ref=f"{c.cheque_no} {c.bank_name}", notes=f"Cheque {c.cheque_no} cleared"),
                user.id,
            )
            remaining -= take
        c = db.get(Cheque, cheque_id)
        c.cleared_on = on
        if not c.deposited_on:
            c.deposited_on = on
    elif data.action == "bounce":
        if not (data.bounce_reason or "").strip():
            raise _400("Give the bounce reason")
        c.bounce_reason = data.bounce_reason
        if data.bounce_charge:
            head = _scoped(db, FeeHead, data.bounce_fee_head_id, user.school_id, "Fee head")
            if head is None:
                raise _400("Choose a fee head for the bounce charge")
            sf = StudentFee(tenant_id=c.tenant_id, school_id=c.school_id, student_id=c.student_id, fee_structure_id=None,
                            source="cheque_bounce", source_id=c.id, fee_head_id=head.id, period=on.strftime("%Y-%m"),
                            amount_due=data.bounce_charge, amount_paid=ZERO, due_date=on + timedelta(days=7),
                            status=FeeStatus.pending, notes=f"Cheque {c.cheque_no} bounced: {data.bounce_reason}")
            db.add(sf)
            db.flush()
            c.bounce_charge_fee_id = sf.id
    c.status = to
    db.commit()
    db.refresh(c)
    return c


def cheque_to_read(db: Session, c: Cheque) -> dict:
    s = db.get(Student, c.student_id)
    fees = db.execute(select(StudentFee, FeeHead).join(FeeHead, StudentFee.fee_head_id == FeeHead.id).where(StudentFee.id.in_(c.fee_ids or [0]))).all()
    return {
        **{k: getattr(c, k) for k in ("id", "student_id", "amount", "cheque_no", "bank_name", "drawer_name", "cheque_date",
                                       "received_on", "status", "deposited_on", "cleared_on", "bounce_reason")},
        "fee_ids": c.fee_ids or [],
        "fees_label": ", ".join(f"{h.name} {sf.period}" for sf, h in fees),
        "student_name": s.full_name if s else "",
        "section_label": section_label(db, s.section_id) if s else None,
        "due_for_deposit": c.status == ChequeStatus.received and c.cheque_date <= date.today(),
    }


def list_cheques(db: Session, school_id: int, *, status_: Optional[ChequeStatus] = None) -> list[Cheque]:
    stmt = select(Cheque).where(Cheque.school_id == school_id)
    if status_:
        stmt = stmt.where(Cheque.status == status_)
    return list(db.execute(stmt.order_by(Cheque.cheque_date)).scalars())


# --- Concessions ---

def add_concession(db: Session, user: User, data: ConcessionIn) -> tuple[Concession, int]:
    """Give a concession now, or (for_approval) ask for one: a request is kept
    as pending and changes no fee until someone approves it."""
    student = get_school_student(db, data.student_id, user.school_id)
    _scoped(db, FeeHead, data.fee_head_id, user.school_id, "Fee head")
    fields = data.model_dump(exclude={"apply_to_pending", "for_approval"})
    if data.for_approval:
        c = Concession(tenant_id=user.tenant_id, school_id=user.school_id, requested_by_user_id=user.id,
                       is_active=False, approval_status="pending",
                       apply_to_pending_on_approval=data.apply_to_pending, **fields)
        db.add(c)
        db.commit()
        db.refresh(c)
        return c, 0
    c = Concession(tenant_id=user.tenant_id, school_id=user.school_id, approved_by_user_id=user.id,
                   requested_by_user_id=user.id, is_active=True, approval_status="approved", **fields)
    db.add(c)
    db.flush()
    applied = _apply_to_pending(db, c, student.id) if data.apply_to_pending else 0
    db.commit()
    db.refresh(c)
    return c, applied


def _apply_to_pending(db: Session, c: Concession, student_id: int) -> int:
    """Reduce this student's untouched unpaid fees in the concession's period."""
    applied = 0
    # Only untouched fees (nothing paid yet, no concession already noted).
    stmt = select(StudentFee).where(
        StudentFee.student_id == student_id, StudentFee.status == FeeStatus.pending,
        StudentFee.amount_paid == 0, StudentFee.fee_structure_id.is_not(None),
        StudentFee.due_date >= c.valid_from,
    )
    if c.fee_head_id:
        stmt = stmt.where(StudentFee.fee_head_id == c.fee_head_id)
    if c.valid_to:
        stmt = stmt.where(StudentFee.due_date <= c.valid_to)
    for sf in db.execute(stmt).scalars():
        if sf.notes and sf.notes.startswith("Concession"):
            continue
        amount, note = ledger_service.discounted(db, student_id, sf.fee_head_id, sf.amount_due, sf.due_date)
        if note and amount < sf.amount_due:
            sf.amount_due = amount
            sf.notes = note
            if amount == 0:
                sf.status = FeeStatus.waived
            applied += 1
    return applied


def decide_concession(db: Session, concession_id: int, user: User, approve: bool,
                      note: Optional[str] = None) -> tuple[Concession, int]:
    """Approve (it comes into force, and reduces unpaid fees if the request
    asked for that) or reject a pending concession request."""
    c = _scoped(db, Concession, concession_id, user.school_id, "Concession")
    if c.approval_status != "pending":
        raise _400("This concession is not waiting for approval")
    c.approved_by_user_id = user.id
    if note:
        c.notes = f"{c.notes} · {note}" if c.notes else note
    applied = 0
    if approve:
        c.approval_status = "approved"
        c.is_active = True
        db.flush()
        if c.apply_to_pending_on_approval:
            applied = _apply_to_pending(db, c, c.student_id)
    else:
        c.approval_status = "rejected"
        c.is_active = False
    db.commit()
    db.refresh(c)
    return c, applied


def update_concession(db: Session, concession_id: int, user: User, data: ConcessionUpdate) -> Concession:
    """Change a concession that is still running — its value, the dates it
    covers, or why it was given. Ending it is a separate action, because that
    is a decision rather than a correction."""
    c = _scoped(db, Concession, concession_id, user.school_id, "Concession")
    if not c.is_active and c.approval_status != "pending":
        raise _400("This concession has ended — add a new one instead")
    fields = data.model_dump(exclude_unset=True)
    if fields.get("kind") == ConcessionKind.percent and Decimal(str(fields.get("value", c.value))) > 100:
        raise _400("A percentage can't exceed 100")
    valid_from = fields.get("valid_from", c.valid_from)
    valid_to = fields.get("valid_to", c.valid_to)
    if valid_to and valid_to < valid_from:
        raise _400("The concession would end before it starts")
    for k, v in fields.items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


def end_concession(db: Session, concession_id: int, user: User) -> Concession:
    c = _scoped(db, Concession, concession_id, user.school_id, "Concession")
    if c.approval_status != "approved":
        raise _400("Only a concession in force can be ended — approve or reject a request")
    c.is_active = False
    if not c.valid_to or c.valid_to > date.today():
        c.valid_to = date.today()
    db.commit()
    db.refresh(c)
    return c


def concession_to_read(db: Session, c: Concession, applied: int = 0) -> dict:
    s = db.get(Student, c.student_id)
    head = db.get(FeeHead, c.fee_head_id) if c.fee_head_id else None
    return {
        **{k: getattr(c, k) for k in ("id", "student_id", "fee_head_id", "kind", "value", "reason", "valid_from", "valid_to", "notes", "is_active")},
        "student_name": s.full_name if s else "",
        "section_label": section_label(db, s.section_id) if s else None,
        "fee_head_name": head.name if head else "All fees",
        "approved_by_name": _name(db, c.approved_by_user_id),
        "applied_to_pending": applied,
        "approval_status": c.approval_status,
        "requested_by_name": _name(db, c.requested_by_user_id),
    }


def list_concessions(db: Session, school_id: int, *, active_only: bool = True) -> list[Concession]:
    stmt = select(Concession).where(Concession.school_id == school_id)
    if active_only:
        stmt = stmt.where(Concession.is_active.is_(True))
    return list(db.execute(stmt.order_by(Concession.created_at.desc())).scalars())


# --- Collections & cash book ---

def collections(db: Session, school_id: int, frm: date, to: date, *, mode: Optional[MoneyMode] = None,
                student_id: Optional[int] = None) -> list[dict]:
    stmt = (
        select(FeeCollection, StudentFee, FeeHead, Student)
        .join(StudentFee, FeeCollection.student_fee_id == StudentFee.id)
        .join(FeeHead, StudentFee.fee_head_id == FeeHead.id)
        .join(Student, FeeCollection.student_id == Student.id)
        .where(FeeCollection.school_id == school_id, FeeCollection.collected_on.between(frm, to))
    )
    if mode:
        stmt = stmt.where(FeeCollection.mode == mode)
    if student_id:
        stmt = stmt.where(FeeCollection.student_id == student_id)
    rows = db.execute(stmt.order_by(FeeCollection.collected_on.desc(), FeeCollection.id.desc())).all()
    labels = section_labels(db, {s.section_id for _, _, _, s in rows})
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_({c.collected_by_user_id for c, *_ in rows if c.collected_by_user_id}))).all()) if rows else {}
    return [
        {
            "id": c.id, "receipt_no": c.receipt_no, "collected_on": c.collected_on, "student_id": s.id, "student_name": s.full_name,
            "section_label": labels.get(s.section_id), "fee_head_name": h.name, "period": sf.period, "amount": c.amount,
            "mode": c.mode, "reference": c.reference, "collected_by_name": names.get(c.collected_by_user_id),
        }
        for c, sf, h, s in rows
    ]


def collection(db: Session, school_id: int, collection_id: int) -> dict:
    """One receipt, without having to know the day it was taken."""
    row = db.execute(
        select(FeeCollection, StudentFee, FeeHead, Student)
        .join(StudentFee, FeeCollection.student_fee_id == StudentFee.id)
        .join(FeeHead, StudentFee.fee_head_id == FeeHead.id)
        .join(Student, FeeCollection.student_id == Student.id)
        .where(FeeCollection.school_id == school_id, FeeCollection.id == collection_id)
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    c, sf, h, s = row
    who = db.get(User, c.collected_by_user_id) if c.collected_by_user_id else None
    return {
        "id": c.id, "receipt_no": c.receipt_no, "collected_on": c.collected_on, "student_id": s.id,
        "student_name": s.full_name, "section_label": section_labels(db, {s.section_id}).get(s.section_id),
        "fee_head_name": h.name, "period": sf.period, "amount": c.amount, "mode": c.mode,
        "reference": c.reference, "collected_by_name": who.full_name if who else None,
    }


def cash_book(db: Session, school_id: int, frm: date, to: date) -> dict:
    if to < frm:
        raise _400("'to' is before 'from'")
    if (to - frm).days > 400:
        raise _400("Pick a range of at most about a year")
    by_mode: dict[str, dict[str, Decimal]] = defaultdict(lambda: {"in": ZERO, "out": ZERO})
    daily: dict[date, dict[str, Decimal]] = defaultdict(lambda: {"in": ZERO, "out": ZERO})

    fees_by_mode, fees_by_head = defaultdict(lambda: ZERO), defaultdict(lambda: ZERO)
    for c, h in db.execute(
        select(FeeCollection, FeeHead.name).join(StudentFee, FeeCollection.student_fee_id == StudentFee.id)
        .join(FeeHead, StudentFee.fee_head_id == FeeHead.id)
        .where(FeeCollection.school_id == school_id, FeeCollection.collected_on.between(frm, to))
    ).all():
        fees_by_mode[c.mode.value] += c.amount
        fees_by_head[h] += c.amount
        by_mode[c.mode.value]["in"] += c.amount
        daily[c.collected_on]["in"] += c.amount

    other = defaultdict(lambda: ZERO)
    for i in list_income(db, school_id, frm, to):
        if i.is_void:
            continue
        other[i.source] += i.amount
        by_mode[i.mode.value]["in"] += i.amount
        daily[i.received_on]["in"] += i.amount

    store = defaultdict(lambda: ZERO)
    for s in db.execute(select(StoreSale).where(
        StoreSale.school_id == school_id, StoreSale.is_void.is_(False), StoreSale.sold_on.between(frm, to),
        StoreSale.payment != StorePayment.add_to_fees,  # those arrive later as fee collections
    )).scalars():
        store[s.payment.value] += s.total
        by_mode[s.payment.value]["in"] += s.total
        daily[s.sold_on]["in"] += s.total

    by_cat = defaultdict(lambda: ZERO)
    for e in list_expenses(db, school_id, frm, to):
        if e.is_void:
            continue
        cat = db.get(ExpenseCategory, e.category_id)
        by_cat[cat.name if cat else "Other"] += e.amount
        by_mode[e.mode.value]["out"] += e.amount
        daily[e.spent_on]["out"] += e.amount

    payroll = ZERO
    for run in db.execute(select(PayrollRun).where(
        PayrollRun.school_id == school_id, PayrollRun.status == PayrollRunStatus.paid, PayrollRun.paid_on.between(frm, to)
    )).scalars():
        net = db.execute(select(func.coalesce(func.sum(Payslip.net_pay), 0)).where(Payslip.run_id == run.id)).scalar_one()
        payroll += net
        by_mode[MoneyMode.bank_transfer.value]["out"] += net
        daily[run.paid_on]["out"] += net

    from app.services import fee_extras_service

    refunds = ZERO
    for r in fee_extras_service.processed_rows(db, school_id, frm, to):
        refunds += r.amount
        by_mode[r.mode.value]["out"] += r.amount
        daily[r.processed_on]["out"] += r.amount

    vendors = ZERO
    for vp in db.execute(select(VendorPayment).where(
        VendorPayment.school_id == school_id, VendorPayment.paid_on.between(frm, to)
    )).scalars():
        vendors += vp.amount
        by_mode[vp.mode.value]["out"] += vp.amount
        daily[vp.paid_on]["out"] += vp.amount

    total_in = sum(fees_by_mode.values(), ZERO) + sum(other.values(), ZERO) + sum(store.values(), ZERO)
    total_out = sum(by_cat.values(), ZERO) + payroll + refunds + vendors
    return {
        "from_date": frm,
        "to_date": to,
        "income": {"fees": dict(fees_by_mode), "fees_by_head": dict(fees_by_head), "other": dict(other), "store": dict(store)},
        "expenses": {"by_category": dict(by_cat), "payroll": payroll, "refunds": refunds, "vendors": vendors},
        "total_in": total_in,
        "total_out": total_out,
        "net": total_in - total_out,
        "by_mode": {k: v for k, v in by_mode.items()},
        "daily": [{"date": d, "in": v["in"], "out": v["out"]} for d, v in sorted(daily.items())],
    }
