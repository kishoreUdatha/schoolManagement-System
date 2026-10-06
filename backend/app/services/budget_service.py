"""Budgets: a yearly amount for each income and expense account, and how the
year is going against it.

The year is the financial year (1 April to 31 March). Actuals come from the
books (books_service.profit_and_loss), so every fee, expense, petty cash
spend, bill and salary counts. "Expected by now" is the budget spread evenly
over the months gone, which is what a trust or management usually compares.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.ledger import Budget, LedgerAccount
from app.models.user import User
from app.services import books_service

ZERO = Decimal("0")


def _year(year_from: Optional[date]) -> tuple[date, date]:
    start = books_service.fy_start(year_from or date.today())
    return start, date(start.year + 1, 3, 31)


def report(db: Session, user: User, year_from: Optional[date] = None) -> dict:
    start, end = _year(year_from)
    books_service.ensure_chart(db, user)
    today = date.today()
    upto = min(end, today) if start <= today else start
    pl = books_service.profit_and_loss(db, user, start, upto) if start <= today else None
    actual = {}
    if pl:
        for r in pl["income"] + pl["expenses"]:
            actual[r["account_id"]] = r["amount"]
    budgets = {b.account_id: b for b in db.execute(select(Budget).where(
        Budget.school_id == user.school_id, Budget.year_from == start)).scalars()}
    # share of the year gone, in whole months (April counts once it has begun)
    months_gone = 0 if today < start else min(12, (min(today, end).year - start.year) * 12 + min(today, end).month - start.month + 1)
    accounts = db.execute(select(LedgerAccount).where(
        LedgerAccount.school_id == user.school_id, LedgerAccount.kind.in_(("income", "expense"))
    ).order_by(LedgerAccount.code)).scalars().all()

    def rows(kind):
        out = []
        for a in accounts:
            if a.kind != kind:
                continue
            b = budgets.get(a.id)
            amt = b.amount if b else None
            act = actual.get(a.id, ZERO)
            if amt is None and not act and not a.is_active:
                continue
            expected = (amt * months_gone / 12).quantize(Decimal("0.01")) if amt is not None else None
            used = (act / amt * 100).quantize(Decimal("0.1")) if amt else None
            # spending over its budget, or income short of what was expected by now
            over = amt is not None and (act > amt if kind == "expense" else False)
            ahead = expected is not None and kind == "expense" and act > expected and not over
            out.append({
                "account_id": a.id, "code": a.code, "name": a.name, "category": a.category,
                "budget": amt, "notes": b.notes if b else None, "actual": act,
                "expected_by_now": expected, "remaining": (amt - act) if amt is not None else None,
                "used_pct": used, "over_budget": over, "ahead_of_plan": ahead,
            })
        return out

    income, expense = rows("income"), rows("expense")

    def tot(rs, key):
        return sum((r[key] or ZERO for r in rs), ZERO)

    return {
        "year_from": start, "year_to": end, "as_of": upto, "months_gone": months_gone,
        "income": income, "expenses": expense,
        "totals": {
            "income_budget": tot(income, "budget"), "income_actual": tot(income, "actual"),
            "expense_budget": tot(expense, "budget"), "expense_actual": tot(expense, "actual"),
            # actuals of the budgeted accounts only, to set against the budget
            "income_actual_budgeted": tot([r for r in income if r["budget"] is not None], "actual"),
            "expense_actual_budgeted": tot([r for r in expense if r["budget"] is not None], "actual"),
        },
        "over_budget": sum(1 for r in expense if r["over_budget"]),
        "years": [{"year_from": date(start.year + k, 4, 1), "label": f"{start.year + k}-{str(start.year + k + 1)[2:]}"} for k in (-1, 0, 1)],
    }


def save(db: Session, user: User, year_from: date, lines: list[dict]) -> dict:
    """Set the year's budget, account by account. An empty amount removes it."""
    start, _ = _year(year_from)
    accts = {a.id: a for a in db.execute(select(LedgerAccount).where(LedgerAccount.school_id == user.school_id)).scalars()}
    have = {b.account_id: b for b in db.execute(select(Budget).where(
        Budget.school_id == user.school_id, Budget.year_from == start)).scalars()}
    for ln in lines:
        a = accts.get(int(ln["account_id"]))
        if a is None or a.kind not in ("income", "expense"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Budgets are for income and expense accounts")
        amount = ln.get("amount")
        b = have.get(a.id)
        if amount in (None, ""):
            if b is not None:
                db.delete(b)
            continue
        amount = Decimal(str(amount))
        if amount < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{a.name}: a budget can't be negative")
        if b is None:
            b = Budget(tenant_id=user.tenant_id, school_id=user.school_id, year_from=start, account_id=a.id, amount=amount)
            db.add(b)
            have[a.id] = b
        b.amount = amount
        b.notes = (ln.get("notes") or "").strip()[:200] or None
    db.commit()
    return report(db, user, start)


def copy_from_actuals(db: Session, user: User, year_from: date, uplift_pct: Decimal) -> dict:
    """Start a year's budget from last year's actuals, raised by a percentage
    (fees and costs both tend to rise). Accounts already budgeted are kept."""
    start, _ = _year(year_from)
    prev = date(start.year - 1, 4, 1)
    pl = books_service.profit_and_loss(db, user, prev, date(start.year, 3, 31))
    have = {b.account_id for b in db.execute(select(Budget).where(
        Budget.school_id == user.school_id, Budget.year_from == start)).scalars()}
    factor = 1 + uplift_pct / 100
    lines = [{"account_id": r["account_id"], "amount": (r["amount"] * factor).quantize(Decimal("1"))}
             for r in pl["income"] + pl["expenses"] if r["amount"] > 0 and r["account_id"] not in have]
    if not lines:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Nothing to copy: no income or spending in {prev.year}-{str(prev.year + 1)[2:]} that isn't budgeted already")
    return save(db, user, start, lines)
