"""Bank reconciliation: the bank's statement against the books.

A statement is uploaded as rows (date, description, reference, withdrawal,
deposit, balance). Each line is matched to the postings in the books that
touched the Bank account: fee receipts by UPI, transfer, card, cheque or the
gateway, cash deposited, supplier and vendor payments, salaries, refunds,
petty cash top-ups from the bank, journal vouchers. A posting is known by
its source and id (books_service.entries), so one bank line can match one
posting or several that add up to it (a day's UPI settlement, say).

Auto-match pairs a line with a posting of the same amount and direction
within a few days, preferring one whose reference appears in the bank's
description. What stays unmatched is the reconciliation: receipts and
payments in the books the bank hasn't shown yet, and bank charges, interest
and credits the books don't have yet, which can be recorded from here as a
journal voucher.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bank_rec import BankStatement, BankStatementLine
from app.models.ledger import LedgerAccount
from app.models.user import User
from app.services import books_service

ZERO = Decimal("0")
WINDOW = 5  # days a bank line may lag or lead its posting


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _404() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Statement not found")


# ---------- reading a statement ----------


_DATE_FORMATS = ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%y", "%d-%b-%Y", "%d %b %Y", "%d-%b-%y", "%d %b %y", "%d.%m.%Y", "%m/%d/%Y")


def parse_date(text: str) -> Optional[date]:
    t = (text or "").strip()
    for f in _DATE_FORMATS:
        try:
            return datetime.strptime(t, f).date()
        except ValueError:
            continue
    return None


def parse_amount(text) -> Decimal:
    t = re.sub(r"[^\d.\-]", "", str(text or "").replace(",", ""))
    if t in ("", "-", "."):
        return ZERO
    try:
        return abs(Decimal(t))
    except InvalidOperation:
        return ZERO


def create(db: Session, user: User, account_name: str, rows: list[dict], file_name: Optional[str],
           opening: Optional[str], closing: Optional[str]) -> dict:
    lines, errors = [], []
    for i, r in enumerate(rows, 1):
        d = parse_date(str(r.get("date") or ""))
        if d is None:
            errors.append(f"Row {i}: can't read the date '{r.get('date')}'")
            continue
        dr, cr = parse_amount(r.get("debit")), parse_amount(r.get("credit"))
        if not dr and not cr:
            continue  # an opening-balance or blank line
        if dr and cr:
            errors.append(f"Row {i}: both a withdrawal and a deposit")
            continue
        bal = r.get("balance")
        lines.append({"txn_date": d, "description": str(r.get("description") or "")[:300],
                      "reference": str(r.get("reference") or "")[:120] or None, "debit": dr, "credit": cr,
                      "balance": parse_amount(bal) if bal not in (None, "") else None})
    if not lines:
        raise _400("No transactions could be read. " + ("; ".join(errors[:3]) if errors else "Check the columns."))
    if errors and len(errors) > len(lines):
        raise _400("Most rows could not be read: " + "; ".join(errors[:3]))
    frm, to = min(x["txn_date"] for x in lines), max(x["txn_date"] for x in lines)
    st = BankStatement(tenant_id=user.tenant_id, school_id=user.school_id, account_name=(account_name or "Bank account").strip()[:120],
                       period_from=frm, period_to=to, file_name=(file_name or "")[:200] or None,
                       opening_balance=parse_amount(opening) if opening not in (None, "") else None,
                       closing_balance=parse_amount(closing) if closing not in (None, "") else (lines[-1]["balance"] if lines[-1]["balance"] is not None else None),
                       uploaded_by_user_id=user.id)
    db.add(st)
    db.flush()
    for n, x in enumerate(lines, 1):
        db.add(BankStatementLine(statement_id=st.id, school_id=user.school_id, line_no=n, status="unmatched", match_keys=[], **x))
    db.flush()
    auto_match(db, user, st.id, commit=False)
    db.commit()
    out = detail(db, user, st.id)
    out["skipped"] = errors
    return out


# ---------- the books' side ----------


def _bank_items(db: Session, user: User, frm: date, to: date) -> list[dict]:
    """Every posting that moved money in or out of the Bank account."""
    accts = books_service._accounts(db, user.school_id)
    bank_ids = {a.id for a in accts.values() if a.system_key == "bank"}
    out: list[dict] = []
    receipts: dict[tuple, dict] = {}
    for e in books_service.entries(db, user, frm, to):
        amt = sum((ln["debit"] - ln["credit"] for ln in e["lines"] if ln["account_id"] in bank_ids), ZERO)
        if not amt:
            continue
        key = f"{e['source']}:{e['source_id']}"
        direction = "in" if amt > 0 else "out"
        narration = e["narration"] + (f" - {e['student_name']}" if e.get("student_name") and e["student_name"] not in e["narration"] else "")
        # a receipt's fee lines are one payment, and the bank shows them as one credit
        if e["source"] == "fee_receipt" and e["voucher"]:
            g = receipts.get((e["voucher"], e["date"], direction))
            if g is None:
                g = {"key": f"receipt:{e['voucher']}", "members": [], "date": e["date"], "source": "fee_receipt",
                     "source_label": "Fee receipt", "voucher": e["voucher"],
                     "narration": f"Receipt {e['voucher']}" + (f" - {e['student_name']}" if e.get("student_name") else ""),
                     "amount": ZERO, "direction": direction}
                receipts[(e["voucher"], e["date"], direction)] = g
                out.append(g)
            g["members"].append(key)
            g["amount"] += abs(amt)
            continue
        out.append({"key": key, "members": [key], "date": e["date"], "source": e["source"],
                    "source_label": books_service.SOURCE_LABEL.get(e["source"], e["source"]), "voucher": e["voucher"],
                    "narration": narration, "amount": abs(amt), "direction": direction})
    return out


def _matched_keys(db: Session, school_id: int, except_line: Optional[int] = None) -> set[str]:
    keys = set()
    for lid, ks in db.execute(select(BankStatementLine.id, BankStatementLine.match_keys).where(
        BankStatementLine.school_id == school_id, BankStatementLine.status == "matched")).all():
        if lid != except_line:
            keys.update(ks or [])
    return keys


def _get(db: Session, school_id: int, statement_id: int) -> BankStatement:
    st = db.get(BankStatement, statement_id)
    if not st or st.school_id != school_id:
        raise _404()
    return st


def _lines(db: Session, statement_id: int) -> list[BankStatementLine]:
    return list(db.execute(select(BankStatementLine).where(BankStatementLine.statement_id == statement_id)
                           .order_by(BankStatementLine.line_no)).scalars())


# ---------- matching ----------


def auto_match(db: Session, user: User, statement_id: int, commit: bool = True) -> dict:
    st = _get(db, user.school_id, statement_id)
    items = _bank_items(db, user, st.period_from - timedelta(days=WINDOW), st.period_to + timedelta(days=WINDOW))
    taken = _matched_keys(db, user.school_id)
    free = [i for i in items if not set(i["members"]) & taken]
    made = 0
    for ln in _lines(db, st.id):
        if ln.status != "unmatched":
            continue
        direction, amount = ("in", ln.credit) if ln.credit else ("out", ln.debit)
        cands = [i for i in free if i["direction"] == direction and i["amount"] == amount
                 and abs((i["date"] - ln.txn_date).days) <= WINDOW]
        if not cands:
            continue
        text = f"{ln.description} {ln.reference or ''}".lower()

        def score(i):
            ref_hit = bool(i["voucher"]) and str(i["voucher"]).lower() in text
            return (0 if ref_hit else 1, abs((i["date"] - ln.txn_date).days))

        best = min(cands, key=score)
        ln.status, ln.match_keys, ln.match_note = "matched", list(best["members"]), "auto"
        free.remove(best)
        made += 1
    if commit:
        db.commit()
    return {"matched": made}


def match(db: Session, user: User, line_id: int, keys: list[str]) -> dict:
    ln = _line(db, user.school_id, line_id)
    if not keys:
        raise _400("Choose the entries in the books it matches")
    st = db.get(BankStatement, ln.statement_id)
    items = {i["key"]: i for i in _bank_items(db, user, st.period_from - timedelta(days=60), st.period_to + timedelta(days=60))}
    taken = _matched_keys(db, user.school_id, except_line=ln.id)
    direction, amount = ("in", ln.credit) if ln.credit else ("out", ln.debit)
    chosen = []
    for k in dict.fromkeys(keys):
        i = items.get(k)
        if i is None:
            raise _400("One of those entries isn't a bank entry in the books")
        if set(i["members"]) & taken:
            raise _400(f"{i['voucher'] or i['narration']} is matched to another bank line already")
        if i["direction"] != direction:
            raise _400("Money in matches money in, and money out matches money out")
        chosen.append(i)
    total = sum((i["amount"] for i in chosen), ZERO)
    if total != amount:
        raise _400(f"The entries add up to Rs {total:,.2f}, the bank line is Rs {amount:,.2f}")
    ln.status, ln.match_keys, ln.match_note = "matched", [m for i in chosen for m in i["members"]], "by hand"
    db.commit()
    return {"ok": True}


def _line(db: Session, school_id: int, line_id: int) -> BankStatementLine:
    ln = db.get(BankStatementLine, line_id)
    if not ln or ln.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Statement line not found")
    return ln


def unmatch(db: Session, user: User, line_id: int) -> dict:
    ln = _line(db, user.school_id, line_id)
    ln.status, ln.match_keys, ln.match_note = "unmatched", [], None
    db.commit()
    return {"ok": True}


def ignore(db: Session, user: User, line_id: int, reason: str) -> dict:
    """A line the books will never have (a transfer between the school's own
    accounts kept elsewhere, say): out of the reconciliation, with a reason."""
    ln = _line(db, user.school_id, line_id)
    if not (reason or "").strip():
        raise _400("Say why the line is set aside")
    ln.status, ln.match_keys, ln.match_note = "ignored", [], reason.strip()[:200]
    db.commit()
    return {"ok": True}


def _account(db: Session, user: User, name: str, kind: str, code_from: int) -> LedgerAccount:
    accts = books_service._accounts(db, user.school_id)
    for a in accts.values():
        if a.name.lower() == name.lower() and a.kind == kind:
            return a
    used = {a.code for a in accts.values()}
    a = LedgerAccount(tenant_id=user.tenant_id, school_id=user.school_id, code=books_service._next_code(code_from, used),
                      name=name, kind=kind, is_active=True, category=books_service.default_category(None, kind, ""),
                      description="Made by bank reconciliation.")
    db.add(a)
    db.flush()
    return a


def record(db: Session, user: User, line_id: int, kind: str, account_id: Optional[int], narration: Optional[str]) -> dict:
    """Put a bank-only line into the books as a journal voucher and match it:
    bank charges (Bank charges Dr / Bank Cr), interest (Bank Dr / Interest
    received Cr), or any other account the school picks."""
    ln = _line(db, user.school_id, line_id)
    if ln.status == "matched":
        raise _400("That line is matched already")
    chart = books_service.ensure_chart(db, user)
    bank = chart["bank"]
    amount = ln.debit or ln.credit
    money_in = bool(ln.credit)
    if kind == "charges":
        if money_in:
            raise _400("Bank charges are money out")
        other = _account(db, user, "Bank charges", "expense", 5401)
    elif kind == "interest":
        if not money_in:
            raise _400("Interest received is money in")
        other = chart.get("income:interest") or _account(db, user, "Interest received", "income", 4601)
    elif kind == "account":
        other = books_service._accounts(db, user.school_id).get(int(account_id or 0))
        if other is None:
            raise _400("Choose the account")
    else:
        raise _400("Choose what the line is")
    lines = ([{"account_id": bank.id, "debit": amount}, {"account_id": other.id, "credit": amount}] if money_in
             else [{"account_id": other.id, "debit": amount}, {"account_id": bank.id, "credit": amount}])
    jv = books_service.create_journal(db, user, {
        "entry_date": ln.txn_date, "status": "posted",
        "narration": (narration or "").strip() or f"{'Bank charges' if kind == 'charges' else 'Interest received' if kind == 'interest' else other.name}: {ln.description}"[:300],
        "reference": ln.reference, "description": "Recorded from the bank statement", "lines": lines,
    })
    ln.status, ln.match_keys, ln.match_note = "matched", [f"journal:{jv['id']}"], "recorded from the statement"
    db.commit()
    return {"voucher_no": jv.get("entry_no")}


# ---------- the reconciliation ----------


def _book_bank_balance(db: Session, user: User, as_of: date) -> Decimal:
    accts = books_service._accounts(db, user.school_id)
    bank_ids = {a.id for a in accts.values() if a.system_key == "bank"}
    total = ZERO
    for e in books_service.entries(db, user, None, as_of):
        for ln in e["lines"]:
            if ln["account_id"] in bank_ids:
                total += ln["debit"] - ln["credit"]
    return total


def detail(db: Session, user: User, statement_id: int) -> dict:
    st = _get(db, user.school_id, statement_id)
    lines = _lines(db, st.id)
    items = _bank_items(db, user, st.period_from - timedelta(days=WINDOW), st.period_to + timedelta(days=WINDOW))
    member_of = {m: i for i in items for m in i["members"]}
    taken = _matched_keys(db, user.school_id)
    # the books' bank entries around the statement's dates that no bank line has shown
    open_items = [{k: v for k, v in i.items() if k != "members"} for i in items
                  if not set(i["members"]) & taken and st.period_from - timedelta(days=WINDOW) <= i["date"] <= st.period_to]
    out_lines = []
    for ln in lines:
        out_lines.append({
            "id": ln.id, "line_no": ln.line_no, "date": ln.txn_date, "description": ln.description, "reference": ln.reference,
            "debit": ln.debit, "credit": ln.credit, "balance": ln.balance, "status": ln.status, "note": ln.match_note,
            "matches": _matches(ln.match_keys or [], member_of),
        })
    unmatched_bank_in = sum((ln.credit for ln in lines if ln.status == "unmatched"), ZERO)
    unmatched_bank_out = sum((ln.debit for ln in lines if ln.status == "unmatched"), ZERO)
    # set aside: real bank movements the books will not carry (an own-account transfer)
    aside_in = sum((ln.credit for ln in lines if ln.status == "ignored"), ZERO)
    aside_out = sum((ln.debit for ln in lines if ln.status == "ignored"), ZERO)
    book_in_open = sum((i["amount"] for i in open_items if i["direction"] == "in"), ZERO)
    book_out_open = sum((i["amount"] for i in open_items if i["direction"] == "out"), ZERO)
    books = _book_bank_balance(db, user, st.period_to)
    expected_bank = books - book_in_open + book_out_open + unmatched_bank_in - unmatched_bank_out + aside_in - aside_out
    return {
        "id": st.id, "account_name": st.account_name, "period_from": st.period_from, "period_to": st.period_to,
        "file_name": st.file_name, "opening_balance": st.opening_balance, "closing_balance": st.closing_balance,
        "lines": out_lines, "open_book_items": open_items,
        "counts": {"lines": len(lines), "matched": sum(1 for x in lines if x.status == "matched"),
                   "unmatched": sum(1 for x in lines if x.status == "unmatched"), "ignored": sum(1 for x in lines if x.status == "ignored")},
        "reconciliation": {
            "books_balance": books,
            "receipts_not_in_bank": book_in_open,
            "payments_not_in_bank": book_out_open,
            "bank_credits_not_in_books": unmatched_bank_in,
            "bank_debits_not_in_books": unmatched_bank_out,
            "set_aside": aside_in - aside_out,
            "expected_bank_balance": expected_bank,
            "statement_balance": st.closing_balance,
            "difference": (st.closing_balance - expected_bank) if st.closing_balance is not None else None,
        },
    }


def _matches(keys: list[str], member_of: dict) -> list[dict]:
    """The book items a line's posting keys belong to, each once."""
    out, seen = [], set()
    for k in keys:
        i = member_of.get(k)
        if i is None:
            out.append({"key": k, "narration": k.replace(":", " #"), "voucher": None, "amount": None, "date": None,
                        "source_label": k.split(":")[0]})
        elif i["key"] not in seen:
            seen.add(i["key"])
            out.append({x: v for x, v in i.items() if x != "members"})
    return out


def statements(db: Session, school_id: int) -> list[dict]:
    rows = db.execute(select(BankStatement).where(BankStatement.school_id == school_id)
                      .order_by(BankStatement.period_to.desc(), BankStatement.id.desc())).scalars().all()
    counts = {}
    for sid, st_, n in db.execute(select(BankStatementLine.statement_id, BankStatementLine.status, BankStatementLine.id)
                                  .where(BankStatementLine.school_id == school_id)).all():
        c = counts.setdefault(sid, {"lines": 0, "matched": 0, "unmatched": 0, "ignored": 0})
        c["lines"] += 1
        c[st_] += 1
    return [{"id": s.id, "account_name": s.account_name, "period_from": s.period_from, "period_to": s.period_to,
             "file_name": s.file_name, "closing_balance": s.closing_balance, **counts.get(s.id, {"lines": 0, "matched": 0, "unmatched": 0, "ignored": 0})}
            for s in rows]


def delete(db: Session, user: User, statement_id: int) -> None:
    """Take a statement out (uploaded in error). Vouchers recorded from it stay in the books."""
    st = _get(db, user.school_id, statement_id)
    for ln in _lines(db, st.id):
        db.delete(ln)
    db.delete(st)
    db.commit()
