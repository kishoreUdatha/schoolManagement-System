"""The books as a Tally import file (Tally Prime / Tally.ERP 9 XML).

Most schools' auditors keep the books in Tally. This writes every posting in
a period, the automatic ones (fees raised, receipts, expenses, petty cash,
bills, payroll, refunds…) and the journal vouchers, as Tally vouchers, with
the ledgers they use as masters first, so Gateway of Tally → Import → Masters
and Vouchers takes one file.

Tally's sign convention: a debit is ISDEEMEDPOSITIVE "Yes" with a negative
AMOUNT; a credit is "No" with a positive AMOUNT. Each ledger is put under
the nearest of Tally's own groups so reports come out right in Tally.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional
from xml.sax.saxutils import escape

from sqlalchemy.orm import Session

from app.models.tenant import School
from app.models.user import User
from app.services import books_service

ZERO = Decimal("0")
CASH_KEYS = ("cash", "bank", "petty_cash")


def tally_group(a) -> str:
    """The Tally group a ledger belongs under."""
    key, kind, cat = a.system_key or "", a.kind, (a.category or "")
    if key in ("cash", "petty_cash"):
        return "Cash-in-Hand"
    if key == "bank":
        return "Bank Accounts"
    if key == "fees_receivable":
        return "Sundry Debtors"
    if key == "payables":
        return "Sundry Creditors"
    if key == "payroll_deductions":
        return "Duties & Taxes"
    if key == "store_sales":
        return "Sales Accounts"
    if key == "purchases":
        return "Purchase Accounts"
    if kind == "asset":
        return "Fixed Assets" if cat == "Fixed assets" else "Current Assets"
    if kind == "liability":
        return "Loans (Liability)" if cat == "Loans" else "Current Liabilities"
    if kind == "equity":
        return "Capital Account"
    if kind == "income":
        return "Direct Incomes" if key.startswith("fee_head:") else "Indirect Incomes"
    return "Indirect Expenses"


def _amt(v: Decimal) -> str:
    return f"{v:.2f}"


def xml(db: Session, user: User, frm: Optional[date], to: Optional[date]) -> tuple[bytes, str, int]:
    frm, to = books_service._window(frm, to)
    rows = books_service.entries(db, user, frm, to)
    accts = books_service._accounts(db, user.school_id)
    school = db.get(School, user.school_id)
    cash_ids = {a.id for a in accts.values() if a.system_key in CASH_KEYS}

    # one ledger name per account; a name used twice gets its code added
    seen: dict[str, int] = {}
    for a in accts.values():
        seen[a.name.strip().lower()] = seen.get(a.name.strip().lower(), 0) + 1
    name = {aid: (a.name.strip() if seen[a.name.strip().lower()] == 1 else f"{a.name.strip()} ({a.code})") for aid, a in accts.items()}

    used = sorted({ln["account_id"] for e in rows for ln in e["lines"]}, key=lambda i: accts[i].code)
    out = [
        "<ENVELOPE>",
        "<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
        "<BODY><IMPORTDATA>",
        "<REQUESTDESC><REPORTNAME>All Masters</REPORTNAME>"
        f"<STATICVARIABLES><SVCURRENTCOMPANY>{escape(school.name)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>",
        "<REQUESTDATA>",
    ]
    for aid in used:
        a = accts[aid]
        n = escape(name[aid])
        out.append(
            f'<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="{n}" ACTION="Create">'
            f"<NAME.LIST><NAME>{n}</NAME></NAME.LIST><PARENT>{escape(tally_group(a))}</PARENT>"
            f"<ISBILLWISEON>No</ISBILLWISEON><AFFECTSSTOCK>No</AFFECTSSTOCK></LEDGER></TALLYMESSAGE>"
        )
    count = 0
    for e in rows:
        lines = [ln for ln in e["lines"] if ln["debit"] or ln["credit"]]
        if not lines:
            continue
        cash = [ln for ln in lines if ln["account_id"] in cash_ids]
        other = [ln for ln in lines if ln["account_id"] not in cash_ids]
        if cash and not other:
            vtype = "Contra"
        elif cash:
            vtype = "Receipt" if sum((ln["debit"] - ln["credit"] for ln in cash), ZERO) > 0 else "Payment"
        else:
            vtype = "Journal"
        vno = e["voucher"] or f"{e['source']}-{e['source_id']}"
        narration = e["narration"] + (f" - {e['student_name']}" if e.get("student_name") and e["student_name"] not in e["narration"] else "")
        body = [
            f'<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="{vtype}" ACTION="Create">',
            f"<DATE>{e['date']:%Y%m%d}</DATE><EFFECTIVEDATE>{e['date']:%Y%m%d}</EFFECTIVEDATE>",
            f"<VOUCHERTYPENAME>{vtype}</VOUCHERTYPENAME><VOUCHERNUMBER>{escape(str(vno))}</VOUCHERNUMBER>",
            f"<NARRATION>{escape(narration[:500])}</NARRATION>",
        ]
        for ln in lines:
            debit = ln["debit"] - ln["credit"]
            body.append(
                "<ALLLEDGERENTRIES.LIST>"
                f"<LEDGERNAME>{escape(name[ln['account_id']])}</LEDGERNAME>"
                f"<ISDEEMEDPOSITIVE>{'Yes' if debit > 0 else 'No'}</ISDEEMEDPOSITIVE>"
                f"<AMOUNT>{_amt(-debit)}</AMOUNT>"
                "</ALLLEDGERENTRIES.LIST>"
            )
        body.append("</VOUCHER></TALLYMESSAGE>")
        out.extend(body)
        count += 1
    out += ["</REQUESTDATA>", "</IMPORTDATA></BODY>", "</ENVELOPE>"]
    data = ('<?xml version="1.0" encoding="UTF-8"?>\n' + "\n".join(out) + "\n").encode("utf-8")
    return data, f"tally-{school.code or 'school'}-{frm:%Y%m%d}-{to:%Y%m%d}.xml", count
