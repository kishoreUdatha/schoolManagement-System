"""Double-entry books for a school.

The chart of accounts and hand-made journal vouchers are stored
(models/ledger.py). Everything else is posted from the records the other
modules already keep, at the moment the books are read:

    fees raised (by due date)      Dr Fees receivable     Cr Fee income (per head)
    fee receipt                    Dr Cash / Bank         Cr Fees receivable
    refund paid out                Dr Fees receivable     Cr Cash / Bank
    other income                   Dr Cash / Bank         Cr Other income (per source)
    store sale (paid at counter)   Dr Cash / Bank         Cr Store sales
    expense                        Dr Expense (category)  Cr Cash / Bank
    supplier bill                  Dr Purchases           Cr Supplier payables
    supplier payment               Dr Supplier payables   Cr Cash / Bank
    payroll paid                   Dr Salaries, Dr Employer PF/ESI
                                   Cr Bank (net pay), Cr Payroll deductions payable

Deriving rather than copying means there is nothing to keep in step: a
voided expense or a cancelled bill leaves the books at once, and a school
that switches the books on gets its whole history posted.

Fees are on an accrual basis (income when a fee falls due, a receivable
until it is paid; a fee paid ahead of its due date shows as a credit on the
receivable). Cash and cheque are kept apart: cash goes to Cash in hand, every
other mode (cheque, transfer, UPI, card, gateway) to the Bank account.
"""
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import (
    BillStatus,
    FeeStatus,
    PayrollRunStatus,
    RefundStatus,
    StorePayment,
)
from app.models.accounts import Expense, ExpenseCategory, FeeCollection, OtherIncome
from app.models.fee import FeeHead, StudentFee
from app.models.fee_extra import Refund
from app.models.inventory import StoreSale, Supplier
from app.models.ledger import JournalEntry, JournalLine, LedgerAccount
from app.models.payroll import PayrollRun, Payslip
from app.models.purchasing import VendorBill, VendorPayment
from app.models.student import Student
from app.models.user import User

ZERO = Decimal("0")
KINDS = ("asset", "liability", "equity", "income", "expense")
DEBIT_NORMAL = {"asset", "expense"}

# (system_key, code, name, kind, description)
DEFAULT_ACCOUNTS = [
    ("cash", "1100", "Cash in hand", "asset", "Cash receipts and payments."),
    ("bank", "1200", "Bank account", "asset", "Cheque, transfer, UPI, card and gateway money."),
    ("fees_receivable", "1300", "Fees receivable", "asset",
     "Fees fallen due and not yet paid. A credit balance is fees paid in advance."),
    (None, "1400", "Advances and deposits paid", "asset", None),
    (None, "1510", "Land and buildings", "asset", None),
    (None, "1520", "Furniture and fixtures", "asset", None),
    (None, "1530", "Computers and equipment", "asset", None),
    (None, "1540", "Vehicles", "asset", None),
    ("payables", "2100", "Supplier payables", "liability", "Supplier bills not yet paid."),
    ("payroll_deductions", "2200", "Payroll deductions payable", "liability",
     "PF, ESI, professional tax and TDS held back from salaries, and the employer's share, until paid over."),
    (None, "2300", "Caution deposits received", "liability", None),
    (None, "2400", "Loans", "liability", None),
    ("capital", "3100", "Capital fund", "equity", "Opening balances and money put in by the trust or owners."),
    ("store_sales", "4500", "Store sales", "income", "School store sales paid at the counter."),
    ("salaries", "5100", "Salaries and wages", "expense", "Gross pay from payroll."),
    ("employer_contrib", "5110", "Employer PF and ESI", "expense", "The school's share of PF and ESI."),
    ("purchases", "5200", "Supplier purchases", "expense", "Supplier bills."),
]
INCOME_SOURCES = [
    ("donation", "Donations"),
    ("rent", "Rent and hire charges"),
    ("grant", "Grants"),
    ("interest", "Interest received"),
    ("sponsorship", "Sponsorships"),
    ("other", "Miscellaneous income"),
]
KIND_CATEGORY = {
    "asset": "Current assets", "liability": "Current liabilities", "equity": "Capital fund",
    "income": "Other income", "expense": "Operating expenses",
}
KEY_CATEGORY = {
    "cash": "Cash and bank", "bank": "Cash and bank", "fees_receivable": "Receivables",
    "payables": "Current liabilities", "payroll_deductions": "Current liabilities",
    "capital": "Capital fund", "store_sales": "Sales", "salaries": "Staff costs",
    "employer_contrib": "Staff costs", "purchases": "Purchases",
}
CODE_CATEGORY = {"1510": "Fixed assets", "1520": "Fixed assets", "1530": "Fixed assets", "1540": "Fixed assets", "2400": "Loans"}


def default_category(key: Optional[str], kind: str, code: str) -> str:
    if key:
        if key in KEY_CATEGORY:
            return KEY_CATEGORY[key]
        prefix = key.split(":")[0]
        if prefix == "fee_head":
            return "Fee income"
        if prefix == "income":
            return "Other income"
        if prefix == "expense_cat":
            return "Operating expenses"
    return CODE_CATEGORY.get(code) or KIND_CATEGORY[kind]


SOURCE_LABEL = {
    "fees_raised": "Fees raised",
    "fee_receipt": "Fee receipt",
    "refund": "Refund",
    "other_income": "Other income",
    "store_sale": "Store sale",
    "expense": "Expense",
    "vendor_bill": "Supplier bill",
    "vendor_payment": "Supplier payment",
    "payroll": "Payroll",
    "journal": "Journal",
}


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _m(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"))


def fy_start(d: date) -> date:
    """Indian financial year: 1 April to 31 March."""
    return date(d.year if d.month >= 4 else d.year - 1, 4, 1)


def _money_key(mode) -> str:
    return "cash" if getattr(mode, "value", mode) == "cash" else "bank"


# ---------- chart of accounts ----------


def _next_code(start: int, used: set[str]) -> str:
    n = start
    while str(n) in used:
        n += 1
    return str(n)


def ensure_chart(db: Session, user: User) -> dict[str, LedgerAccount]:
    """Create any account the automatic postings need and the school lacks:
    the defaults the first time, then one per new fee head, expense category
    or income source. Names the school has changed are left alone."""
    sid = user.school_id
    accounts = list(db.execute(select(LedgerAccount).where(LedgerAccount.school_id == sid)).scalars())
    by_key = {a.system_key: a for a in accounts if a.system_key}
    used = {a.code for a in accounts}
    wanted: list[tuple[Optional[str], str, str, str, Optional[str]]] = []

    if not accounts:
        wanted += DEFAULT_ACCOUNTS
    else:
        wanted += [d for d in DEFAULT_ACCOUNTS if d[0] and d[0] not in by_key]

    heads = db.execute(
        select(FeeHead.id, FeeHead.name).where(FeeHead.school_id == sid).order_by(FeeHead.id)
    ).all()
    cats = db.execute(
        select(ExpenseCategory.id, ExpenseCategory.name)
        .where(ExpenseCategory.school_id == sid).order_by(ExpenseCategory.id)
    ).all()

    new: list[LedgerAccount] = []

    def add(key, code, name, kind, desc):
        if code in used:
            code = _next_code(int(code), used)
        used.add(code)
        acct = LedgerAccount(
            tenant_id=user.tenant_id, school_id=sid, code=code, name=name[:120],
            kind=kind, system_key=key, description=desc, is_active=True,
            category=default_category(key, kind, code),
        )
        new.append(acct)
        if key:
            by_key[key] = acct

    for key, code, name, kind, desc in wanted:
        add(key, code, name, kind, desc)
    for hid, name in heads:
        key = f"fee_head:{hid}"
        if key not in by_key:
            add(key, _next_code(4101, used), name, "income", "Fees raised under this head.")
    for src, label in INCOME_SOURCES:
        key = f"income:{src}"
        if key not in by_key:
            add(key, _next_code(4601, used), label, "income", "Money in recorded under Income.")
    for cid, name in cats:
        key = f"expense_cat:{cid}"
        if key not in by_key:
            add(key, _next_code(5301, used), name, "expense", "Expenses recorded under this category.")

    # charts made before accounts had a category
    for a in accounts:
        if a.category is None:
            a.category = default_category(a.system_key, a.kind, a.code)
            new.append(a)

    if new:
        db.add_all(new)
        try:
            db.commit()
        except IntegrityError:
            # another request set the chart up at the same moment
            db.rollback()
            return ensure_chart(db, user)
    return by_key


def _accounts(db: Session, school_id: int) -> dict[int, LedgerAccount]:
    return {
        a.id: a for a in db.execute(
            select(LedgerAccount).where(LedgerAccount.school_id == school_id)
        ).scalars()
    }


def account_dict(a: LedgerAccount, balance: Decimal = ZERO, used: bool = False) -> dict:
    return {
        "id": a.id, "code": a.code, "name": a.name, "kind": a.kind,
        "system_key": a.system_key, "is_system": a.system_key is not None,
        "category": a.category or default_category(a.system_key, a.kind, a.code),
        "description": a.description, "is_active": a.is_active,
        "balance": balance, "has_entries": used,
    }


def list_accounts(db: Session, user: User, as_of: Optional[date] = None) -> list[dict]:
    ensure_chart(db, user)
    accts = _accounts(db, user.school_id)
    bal, used = _balances(entries(db, user, None, as_of or date.today()), accts)
    rows = [account_dict(a, bal.get(a.id, ZERO), a.id in used) for a in accts.values()]
    rows.sort(key=lambda r: (KINDS.index(r["kind"]), r["code"]))
    return rows


def create_account(db: Session, user: User, data: dict) -> dict:
    ensure_chart(db, user)
    if data["kind"] not in KINDS:
        raise _400("Kind must be asset, liability, equity, income or expense.")
    acct = LedgerAccount(
        tenant_id=user.tenant_id, school_id=user.school_id,
        code=data["code"].strip(), name=data["name"].strip(), kind=data["kind"],
        description=(data.get("description") or "").strip() or None, is_active=True,
        category=(data.get("category") or "").strip() or default_category(None, data["kind"], data["code"].strip()),
    )
    db.add(acct)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"Account code {acct.code} is already used.")
    db.refresh(acct)
    return account_dict(acct)


def _has_lines(db: Session, account_id: int) -> bool:
    return db.execute(
        select(func.count()).select_from(JournalLine).where(JournalLine.account_id == account_id)
    ).scalar_one() > 0


def update_account(db: Session, user: User, account_id: int, data: dict) -> dict:
    acct = db.get(LedgerAccount, account_id)
    if not acct or acct.school_id != user.school_id:
        raise _404("Account")
    if data.get("code") is not None:
        acct.code = data["code"].strip()
    if data.get("name") is not None:
        acct.name = data["name"].strip()
    if data.get("category") is not None:
        acct.category = data["category"].strip() or default_category(acct.system_key, acct.kind, acct.code)
    if "description" in data and data["description"] is not None:
        acct.description = data["description"].strip() or None
    if data.get("kind") is not None and data["kind"] != acct.kind:
        if acct.system_key:
            raise _400("This account receives automatic postings; its kind cannot change.")
        if data["kind"] not in KINDS:
            raise _400("Kind must be asset, liability, equity, income or expense.")
        if _has_lines(db, acct.id):
            raise _400("This account has journal entries; void them before changing its kind.")
        acct.kind = data["kind"]
    if data.get("is_active") is not None:
        if acct.system_key and not data["is_active"]:
            raise _400("This account receives automatic postings and cannot be switched off.")
        acct.is_active = bool(data["is_active"])
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"Account code {acct.code} is already used.")
    db.refresh(acct)
    return account_dict(acct)


def delete_account(db: Session, user: User, account_id: int) -> None:
    acct = db.get(LedgerAccount, account_id)
    if not acct or acct.school_id != user.school_id:
        raise _404("Account")
    if acct.system_key:
        raise _400("This account receives automatic postings and cannot be deleted.")
    if _has_lines(db, acct.id):
        raise _400("This account has journal entries. Switch it off instead.")
    db.delete(acct)
    db.commit()


# ---------- postings ----------


def _span(col, frm: Optional[date], to: Optional[date]) -> list:
    conds = []
    if frm:
        conds.append(col >= frm)
    if to:
        conds.append(col <= to)
    return conds


def _entry(d, source, source_id, voucher, narration, lines, *,
           students: Optional[list] = None, student_name: Optional[str] = None,
           detail: Optional[str] = None) -> dict:
    """One posting. `students` are the children it concerns (a receipt has
    one; a fees-raised line has everyone it was raised for); `detail` is the
    narration without the child's name, for ledgers that show the name apart."""
    return {
        "date": d, "source": source, "source_id": source_id, "voucher": voucher,
        "narration": narration, "lines": lines,
        "students": students or [], "student_name": student_name, "detail": detail or narration,
    }


def _line(key_or_id, debit=ZERO, credit=ZERO) -> dict:
    return {"ref": key_or_id, "debit": _m(debit), "credit": _m(credit)}


def entries(db: Session, user: User, frm: Optional[date], to: Optional[date]) -> list[dict]:
    """Every posting dated frm..to (either end open), oldest first, with each
    line's account resolved to an id."""
    sid = user.school_id
    by_key = ensure_chart(db, user)
    out: list[dict] = []

    # fees raised: one entry per head, period and due date
    charge = case(
        (StudentFee.status == FeeStatus.waived, StudentFee.amount_paid),
        else_=StudentFee.amount_due,
    )
    for due, hid, head, period, n, amt, kids in db.execute(
        select(StudentFee.due_date, StudentFee.fee_head_id, FeeHead.name, StudentFee.period,
               func.count(), func.sum(charge), func.array_agg(func.distinct(StudentFee.student_id)))
        .join(FeeHead, FeeHead.id == StudentFee.fee_head_id)
        .where(StudentFee.school_id == sid, *_span(StudentFee.due_date, frm, to))
        .group_by(StudentFee.due_date, StudentFee.fee_head_id, FeeHead.name, StudentFee.period)
    ).all():
        if not amt:
            continue
        label = "one-time" if period == "ONETIME" else period
        out.append(_entry(
            due, "fees_raised", None, None,
            f"{head} ({label}) due for {n} student{'s' if n != 1 else ''}",
            [_line("fees_receivable", debit=amt), _line(f"fee_head:{hid}", credit=amt)],
            students=list(kids or []), detail=f"{head} ({label}) raised",
        ))

    for cid, on, amt, mode, rno, name, head, period, kid in db.execute(
        select(FeeCollection.id, FeeCollection.collected_on, FeeCollection.amount, FeeCollection.mode,
               FeeCollection.receipt_no, Student.full_name, FeeHead.name, StudentFee.period, FeeCollection.student_id)
        .join(StudentFee, StudentFee.id == FeeCollection.student_fee_id)
        .join(FeeHead, FeeHead.id == StudentFee.fee_head_id)
        .join(Student, Student.id == FeeCollection.student_id)
        .where(FeeCollection.school_id == sid, *_span(FeeCollection.collected_on, frm, to))
    ).all():
        label = "" if period == "ONETIME" else f" {period}"
        out.append(_entry(
            on, "fee_receipt", cid, rno, f"{name}: {head}{label}",
            [_line(_money_key(mode), debit=amt), _line("fees_receivable", credit=amt)],
            students=[kid], student_name=name, detail=f"{head}{label}",
        ))

    for rid, on, amt, mode, ref, reason, name, kid in db.execute(
        select(Refund.id, Refund.processed_on, Refund.amount, Refund.mode, Refund.reference,
               Refund.reason, Student.full_name, Refund.student_id)
        .join(Student, Student.id == Refund.student_id)
        .where(Refund.school_id == sid, Refund.status == RefundStatus.processed,
               Refund.processed_on.is_not(None), *_span(Refund.processed_on, frm, to))
    ).all():
        out.append(_entry(
            on, "refund", rid, ref, f"Refund to {name}: {reason}"[:300],
            [_line("fees_receivable", debit=amt), _line(_money_key(mode), credit=amt)],
            students=[kid], student_name=name, detail=f"Refund: {reason}"[:300],
        ))

    labels = dict(INCOME_SOURCES)
    for iid, on, amt, mode, src, payer, rno in db.execute(
        select(OtherIncome.id, OtherIncome.received_on, OtherIncome.amount, OtherIncome.mode,
               OtherIncome.source, OtherIncome.payer, OtherIncome.receipt_no)
        .where(OtherIncome.school_id == sid, OtherIncome.is_void.is_(False),
               *_span(OtherIncome.received_on, frm, to))
    ).all():
        key = f"income:{src}" if f"income:{src}" in by_key else "income:other"
        out.append(_entry(
            on, "other_income", iid, rno, f"{labels.get(src, src.title())} from {payer}",
            [_line(_money_key(mode), debit=amt), _line(key, credit=amt)],
        ))

    for sale_id, on, amt, pay, bno, buyer, name, kid in db.execute(
        select(StoreSale.id, StoreSale.sold_on, StoreSale.total, StoreSale.payment, StoreSale.bill_no,
               StoreSale.buyer_name, Student.full_name, StoreSale.student_id)
        .join(Student, Student.id == StoreSale.student_id, isouter=True)
        .where(StoreSale.school_id == sid, StoreSale.is_void.is_(False),
               StoreSale.payment != StorePayment.add_to_fees,  # those come in as fees
               *_span(StoreSale.sold_on, frm, to))
    ).all():
        out.append(_entry(
            on, "store_sale", sale_id, bno, f"Store sale to {name or buyer or 'a walk-in buyer'}",
            [_line(_money_key(pay), debit=amt), _line("store_sales", credit=amt)],
            students=[kid] if kid else [], student_name=name, detail="Store sale",
        ))

    for eid, on, amt, mode, cat_id, desc, ref, payee, supplier in db.execute(
        select(Expense.id, Expense.spent_on, Expense.amount, Expense.mode, Expense.category_id,
               Expense.description, Expense.reference, Expense.payee, Supplier.name)
        .join(Supplier, Supplier.id == Expense.supplier_id, isouter=True)
        .where(Expense.school_id == sid, Expense.is_void.is_(False), *_span(Expense.spent_on, frm, to))
    ).all():
        who = supplier or payee
        out.append(_entry(
            on, "expense", eid, ref, f"{desc}{f' ({who})' if who else ''}"[:300],
            # the amount already includes any tax
            [_line(f"expense_cat:{cat_id}", debit=amt), _line(_money_key(mode), credit=amt)],
        ))

    for bid, on, amt, tax, bno, supplier in db.execute(
        select(VendorBill.id, VendorBill.billed_on, VendorBill.amount, VendorBill.tax_amount,
               VendorBill.bill_no, Supplier.name)
        .join(Supplier, Supplier.id == VendorBill.supplier_id, isouter=True)
        .where(VendorBill.school_id == sid, VendorBill.status != BillStatus.cancelled,
               *_span(VendorBill.billed_on, frm, to))
    ).all():
        total = _m(amt) + _m(tax)
        out.append(_entry(
            on, "vendor_bill", bid, bno, f"Bill {bno} from {supplier or 'a supplier'}",
            [_line("purchases", debit=total), _line("payables", credit=total)],
        ))

    for pid, on, amt, mode, ref, bno, supplier in db.execute(
        select(VendorPayment.id, VendorPayment.paid_on, VendorPayment.amount, VendorPayment.mode,
               VendorPayment.reference, VendorBill.bill_no, Supplier.name)
        .join(VendorBill, VendorBill.id == VendorPayment.bill_id)
        .join(Supplier, Supplier.id == VendorBill.supplier_id, isouter=True)
        .where(VendorPayment.school_id == sid, *_span(VendorPayment.paid_on, frm, to))
    ).all():
        out.append(_entry(
            on, "vendor_payment", pid, ref, f"Paid {supplier or 'supplier'} against bill {bno}",
            [_line("payables", debit=amt), _line(_money_key(mode), credit=amt)],
        ))

    for run_id, on, period, ref, gross, net, employer in db.execute(
        select(PayrollRun.id, PayrollRun.paid_on, PayrollRun.period, PayrollRun.payment_ref,
               func.coalesce(func.sum(Payslip.gross), 0), func.coalesce(func.sum(Payslip.net_pay), 0),
               func.coalesce(func.sum(Payslip.pf_employer + Payslip.esi_employer), 0))
        .join(Payslip, Payslip.run_id == PayrollRun.id)
        .where(PayrollRun.school_id == sid, PayrollRun.status == PayrollRunStatus.paid,
               PayrollRun.paid_on.is_not(None), *_span(PayrollRun.paid_on, frm, to))
        .group_by(PayrollRun.id, PayrollRun.paid_on, PayrollRun.period, PayrollRun.payment_ref)
    ).all():
        gross, net, employer = _m(gross), _m(net), _m(employer)
        lines = [_line("salaries", debit=gross)]
        if employer:
            lines.append(_line("employer_contrib", debit=employer))
        lines.append(_line("bank", credit=net))
        held = gross + employer - net  # deductions and the employer's share, owed to the authorities
        if held:
            lines.append(_line("payroll_deductions", credit=held))
        out.append(_entry(on, "payroll", run_id, ref, f"Salaries for {period}", lines))

    jes = list(db.execute(
        select(JournalEntry).where(
            JournalEntry.school_id == sid, JournalEntry.is_void.is_(False),
            *_span(JournalEntry.entry_date, frm, to),
        )
    ).scalars())
    if jes:
        jlines = defaultdict(list)
        for ln in db.execute(
            select(JournalLine).where(JournalLine.entry_id.in_([j.id for j in jes])).order_by(JournalLine.id)
        ).scalars():
            jlines[ln.entry_id].append({"ref": ln.account_id, "debit": _m(ln.debit), "credit": _m(ln.credit), "note": ln.note})
        for j in jes:
            out.append(_entry(j.entry_date, "journal", j.id, j.entry_no, j.narration, jlines[j.id]))

    for e in out:
        for ln in e["lines"]:
            ref = ln.pop("ref")
            if isinstance(ref, str):
                acct = by_key.get(ref)
                if acct is None:  # a head or category made since the chart was read
                    by_key = ensure_chart(db, user)
                    acct = by_key[ref]
                ln["account_id"] = acct.id
            else:
                ln["account_id"] = ref
    order = list(SOURCE_LABEL)
    out.sort(key=lambda e: (e["date"], order.index(e["source"]), e["source_id"] or 0))
    return out


def _balances(rows: Iterable[dict], accts: dict[int, LedgerAccount]) -> tuple[dict[int, Decimal], set[int]]:
    """Natural-sign balance per account: debit-normal kinds count debits up."""
    dr, cr = defaultdict(lambda: ZERO), defaultdict(lambda: ZERO)
    for e in rows:
        for ln in e["lines"]:
            dr[ln["account_id"]] += ln["debit"]
            cr[ln["account_id"]] += ln["credit"]
    used = set(dr) | set(cr)
    out = {}
    for aid in used:
        a = accts.get(aid)
        if a is None:
            continue
        out[aid] = dr[aid] - cr[aid] if a.kind in DEBIT_NORMAL else cr[aid] - dr[aid]
    return out, used


def _window(frm: Optional[date], to: Optional[date]) -> tuple[date, date]:
    to = to or date.today()
    frm = frm or fy_start(to)
    if to < frm:
        raise _400("'to' is before 'from'.")
    return frm, to


# ---------- reports ----------


def day_book(
    db: Session, user: User, frm: Optional[date], to: Optional[date], *,
    source: Optional[str] = None, page: int = 1, page_size: int = 100,
) -> dict:
    frm, to = _window(frm, to)
    if (to - frm).days > 400:
        raise _400("Pick a range of at most about a year.")
    accts = _accounts(db, user.school_id)
    rows = entries(db, user, frm, to)
    if source:
        rows = [e for e in rows if e["source"] == source]
    total_dr = sum((ln["debit"] for e in rows for ln in e["lines"]), ZERO)
    start = (page - 1) * page_size
    items = []
    for e in rows[start:start + page_size]:
        items.append({
            **e,
            "source_label": SOURCE_LABEL[e["source"]],
            "lines": [
                {**ln, "account_code": accts[ln["account_id"]].code, "account_name": accts[ln["account_id"]].name}
                for ln in e["lines"]
            ],
        })
    return {
        "from_date": frm, "to_date": to, "items": items, "total": len(rows),
        "page": page, "page_size": page_size, "total_debit": total_dr, "total_credit": total_dr,
    }


def account_ledger(
    db: Session, user: User, account_id: int, frm: Optional[date], to: Optional[date]
) -> dict:
    """One account's entries in the window with a running balance, the
    opening carried in, how many debits and credits there were, and how many
    different children the entries concern."""
    frm, to = _window(frm, to)
    accts = _accounts(db, user.school_id)
    acct = accts.get(account_id)
    if acct is None:
        ensure_chart(db, user)
        accts = _accounts(db, user.school_id)
        acct = accts.get(account_id)
        if acct is None:
            raise _404("Account")
    sign = 1 if acct.kind in DEBIT_NORMAL else -1
    opening = ZERO
    balance = ZERO
    lines = []
    total_dr = total_cr = ZERO
    n_dr = n_cr = 0
    kids: set[int] = set()
    for e in entries(db, user, None, to):
        mine = [ln for ln in e["lines"] if ln["account_id"] == account_id]
        if not mine:
            continue
        dr = sum((ln["debit"] for ln in mine), ZERO)
        cr = sum((ln["credit"] for ln in mine), ZERO)
        if e["date"] < frm:
            opening += sign * (dr - cr)
            continue
        if not lines:
            balance = opening
        balance += sign * (dr - cr)
        total_dr += dr
        total_cr += cr
        n_dr += 1 if dr else 0
        n_cr += 1 if cr else 0
        kids.update(k for k in e["students"] if k)
        others = []
        for ln in e["lines"]:
            if ln["account_id"] != account_id:
                name = accts[ln["account_id"]].name
                if name not in others:
                    others.append(name)
        n_kids = len(e["students"])
        lines.append({
            "date": e["date"], "source": e["source"], "source_label": SOURCE_LABEL[e["source"]],
            "source_id": e["source_id"], "voucher": e["voucher"], "narration": e["narration"],
            "particulars": e["detail"],
            "student": e["student_name"] or (f"{n_kids} students" if n_kids > 1 else None),
            "against": others, "debit": dr, "credit": cr, "balance": balance,
        })
    closing = opening + sign * (total_dr - total_cr)
    return {
        "account": account_dict(acct),
        "from_date": frm, "to_date": to,
        "opening": opening, "total_debit": total_dr, "total_credit": total_cr,
        "debit_count": n_dr, "credit_count": n_cr,
        "closing": closing,
        # which side the closing sits on, as a ledger prints it
        "closing_side": ("Dr" if (closing > 0) == (sign > 0) else "Cr") if closing else None,
        "students": len(kids),
        "lines": lines,
    }


def trial_balance(
    db: Session, user: User, frm: Optional[date], to: Optional[date], *, account_id: Optional[int] = None,
) -> dict:
    """Opening, movement and closing for every account with anything in it.
    Closing balances are split into debit and credit columns, which must
    agree. `balanced` and `difference` are always for the whole book; an
    account filter only narrows the rows and their totals."""
    frm, to = _window(frm, to)
    rows_all = entries(db, user, None, to)
    accts = _accounts(db, user.school_id)  # entries() may have added accounts
    open_dr, open_cr = defaultdict(lambda: ZERO), defaultdict(lambda: ZERO)
    mov_dr, mov_cr = defaultdict(lambda: ZERO), defaultdict(lambda: ZERO)
    for e in rows_all:
        before = e["date"] < frm
        for ln in e["lines"]:
            aid = ln["account_id"]
            if before:
                open_dr[aid] += ln["debit"]
                open_cr[aid] += ln["credit"]
            else:
                mov_dr[aid] += ln["debit"]
                mov_cr[aid] += ln["credit"]
    cols = ("opening_debit", "opening_credit", "debit", "credit", "closing_debit", "closing_credit")
    rows = []
    for a in sorted(accts.values(), key=lambda a: (KINDS.index(a.kind), a.code)):
        o = open_dr[a.id] - open_cr[a.id]
        c = o + mov_dr[a.id] - mov_cr[a.id]
        if not (o or mov_dr[a.id] or mov_cr[a.id]):
            continue
        rows.append({
            "account_id": a.id, "code": a.code, "name": a.name, "kind": a.kind,
            "category": a.category or default_category(a.system_key, a.kind, a.code),
            "opening_debit": o if o > 0 else ZERO, "opening_credit": -o if o < 0 else ZERO,
            "debit": mov_dr[a.id], "credit": mov_cr[a.id],
            "closing_debit": c if c > 0 else ZERO, "closing_credit": -c if c < 0 else ZERO,
        })
    whole = {k: sum((r[k] for r in rows), ZERO) for k in cols}
    if account_id:
        rows = [r for r in rows if r["account_id"] == account_id]
    return {
        "from_date": frm, "to_date": to, "rows": rows,
        "totals": {k: sum((r[k] for r in rows), ZERO) for k in cols},
        "balanced": whole["closing_debit"] == whole["closing_credit"],
        "difference": whole["closing_debit"] - whole["closing_credit"],
        "accounts": [
            {"id": a.id, "code": a.code, "name": a.name, "kind": a.kind}
            for a in sorted(accts.values(), key=lambda a: (KINDS.index(a.kind), a.code))
        ],
    }


def profit_and_loss(
    db: Session, user: User, frm: Optional[date], to: Optional[date], *,
    category: Optional[str] = None, account_id: Optional[int] = None,
) -> dict:
    """Income and expenditure for the window. A school run by a trust calls
    the bottom line surplus or deficit rather than profit.

    Each account shows its opening (what built up from 1 April to the day
    before the window), the window's debits and credits, and its closing.
    The totals and the surplus are for the window itself.
    """
    frm, to = _window(frm, to)
    year_from = fy_start(frm)
    rows_all = entries(db, user, year_from, to)
    accts = _accounts(db, user.school_id)
    open_dr, open_cr = defaultdict(lambda: ZERO), defaultdict(lambda: ZERO)
    dr, cr = defaultdict(lambda: ZERO), defaultdict(lambda: ZERO)
    for e in rows_all:
        before = e["date"] < frm
        for ln in e["lines"]:
            aid = ln["account_id"]
            if before:
                open_dr[aid] += ln["debit"]
                open_cr[aid] += ln["credit"]
            else:
                dr[aid] += ln["debit"]
                cr[aid] += ln["credit"]

    def side(kind):
        sign = 1 if kind in DEBIT_NORMAL else -1
        out = []
        for a in sorted(accts.values(), key=lambda a: a.code):
            if a.kind != kind:
                continue
            cat = a.category or default_category(a.system_key, a.kind, a.code)
            if category and cat != category:
                continue
            if account_id and a.id != account_id:
                continue
            opening = sign * (open_dr[a.id] - open_cr[a.id])
            movement = sign * (dr[a.id] - cr[a.id])
            if not (opening or dr[a.id] or cr[a.id]):
                continue
            out.append({
                "account_id": a.id, "code": a.code, "name": a.name, "category": cat,
                "opening": opening, "debit": dr[a.id], "credit": cr[a.id],
                "amount": movement, "closing": opening + movement,
            })
        tot = {k: sum((r[k] for r in out), ZERO) for k in ("opening", "debit", "credit", "amount", "closing")}
        return out, tot

    income, ti = side("income")
    expense, te = side("expense")
    cats = sorted({
        a.category or default_category(a.system_key, a.kind, a.code)
        for a in accts.values() if a.kind in ("income", "expense")
    })
    return {
        "from_date": frm, "to_date": to, "year_from": year_from,
        "income": income, "total_income": ti["amount"], "income_totals": ti,
        "expenses": expense, "total_expenses": te["amount"], "expense_totals": te,
        "surplus": ti["amount"] - te["amount"],
        "opening_surplus": ti["opening"] - te["opening"],
        "closing_surplus": ti["closing"] - te["closing"],
        "categories": cats,
        "accounts": [
            {"id": a.id, "code": a.code, "name": a.name, "kind": a.kind}
            for a in sorted(accts.values(), key=lambda a: a.code) if a.kind in ("income", "expense")
        ],
    }


def balance_sheet(db: Session, user: User, as_of: Optional[date], account_id: Optional[int] = None) -> dict:
    """What the school owns and owes on a date. The surplus is not an
    account: it is income less expenditure, this year's and before."""
    as_of = as_of or date.today()
    year_from = fy_start(as_of)
    rows = entries(db, user, None, as_of)
    accts = _accounts(db, user.school_id)
    bal, _ = _balances(rows, accts)
    prior, _ = _balances([e for e in rows if e["date"] < year_from], accts)

    def side(kind):
        out = [
            {"account_id": a.id, "code": a.code, "name": a.name, "amount": bal[a.id]}
            for a in sorted(accts.values(), key=lambda a: a.code)
            if a.kind == kind and bal.get(a.id)
        ]
        return out, sum((r["amount"] for r in out), ZERO)

    def surplus(b):
        return sum((v for k, v in b.items() if accts[k].kind == "income"), ZERO) - sum(
            (v for k, v in b.items() if accts[k].kind == "expense"), ZERO
        )

    assets, ta = side("asset")
    liabilities, tl = side("liability")
    equity, tq = side("equity")
    total_surplus = surplus(bal)
    prior_surplus = surplus(prior)

    # The statement as printed: each side in lettered sections (A Current
    # assets, B Fixed assets ...), each line numbered A1, A2 and given a
    # schedule number, which is its ledger. Capital and the surplus close
    # the liabilities side so the two sides agree.
    cat = {a.id: a.category or default_category(a.system_key, a.kind, a.code) for a in accts.values()}
    for r in assets + liabilities + equity:
        r["category"] = cat[r["account_id"]]

    def grouped(rows, plan):
        taken, out = set(), []
        for title, cats in plan:
            mine = [r for r in rows if r["account_id"] not in taken and (cats is None or r["category"] in cats)]
            taken |= {r["account_id"] for r in mine}
            if mine:
                out.append({"title": title, "rows": mine})
        return out

    left = grouped(assets, [
        ("Current assets", {"Cash and bank", "Receivables", "Current assets"}),
        ("Fixed assets", {"Fixed assets"}),
        ("Other assets", None),
    ])
    right = grouped(liabilities, [
        ("Current liabilities", {"Current liabilities"}),
        ("Long-term liabilities", {"Loans"}),
        ("Other liabilities", None),
    ])
    capital = list(equity)
    if prior_surplus:
        capital.append({"account_id": None, "code": "", "name": "Surplus / (deficit) of earlier years", "amount": prior_surplus, "category": "Surplus"})
    if total_surplus - prior_surplus:
        capital.append({"account_id": None, "code": "", "name": "Surplus / (deficit) for the year", "amount": total_surplus - prior_surplus, "category": "Surplus"})
    if capital:
        right.append({"title": "Capital / reserves", "rows": capital})

    schedule = 0
    for sections in (left, right):
        for i, sec in enumerate(sections):
            sec["key"] = chr(65 + i)
            for j, r in enumerate(sec["rows"], 1):
                r["ref"] = f"{sec['key']}{j}"
                if r["account_id"] is not None:
                    schedule += 1
                    r["schedule"] = schedule
                else:
                    r["schedule"] = None
            sec["total"] = sum((r["amount"] for r in sec["rows"]), ZERO)
    if account_id:
        for sections in (left, right):
            for sec in sections:
                sec["rows"] = [r for r in sec["rows"] if r["account_id"] == account_id]
                sec["total"] = sum((r["amount"] for r in sec["rows"]), ZERO)
            sections[:] = [sec for sec in sections if sec["rows"]]

    current_assets = sum((r["amount"] for r in assets if r["category"] in {"Cash and bank", "Receivables", "Current assets"}), ZERO)
    current_liabs = sum((r["amount"] for r in liabilities if r["category"] == "Current liabilities"), ZERO)
    return {
        "as_of": as_of, "year_from": year_from,
        "assets": assets, "total_assets": ta,
        "liabilities": liabilities, "total_liabilities": tl,
        "equity": equity, "total_equity": tq,
        "surplus_previous_years": prior_surplus,
        "surplus_this_year": total_surplus - prior_surplus,
        "total_funds": tl + tq + total_surplus,
        "balanced": ta == tl + tq + total_surplus,
        "asset_sections": left,
        "liability_sections": right,
        "net_assets": ta - tl,
        "current_ratio": round(float(current_assets / current_liabs), 2) if current_liabs > 0 else None,
        "accounts": [
            {"id": a.id, "code": a.code, "name": a.name, "kind": a.kind}
            for a in sorted(accts.values(), key=lambda a: a.code) if a.kind in ("asset", "liability", "equity")
        ],
    }


# ---------- journal vouchers ----------


def journal_dict(db: Session, j: JournalEntry) -> dict:
    lines = list(db.execute(
        select(JournalLine, LedgerAccount)
        .join(LedgerAccount, LedgerAccount.id == JournalLine.account_id)
        .where(JournalLine.entry_id == j.id).order_by(JournalLine.id)
    ).all())
    who = db.get(User, j.created_by_user_id) if j.created_by_user_id else None
    return {
        "id": j.id, "entry_no": j.entry_no, "entry_date": j.entry_date, "narration": j.narration,
        "reference": j.reference, "is_void": j.is_void, "void_reason": j.void_reason,
        "created_by_name": who.full_name if who else None, "created_at": j.created_at,
        "total": sum((_m(ln.debit) for ln, _ in lines), ZERO),
        "lines": [
            {"account_id": a.id, "account_code": a.code, "account_name": a.name,
             "debit": _m(ln.debit), "credit": _m(ln.credit), "note": ln.note}
            for ln, a in lines
        ],
    }


def list_journals(db: Session, user: User, frm: Optional[date], to: Optional[date]) -> list[dict]:
    frm, to = _window(frm, to)
    rows = db.execute(
        select(JournalEntry).where(
            JournalEntry.school_id == user.school_id, JournalEntry.entry_date.between(frm, to)
        ).order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
    ).scalars()
    return [journal_dict(db, j) for j in rows]


def get_journal(db: Session, user: User, entry_id: int) -> dict:
    j = db.get(JournalEntry, entry_id)
    if not j or j.school_id != user.school_id:
        raise _404("Journal entry")
    return journal_dict(db, j)


def create_journal(db: Session, user: User, data: dict) -> dict:
    ensure_chart(db, user)
    lines = data["lines"]
    if len(lines) < 2:
        raise _400("A journal entry needs at least two lines.")
    accts = _accounts(db, user.school_id)
    dr = cr = ZERO
    seen = set()
    for i, ln in enumerate(lines, 1):
        a = accts.get(int(ln["account_id"]))
        if a is None:
            raise _400(f"Line {i}: that account is not in this school's chart.")
        if not a.is_active:
            raise _400(f"Line {i}: {a.name} is switched off.")
        d, c = _m(ln.get("debit")), _m(ln.get("credit"))
        if d < 0 or c < 0:
            raise _400(f"Line {i}: amounts cannot be negative.")
        if (d > 0) == (c > 0):
            raise _400(f"Line {i}: enter either a debit or a credit.")
        dr += d
        cr += c
        seen.add(a.id)
    if dr != cr:
        raise _400(f"Debits ({dr}) and credits ({cr}) must be equal.")
    if len(seen) < 2:
        raise _400("A journal entry must touch at least two accounts.")

    count = db.execute(
        select(func.count()).select_from(JournalEntry).where(JournalEntry.school_id == user.school_id)
    ).scalar_one()
    for attempt in range(5):
        j = JournalEntry(
            tenant_id=user.tenant_id, school_id=user.school_id,
            entry_no=f"JV-{count + 1 + attempt:05d}", entry_date=data["entry_date"],
            narration=data["narration"].strip(), reference=(data.get("reference") or "").strip() or None,
            created_by_user_id=user.id,
        )
        db.add(j)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            continue
        for ln in lines:
            db.add(JournalLine(
                entry_id=j.id, account_id=int(ln["account_id"]),
                debit=_m(ln.get("debit")), credit=_m(ln.get("credit")),
                note=(ln.get("note") or "").strip() or None,
            ))
        db.commit()
        db.refresh(j)
        return journal_dict(db, j)
    raise HTTPException(status.HTTP_409_CONFLICT, "Could not number the entry; try again.")


def void_journal(db: Session, user: User, entry_id: int, reason: str) -> dict:
    j = db.get(JournalEntry, entry_id)
    if not j or j.school_id != user.school_id:
        raise _404("Journal entry")
    if j.is_void:
        raise _400("That entry is already void.")
    j.is_void = True
    j.void_reason = reason.strip()
    db.commit()
    db.refresh(j)
    return journal_dict(db, j)
