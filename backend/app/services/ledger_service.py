"""Shared money helpers used by the fee, online-payment and accounts code:
per-payment receipts (FeeCollection) and fee concessions."""
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import ConcessionKind, MoneyMode
from app.models.accounts import Concession, FeeCollection
from app.models.fee import StudentFee


_MODE_ALIASES = {
    "cash": MoneyMode.cash,
    "cheque": MoneyMode.cheque,
    "check": MoneyMode.cheque,
    "upi": MoneyMode.upi,
    "gpay": MoneyMode.upi,
    "phonepe": MoneyMode.upi,
    "card": MoneyMode.card,
    "bank": MoneyMode.bank_transfer,
    "bank_transfer": MoneyMode.bank_transfer,
    "neft": MoneyMode.bank_transfer,
    "rtgs": MoneyMode.bank_transfer,
    "imps": MoneyMode.bank_transfer,
    "online": MoneyMode.online,
    "razorpay": MoneyMode.online,
}


def mode_from_text(text: Optional[str]) -> MoneyMode:
    """The fee screen stores payment_mode as free text; map it for reporting."""
    return _MODE_ALIASES.get((text or "").strip().lower().replace(" ", "_"), MoneyMode.other)


def next_receipt(db: Session, school_id: int, on: date) -> str:
    """The school's next receipt number for the month. Two counters must not
    get the same one, so the school's numbering is locked until the caller's
    transaction ends; several lines of one payment then share the number."""
    db.execute(text("select pg_advisory_xact_lock(:k)"), {"k": 7_000_000_000 + school_id})
    prefix = f"FR{on:%y%m}-"
    n = db.execute(
        select(func.count(func.distinct(FeeCollection.receipt_no)))
        .where(FeeCollection.school_id == school_id, FeeCollection.receipt_no.like(f"{prefix}%"))
    ).scalar_one()
    return f"{prefix}{n + 1:05d}"


def record_collection(
    db: Session,
    sf: StudentFee,
    amount: Decimal,
    mode: MoneyMode,
    *,
    reference: Optional[str] = None,
    on: Optional[date] = None,
    actor_id: Optional[int] = None,
    notes: Optional[str] = None,
    receipt_no: Optional[str] = None,
) -> Optional[FeeCollection]:
    """Add a receipt line in the caller's transaction (caller commits). Give
    `receipt_no` to add the line to a receipt already started in this
    payment; otherwise the line is a receipt of its own."""
    if amount <= 0:
        return None
    on = on or date.today()
    row = FeeCollection(
        tenant_id=sf.tenant_id,
        school_id=sf.school_id,
        student_fee_id=sf.id,
        student_id=sf.student_id,
        amount=amount,
        mode=mode,
        reference=reference,
        collected_on=on,
        receipt_no=receipt_no or next_receipt(db, sf.school_id, on),
        collected_by_user_id=actor_id,
        notes=notes,
    )
    db.add(row)
    db.flush()
    return row


def concession_for(db: Session, student_id: int, fee_head_id: int, amount: Decimal, on: date) -> tuple[Decimal, Optional[str]]:
    """Best single concession for this student/head on this date → (discount, note)."""
    rows = db.execute(
        select(Concession).where(
            Concession.student_id == student_id,
            Concession.is_active.is_(True),
            or_(Concession.fee_head_id.is_(None), Concession.fee_head_id == fee_head_id),
            Concession.valid_from <= on,
            or_(Concession.valid_to.is_(None), Concession.valid_to >= on),
        )
    ).scalars().all()
    best, note = Decimal("0"), None
    for c in rows:
        d = amount * c.value / 100 if c.kind == ConcessionKind.percent else c.value
        d = min(d, amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if d > best:
            best = d
            label = f"{c.value.normalize():f}%" if c.kind == ConcessionKind.percent else f"Rs. {c.value:,.2f}"
            note = f"Concession ({c.reason}) {label}: -{d:,.2f}"
    return best, note


def discounted(db: Session, student_id: int, fee_head_id: int, amount: Decimal, on: date) -> tuple[Decimal, Optional[str]]:
    d, note = concession_for(db, student_id, fee_head_id, amount, on)
    return amount - d, note
