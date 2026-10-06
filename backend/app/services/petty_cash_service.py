"""Petty cash on the imprest system: the school keeps a float (₹5,000, say)
with a custodian, who pays small bills from it against a voucher, and tops it
back up to the float from the main cash or the bank.

A top-up moves money into Petty cash (Petty cash Dr, Cash or Bank Cr); a
spend is an expense paid from it (the category's expense account Dr, Petty
cash Cr). books_service posts both, so petty spending shows in the income and
expenditure account under its category, and the cash book counts a top-up as
money out of the main cash.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.accounts import ExpenseCategory, PettyCashEntry
from app.models.tenant import School
from app.models.user import User

ZERO = Decimal("0")
TOPUP_MODES = ("cash", "bank_transfer", "cheque", "upi")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def balance(db: Session, school_id: int, on: Optional[date] = None) -> Decimal:
    """What the custodian should be holding (up to and including `on`)."""
    conds = [PettyCashEntry.school_id == school_id, PettyCashEntry.is_void.is_(False)]
    if on:
        conds.append(PettyCashEntry.entry_date <= on)
    rows = db.execute(select(PettyCashEntry.kind, func.coalesce(func.sum(PettyCashEntry.amount), 0))
                      .where(*conds).group_by(PettyCashEntry.kind)).all()
    got = {k: Decimal(v) for k, v in rows}
    return got.get("topup", ZERO) - got.get("spend", ZERO)


def _next_no(db: Session, school_id: int) -> str:
    n = db.execute(select(func.count(PettyCashEntry.id)).where(PettyCashEntry.school_id == school_id)).scalar_one()
    return f"PC-{n + 1:05d}"


def _row(e: PettyCashEntry, cats: dict[int, str], names: dict[int, str]) -> dict:
    return {
        "id": e.id, "entry_no": e.entry_no, "entry_date": e.entry_date, "kind": e.kind, "amount": e.amount,
        "mode": e.mode, "category_id": e.category_id, "category": cats.get(e.category_id) if e.category_id else None,
        "paid_to": e.paid_to, "description": e.description, "bill_no": e.bill_no,
        "is_void": e.is_void, "void_reason": e.void_reason, "created_by_name": names.get(e.created_by_user_id),
    }


def summary(db: Session, school_id: int, frm: date, to: date) -> dict:
    school = db.get(School, school_id)
    rows = db.execute(select(PettyCashEntry).where(
        PettyCashEntry.school_id == school_id, PettyCashEntry.entry_date.between(frm, to)
    ).order_by(PettyCashEntry.entry_date.desc(), PettyCashEntry.id.desc())).scalars().all()
    cats = dict(db.execute(select(ExpenseCategory.id, ExpenseCategory.name).where(ExpenseCategory.school_id == school_id)).all())
    names = dict(db.execute(select(User.id, User.full_name).where(
        User.id.in_({r.created_by_user_id for r in rows if r.created_by_user_id} or {-1})
    )).all())
    bal = balance(db, school_id)
    # spent since the last top-up: what the next top-up should cover
    last_topup = db.execute(select(func.max(PettyCashEntry.id)).where(
        PettyCashEntry.school_id == school_id, PettyCashEntry.kind == "topup", PettyCashEntry.is_void.is_(False)
    )).scalar_one()
    since = db.execute(select(func.coalesce(func.sum(PettyCashEntry.amount), 0)).where(
        PettyCashEntry.school_id == school_id, PettyCashEntry.kind == "spend", PettyCashEntry.is_void.is_(False),
        PettyCashEntry.id > (last_topup or 0),
    )).scalar_one()
    live = [r for r in rows if not r.is_void]
    by_cat: dict[str, Decimal] = {}
    for r in live:
        if r.kind == "spend":
            by_cat[cats.get(r.category_id, "Other")] = by_cat.get(cats.get(r.category_id, "Other"), ZERO) + r.amount
    return {
        "float": school.petty_cash_float,
        "balance": bal,
        "spent_since_topup": Decimal(since),
        "top_up_to_float": max(school.petty_cash_float - bal, ZERO),
        "low": bal < school.petty_cash_float * Decimal("0.2"),
        "from_date": frm, "to_date": to,
        "spent": sum((r.amount for r in live if r.kind == "spend"), ZERO),
        "topped_up": sum((r.amount for r in live if r.kind == "topup"), ZERO),
        "by_category": [{"category": k, "amount": v} for k, v in sorted(by_cat.items(), key=lambda kv: -kv[1])],
        "entries": [_row(r, cats, names) for r in rows],
    }


def spend(db: Session, user: User, entry_date: date, amount: Decimal, category_id: int, description: str,
          paid_to: Optional[str], bill_no: Optional[str]) -> dict:
    if amount <= 0:
        raise _400("Enter the amount paid")
    if entry_date > date.today():
        raise _400("The date is in the future")
    cat = db.get(ExpenseCategory, category_id)
    if not cat or cat.school_id != user.school_id:
        raise _400("Choose what it was spent on")
    if not (description or "").strip():
        raise _400("Say what was bought or paid for")
    held = balance(db, user.school_id, entry_date)
    if amount > held:
        raise _400(f"Petty cash holds only Rs {held:,.2f} on {entry_date:%d %b %Y}. Top it up first.")
    e = PettyCashEntry(tenant_id=user.tenant_id, school_id=user.school_id, entry_no=_next_no(db, user.school_id),
                       entry_date=entry_date, kind="spend", amount=amount, category_id=cat.id,
                       paid_to=(paid_to or "").strip() or None, description=description.strip()[:300],
                       bill_no=(bill_no or "").strip() or None, created_by_user_id=user.id)
    db.add(e)
    db.commit()
    return {"id": e.id, "entry_no": e.entry_no, "balance": balance(db, user.school_id)}


def topup(db: Session, user: User, entry_date: date, amount: Decimal, mode: str, description: Optional[str]) -> dict:
    if amount <= 0:
        raise _400("Enter the amount put into petty cash")
    if entry_date > date.today():
        raise _400("The date is in the future")
    if mode not in TOPUP_MODES:
        raise _400("Say where the money came from")
    if mode == "cash":
        from app.services import accounts_service

        in_hand = accounts_service.cash_in_hand(db, user.school_id, entry_date)
        if amount > in_hand:
            raise _400(f"Only Rs {in_hand:,.2f} cash is in hand on {entry_date:%d %b %Y}")
    e = PettyCashEntry(tenant_id=user.tenant_id, school_id=user.school_id, entry_no=_next_no(db, user.school_id),
                       entry_date=entry_date, kind="topup", amount=amount, mode=mode,
                       description=(description or "").strip()[:300] or "Petty cash top-up", created_by_user_id=user.id)
    db.add(e)
    db.commit()
    return {"id": e.id, "entry_no": e.entry_no, "balance": balance(db, user.school_id)}


def void(db: Session, user: User, entry_id: int, reason: str) -> dict:
    """Cancel an entry made in error; it stays on the list, struck through."""
    e = db.get(PettyCashEntry, entry_id)
    if not e or e.school_id != user.school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    if e.is_void:
        raise _400("Already cancelled")
    if not (reason or "").strip():
        raise _400("Say why it is cancelled")
    if e.kind == "topup" and balance(db, user.school_id) - e.amount < 0:
        raise _400("Cancelling this top-up would leave petty cash below zero; cancel the spends made from it first")
    e.is_void, e.void_reason = True, reason.strip()[:200]
    db.commit()
    return {"balance": balance(db, user.school_id)}


def set_float(db: Session, user: User, amount: Decimal) -> dict:
    if amount < 0:
        raise _400("The float can't be negative")
    school = db.get(School, user.school_id)
    school.petty_cash_float = amount
    db.commit()
    return {"float": school.petty_cash_float}
