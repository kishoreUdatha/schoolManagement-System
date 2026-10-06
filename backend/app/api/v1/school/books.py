"""Double-entry books: chart of accounts, journal vouchers, day book,
account ledgers, trial balance, income & expenditure and balance sheet."""
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminOrAccountant
from app.database import get_db
from app.schemas.books import AccountImport, AccountIn, AccountUpdate, JournalIn, VoidIn
from app.services import books_export
from app.services import books_service as svc

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Actor = SchoolAdminOrAccountant
From = Annotated[Optional[date], Query(alias="from")]
# "" for all, "none" for not assigned, or an id
Dim = Annotated[Optional[str], Query(pattern=r"^(none|\d+)?$")]


def scope(branch_id: Dim = None, department_id: Dim = None):
    return svc.parse_scope(branch_id, department_id)


Scope = Annotated[Optional[tuple], Depends(scope)]


@router.get("/dimensions", summary="Branches and departments to filter and tag by")
def dimensions(user: Actor, db: Db):
    return svc.dimensions(db, user)


@router.get("/accounts", summary="Chart of accounts, with each account's balance")
def accounts(user: Actor, db: Db, as_of: Optional[date] = None):
    return svc.list_accounts(db, user, as_of)


@router.get("/accounts.xlsx", summary="The chart of accounts as an Excel sheet")
def accounts_xlsx(user: Actor, db: Db):
    body, name = books_export.accounts_xlsx(db, user)
    return Response(
        body, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.post("/accounts/import", summary="Add accounts from a sheet; codes already in the chart are skipped")
def import_accounts(payload: AccountImport, user: Actor, db: Db):
    return svc.import_accounts(db, user, [row.model_dump() for row in payload.rows])


@router.post("/accounts", status_code=status.HTTP_201_CREATED)
def add_account(payload: AccountIn, user: Actor, db: Db):
    return svc.create_account(db, user, payload.model_dump())


@router.patch("/accounts/{account_id}")
def edit_account(account_id: int, payload: AccountUpdate, user: Actor, db: Db):
    return svc.update_account(db, user, account_id, payload.model_dump(exclude_unset=True))


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_account(account_id: int, user: Actor, db: Db):
    svc.delete_account(db, user, account_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/accounts/{account_id}/ledger", summary="One account's entries with a running balance")
def ledger(account_id: int, user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None):
    return svc.account_ledger(db, user, account_id, frm, to, sc)


@router.get("/accounts/{account_id}/ledger.xlsx", summary="One account's ledger as an Excel sheet")
def ledger_xlsx(account_id: int, user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None):
    body, name = books_export.ledger_xlsx(db, user, account_id, frm, to, sc)
    return Response(
        body, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/accounts/{account_id}/ledger.pdf", summary="One account's ledger as a PDF")
def ledger_pdf(account_id: int, user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None):
    body, name = books_export.ledger_pdf(db, user, account_id, frm, to, sc)
    return Response(
        body, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


VoucherType = Annotated[Optional[str], Query(pattern="^(" + "|".join(svc.VOUCHER_TYPES) + ")$")]


@router.get("/day-book", summary="Every posting in a window, automatic and manual")
def day_book(
    user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None,
    source: Optional[str] = Query(None, pattern="^(" + "|".join(svc.SOURCE_LABEL) + ")$"),
    voucher_type: VoucherType = None, account_id: Optional[int] = None,
    page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=500),
):
    return svc.day_book(db, user, frm, to, source=source, page=page, page_size=page_size, scope=sc,
                        voucher_type=voucher_type, account_id=account_id)


@router.get("/day-book.xlsx", summary="Day book as an Excel sheet")
def day_book_xlsx(user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None,
                  voucher_type: VoucherType = None, account_id: Optional[int] = None):
    body, name = books_export.day_book_xlsx(db, user, frm, to, voucher_type, account_id, sc)
    return Response(
        body, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/day-book.pdf", summary="Day book as a PDF")
def day_book_pdf(user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None,
                 voucher_type: VoucherType = None, account_id: Optional[int] = None):
    body, name = books_export.day_book_pdf(db, user, frm, to, voucher_type, account_id, sc)
    return Response(
        body, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/trial-balance")
def trial_balance(user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None, account_id: Optional[int] = None):
    return svc.trial_balance(db, user, frm, to, account_id=account_id, scope=sc)


@router.get("/trial-balance.xlsx", summary="Trial balance as an Excel sheet")
def trial_balance_xlsx(user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None, account_id: Optional[int] = None):
    body, name = books_export.trial_balance_xlsx(db, user, frm, to, account_id, sc)
    return Response(
        body, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/trial-balance.pdf", summary="Trial balance as a PDF")
def trial_balance_pdf(user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None, account_id: Optional[int] = None):
    body, name = books_export.trial_balance_pdf(db, user, frm, to, account_id, sc)
    return Response(
        body, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


Category = Annotated[Optional[str], Query(max_length=60)]


@router.get("/income-expenditure", summary="Income and expenditure (profit and loss) for a window")
def income_expenditure(
    user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None,
    category: Category = None, account_id: Optional[int] = None,
):
    return svc.profit_and_loss(db, user, frm, to, category=category, account_id=account_id, scope=sc)


@router.get("/income-expenditure.xlsx", summary="Income and expenditure as an Excel sheet")
def income_expenditure_xlsx(
    user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None,
    category: Category = None, account_id: Optional[int] = None,
):
    body, name = books_export.income_expenditure_xlsx(db, user, frm, to, category, account_id, sc)
    return Response(
        body, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/income-expenditure.pdf", summary="Income and expenditure as a PDF")
def income_expenditure_pdf(
    user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None,
    category: Category = None, account_id: Optional[int] = None,
):
    body, name = books_export.income_expenditure_pdf(db, user, frm, to, category, account_id, sc)
    return Response(
        body, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/balance-sheet")
def balance_sheet(user: Actor, db: Db, sc: Scope, as_of: Optional[date] = None, account_id: Optional[int] = None):
    return svc.balance_sheet(db, user, as_of, account_id, sc)


@router.get("/balance-sheet.xlsx", summary="Balance sheet as an Excel sheet")
def balance_sheet_xlsx(user: Actor, db: Db, sc: Scope, as_of: Optional[date] = None, account_id: Optional[int] = None):
    body, name = books_export.balance_sheet_xlsx(db, user, as_of, account_id, sc)
    return Response(
        body, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/balance-sheet.pdf", summary="Balance sheet as a PDF")
def balance_sheet_pdf(user: Actor, db: Db, sc: Scope, as_of: Optional[date] = None, account_id: Optional[int] = None):
    body, name = books_export.balance_sheet_pdf(db, user, as_of, account_id, sc)
    return Response(
        body, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


JvStatus = Annotated[Optional[str], Query(alias="status", pattern="^(draft|posted|void)$")]


@router.get("/journals", summary="Journal vouchers typed in by the accountant")
def journals(user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None,
             status_: JvStatus = None, voucher_type: VoucherType = None):
    return svc.list_journals(db, user, frm, to, status_=status_, voucher_type=voucher_type, scope=sc)


@router.get("/journals.xlsx", summary="Journal vouchers as an Excel sheet")
def journals_xlsx(user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None,
                  status_: JvStatus = None, voucher_type: VoucherType = None):
    body, name = books_export.journals_xlsx(db, user, frm, to, status_, voucher_type, sc)
    return Response(
        body, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/journals.pdf", summary="Journal vouchers as a PDF")
def journals_pdf(user: Actor, db: Db, sc: Scope, frm: From = None, to: Optional[date] = None,
                 status_: JvStatus = None, voucher_type: VoucherType = None):
    body, name = books_export.journals_pdf(db, user, frm, to, status_, voucher_type, sc)
    return Response(
        body, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.post("/journals", status_code=status.HTTP_201_CREATED)
def add_journal(payload: JournalIn, user: Actor, db: Db):
    return svc.create_journal(db, user, payload.model_dump())


@router.get("/journals/{entry_id}")
def journal(entry_id: int, user: Actor, db: Db):
    return svc.get_journal(db, user, entry_id)


@router.put("/journals/{entry_id}", summary="Change a draft voucher")
def edit_journal(entry_id: int, payload: JournalIn, user: Actor, db: Db):
    return svc.update_journal(db, user, entry_id, payload.model_dump())


@router.post("/journals/{entry_id}/post", summary="Put a draft voucher into the books")
def post_journal(entry_id: int, user: Actor, db: Db):
    return svc.post_journal(db, user, entry_id)


@router.delete("/journals/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a draft voucher")
def delete_journal(entry_id: int, user: Actor, db: Db):
    svc.delete_draft(db, user, entry_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/journals/{entry_id}/void")
def void_journal(entry_id: int, payload: VoidIn, user: Actor, db: Db):
    return svc.void_journal(db, user, entry_id, payload.reason)
