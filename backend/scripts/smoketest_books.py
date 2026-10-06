"""Smoke test for the double-entry books (books_service).

Builds one of every money record — fees raised, a waived fee, receipts in
cash and UPI, a refund, other income, a store sale, an expense, a supplier
bill and part payment, a paid payroll run and an opening-balance journal,
plus a voided or cancelled twin of each that must stay out — and checks the
postings, the account ledger, the trial balance, income & expenditure and
the balance sheet.

Everything happens inside one transaction that is rolled back at the end
(service commits become savepoints), dated in FY 2031-32 so the school's
real entries are never mixed in. Nothing is left behind.

Run:
    docker exec sms-backend python -m scripts.smoketest_books
"""
from __future__ import annotations

import logging
import sys
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import (
    BillStatus, FeeStatus, MoneyMode, PayrollRunStatus, RefundStatus, StorePayment, UserRole,
)
from app.database import engine
from app.models.accounts import Expense, ExpenseCategory, FeeCollection, OtherIncome
from app.models.fee import FeeHead, StudentFee
from app.models.fee_extra import Refund
from app.models.inventory import StoreSale, Supplier
from app.models.payroll import PayrollRun, Payslip
from app.models.purchasing import VendorBill, VendorPayment
from app.models.staff import Staff
from app.models.student import Student
from app.models.user import User
from app.services import books_export
from app.services import books_service as books

FY_FROM, FY_TO = date(2031, 4, 1), date(2032, 3, 31)
D = Decimal
failures: list[str] = []


def check(label: str, got, want) -> None:
    ok = got == want
    print(f"  {'ok  ' if ok else 'FAIL'} {label}: {got}" + ("" if ok else f" (wanted {want})"))
    if not ok:
        failures.append(label)


def refused(label: str, fn) -> None:
    try:
        fn()
    except HTTPException as e:
        print(f"  ok   {label}: refused ({e.detail})")
        return
    print(f"  FAIL {label}: was accepted")
    failures.append(label)


def main() -> int:
    engine.echo = False
    logging.disable(logging.WARNING)
    conn = engine.connect()
    outer = conn.begin()
    db = Session(bind=conn, join_transaction_mode="create_savepoint")
    try:
        run(db)
    finally:
        db.close()
        outer.rollback()
        conn.close()
    print("\nrolled back; nothing kept")
    if failures:
        print(f"{len(failures)} check(s) failed: {', '.join(failures)}")
        return 1
    print("all checks passed")
    return 0


def run(db: Session) -> None:
    user = db.execute(
        select(User).where(User.role == UserRole.school_admin, User.school_id.is_not(None))
        .order_by(User.id)
    ).scalars().first()
    if user is None:
        raise SystemExit("No school admin to run as.")
    sid, tid = user.school_id, user.tenant_id
    students = list(db.execute(select(Student).where(Student.school_id == sid).limit(2)).scalars())
    staff = db.execute(select(Staff).where(Staff.school_id == sid, Staff.user_id.is_not(None))).scalars().first()
    if len(students) < 2 or staff is None:
        raise SystemExit("The school needs two students and one staff login.")
    a, b = students
    print(f"school {sid}, acting as {user.email}")

    base = books.trial_balance(db, user, FY_FROM, FY_TO)
    check("nothing real dated in the window", base["totals"]["debit"], D("0"))
    before = {r["account_id"]: r["closing_debit"] - r["closing_credit"] for r in base["rows"]}
    base_bs = books.balance_sheet(db, user, FY_TO)

    s = dict(tenant_id=tid, school_id=sid)
    head = FeeHead(**s, name="Smoke books head", code="SMKBOOKS")
    cat = ExpenseCategory(**s, name="Smoke books category")
    sup = Supplier(**s, name="Smoke books supplier")
    db.add_all([head, cat, sup])
    db.flush()

    fee_a = StudentFee(**s, student_id=a.id, fee_head_id=head.id, period="2031-05", amount_due=D("10000"),
                       amount_paid=D("8000"), due_date=date(2031, 5, 1), status=FeeStatus.pending)
    fee_b = StudentFee(**s, student_id=b.id, fee_head_id=head.id, period="2031-05", amount_due=D("5000"),
                       amount_paid=D("0"), due_date=date(2031, 5, 1), status=FeeStatus.waived)
    db.add_all([fee_a, fee_b])
    db.flush()
    db.add_all([
        FeeCollection(**s, student_fee_id=fee_a.id, student_id=a.id, amount=D("6000"), mode=MoneyMode.cash,
                      collected_on=date(2031, 5, 3), receipt_no="SMKB-1"),
        FeeCollection(**s, student_fee_id=fee_a.id, student_id=a.id, amount=D("2000"), mode=MoneyMode.upi,
                      collected_on=date(2031, 5, 4), receipt_no="SMKB-2"),
        Refund(**s, student_id=a.id, student_fee_id=fee_a.id, amount=D("1000"), reason="Smoke refund",
               mode=MoneyMode.cash, status=RefundStatus.processed, processed_on=date(2031, 5, 6)),
        Refund(**s, student_id=a.id, amount=D("444"), reason="Smoke refund, only approved",
               mode=MoneyMode.cash, status=RefundStatus.approved),
        OtherIncome(**s, received_on=date(2031, 5, 7), source="donation", payer="Smoke donor", amount=D("3000"),
                    mode=MoneyMode.bank_transfer, receipt_no="SMKB-OI-1"),
        OtherIncome(**s, received_on=date(2031, 5, 7), source="donation", payer="Smoke donor", amount=D("999"),
                    mode=MoneyMode.cash, receipt_no="SMKB-OI-2", is_void=True),
        Expense(**s, spent_on=date(2031, 5, 8), category_id=cat.id, amount=D("1500"), tax_amount=D("0"),
                mode=MoneyMode.cash, description="Smoke expense", payee="Smoke payee"),
        Expense(**s, spent_on=date(2031, 5, 8), category_id=cat.id, amount=D("777"), tax_amount=D("0"),
                mode=MoneyMode.cash, description="Smoke void expense", is_void=True),
        StoreSale(**s, bill_no="SMKB-S1", sold_on=date(2031, 5, 9), total=D("300"), payment=StorePayment.cash,
                  buyer_name="Smoke buyer"),
        StoreSale(**s, bill_no="SMKB-S2", sold_on=date(2031, 5, 9), total=D("400"),
                  payment=StorePayment.add_to_fees, student_id=a.id),
    ])
    bill = VendorBill(**s, supplier_id=sup.id, bill_no="SMKB-B1", billed_on=date(2031, 5, 8),
                      amount=D("4000"), tax_amount=D("720"), status=BillStatus.part_paid)
    dead = VendorBill(**s, supplier_id=sup.id, bill_no="SMKB-B2", billed_on=date(2031, 5, 8),
                      amount=D("555"), tax_amount=D("0"), status=BillStatus.cancelled)
    db.add_all([bill, dead])
    db.flush()
    db.add(VendorPayment(**s, bill_id=bill.id, paid_on=date(2031, 5, 9), amount=D("2000"),
                         mode=MoneyMode.bank_transfer))
    run_ = PayrollRun(**s, period="2031-05", status=PayrollRunStatus.paid, paid_on=date(2031, 5, 31))
    draft = PayrollRun(**s, period="2031-06", status=PayrollRunStatus.finalized)
    db.add_all([run_, draft])
    db.flush()
    for r in (run_, draft):
        db.add(Payslip(run_id=r.id, staff_id=staff.id, user_id=staff.user_id, days_in_month=31,
                       basic=D("20000"), gross=D("20000"), pf_employee=D("1800"), professional_tax=D("200"),
                       tds=D("400"), total_deductions=D("2400"), net_pay=D("17600"), pf_employer=D("1800")))
    db.commit()

    keys = books.ensure_chart(db, user)
    acct = {k: v.id for k, v in keys.items()}

    print("journal vouchers")
    jv = books.create_journal(db, user, {
        "entry_date": date(2031, 5, 1), "narration": "Smoke opening bank balance", "reference": None,
        "lines": [{"account_id": acct["bank"], "debit": D("50000")},
                  {"account_id": acct["capital"], "credit": D("50000")}],
    })
    check("voucher numbered", jv["entry_no"].startswith("JV-"), True)
    refused("unbalanced voucher", lambda: books.create_journal(db, user, {
        "entry_date": date(2031, 5, 2), "narration": "Smoke bad",
        "lines": [{"account_id": acct["bank"], "debit": D("10")}, {"account_id": acct["cash"], "credit": D("9")}]}))
    refused("one-account voucher", lambda: books.create_journal(db, user, {
        "entry_date": date(2031, 5, 2), "narration": "Smoke bad",
        "lines": [{"account_id": acct["bank"], "debit": D("10")}, {"account_id": acct["bank"], "credit": D("10")}]}))
    refused("line with both sides", lambda: books.create_journal(db, user, {
        "entry_date": date(2031, 5, 2), "narration": "Smoke bad",
        "lines": [{"account_id": acct["bank"], "debit": D("10"), "credit": D("10")},
                  {"account_id": acct["cash"], "credit": D("10")}]}))
    spare = books.create_journal(db, user, {
        "entry_date": date(2031, 5, 2), "narration": "Smoke to be voided",
        "lines": [{"account_id": acct["cash"], "debit": D("123")}, {"account_id": acct["capital"], "credit": D("123")}]})
    check("void", books.void_journal(db, user, spare["id"], "Smoke test")["is_void"], True)
    refused("deleting a system account", lambda: books.delete_account(db, user, acct["cash"]))
    refused("switching off a system account",
            lambda: books.update_account(db, user, acct["cash"], {"is_active": False}))

    print("trial balance, FY 2031-32")
    tb = books.trial_balance(db, user, FY_FROM, FY_TO)
    # movement only: the school's real balances carry in as opening
    closing = {r["account_id"]: r["closing_debit"] - r["closing_credit"] - before.get(r["account_id"], D("0"))
               for r in tb["rows"]}
    check("balanced", tb["balanced"], True)
    check("cash", closing.get(acct["cash"]), D("3800"))  # 6000 - 1000 - 1500 + 300
    check("bank", closing.get(acct["bank"]), D("35400"))  # 2000 + 3000 - 2000 - 17600 + 50000
    check("fees receivable", closing.get(acct["fees_receivable"]), D("3000"))  # 10000 - 8000 + 1000
    check("fee income (waived fee left out)", closing.get(acct[f"fee_head:{head.id}"]), D("-10000"))
    check("donations (void left out)", closing.get(acct["income:donation"]), D("-3000"))
    check("store sales (fee-charged sale left out)", closing.get(acct["store_sales"]), D("-300"))
    check("expense category (void left out)", closing.get(acct[f"expense_cat:{cat.id}"]), D("1500"))
    check("purchases incl. tax (cancelled bill left out)", closing.get(acct["purchases"]), D("4720"))
    check("supplier payables", closing.get(acct["payables"]), D("-2720"))
    check("salaries (finalized run left out)", closing.get(acct["salaries"]), D("20000"))
    check("employer PF", closing.get(acct["employer_contrib"]), D("1800"))
    check("payroll deductions payable", closing.get(acct["payroll_deductions"]), D("-4200"))
    narrow = books.trial_balance(db, user, FY_FROM, FY_TO, account_id=acct["bank"])
    check("trial balance account filter", ([r["account_id"] for r in narrow["rows"]], narrow["balanced"]), ([acct["bank"]], True))
    check("trial balance group column", next(r["category"] for r in tb["rows"] if r["account_id"] == acct["bank"]), "Cash and bank")
    check("capital (void voucher left out)", closing.get(acct["capital"]), D("-50000"))

    print("income and expenditure")
    pl = books.profit_and_loss(db, user, FY_FROM, FY_TO)
    check("income", pl["total_income"], D("13300"))
    check("expenditure", pl["total_expenses"], D("28020"))
    check("deficit", pl["surplus"], D("-14720"))
    later = books.profit_and_loss(db, user, date(2031, 5, 5), FY_TO)
    row = next(r for r in later["income"] if r["account_id"] == acct[f"fee_head:{head.id}"])
    check("opening carried from 1 April", (row["opening"], row["credit"], row["closing"]), (D("10000"), D("0"), D("10000")))
    staff = books.profit_and_loss(db, user, FY_FROM, FY_TO, category="Staff costs")
    check("category filter", (staff["total_expenses"], len(staff["income"])), (D("21800"), 0))
    xlsx, _ = books_export.income_expenditure_xlsx(db, user, FY_FROM, FY_TO)
    pdf, _ = books_export.income_expenditure_pdf(db, user, FY_FROM, FY_TO)
    check("excel and pdf exports", (xlsx[:2], pdf[:4]), (b"PK", b"%PDF"))

    print("balance sheet at 31 Mar 2032")
    bs = books.balance_sheet(db, user, FY_TO)
    check("balanced", bs["balanced"], True)
    check("assets added", bs["total_assets"] - base_bs["total_assets"], D("42200"))
    check("this year's deficit", bs["surplus_this_year"] - base_bs["surplus_this_year"], D("-14720"))
    check("asset sections add up", sum(x["total"] for x in bs["asset_sections"]), bs["total_assets"])
    check("liability and fund sections add up", sum(x["total"] for x in bs["liability_sections"]), bs["total_funds"])
    titles = [x["title"] for x in bs["liability_sections"]]
    check("capital / reserves closes the liabilities side", titles[-1], "Capital / reserves")
    check("current ratio worked out", bs["current_ratio"] is not None, True)
    only = books.balance_sheet(db, user, FY_TO, acct["bank"])
    check("account filter", [r["account_id"] for x in only["asset_sections"] for r in x["rows"]], [acct["bank"]])
    xlsx, _ = books_export.balance_sheet_xlsx(db, user, FY_TO)
    pdf, _ = books_export.balance_sheet_pdf(db, user, FY_TO)
    check("balance sheet exports", (xlsx[:2], pdf[:4]), (b"PK", b"%PDF"))
    xlsx, _ = books_export.trial_balance_xlsx(db, user, FY_FROM, FY_TO)
    pdf, _ = books_export.trial_balance_pdf(db, user, FY_FROM, FY_TO)
    check("trial balance exports", (xlsx[:2], pdf[:4]), (b"PK", b"%PDF"))

    print("account ledger: bank, May 2031")
    led = books.account_ledger(db, user, acct["bank"], date(2031, 5, 1), date(2031, 5, 31))
    check("opening", led["opening"], D("0"))
    check("closing", led["closing"], D("35400"))
    check("last running balance", led["lines"][-1]["balance"], D("35400"))
    check("entries", len(led["lines"]), 5)
    led = books.account_ledger(db, user, acct["bank"], date(2031, 5, 5), date(2031, 5, 31))
    check("opening carried in", led["opening"], D("52000"))

    print("day book")
    day = books.day_book(db, user, FY_FROM, FY_TO, source="fee_receipt")
    check("fee receipts", day["total"], 2)
    day = books.day_book(db, user, FY_FROM, FY_TO)
    check("every entry balances",
          all(sum(l["debit"] for l in e["lines"]) == sum(l["credit"] for l in e["lines"]) for e in day["items"]), True)


if __name__ == "__main__":
    sys.exit(main())
