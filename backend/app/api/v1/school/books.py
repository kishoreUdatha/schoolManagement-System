"""Double-entry books: chart of accounts, journal vouchers, day book,
account ledgers, trial balance, income & expenditure and balance sheet."""
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminOrAccountant
from app.database import get_db
from app.schemas.books import AccountIn, AccountUpdate, JournalIn, VoidIn
from app.services import books_service as svc

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Actor = SchoolAdminOrAccountant
From = Annotated[Optional[date], Query(alias="from")]


@router.get("/accounts", summary="Chart of accounts, with each account's balance")
def accounts(user: Actor, db: Db, as_of: Optional[date] = None):
    return svc.list_accounts(db, user, as_of)


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
def ledger(account_id: int, user: Actor, db: Db, frm: From = None, to: Optional[date] = None):
    return svc.account_ledger(db, user, account_id, frm, to)


@router.get("/day-book", summary="Every posting in a window, automatic and manual")
def day_book(
    user: Actor, db: Db, frm: From = None, to: Optional[date] = None,
    source: Optional[str] = Query(None, pattern="^(" + "|".join(svc.SOURCE_LABEL) + ")$"),
    page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=500),
):
    return svc.day_book(db, user, frm, to, source=source, page=page, page_size=page_size)


@router.get("/trial-balance")
def trial_balance(user: Actor, db: Db, frm: From = None, to: Optional[date] = None):
    return svc.trial_balance(db, user, frm, to)


@router.get("/income-expenditure", summary="Income and expenditure (profit and loss) for a window")
def income_expenditure(user: Actor, db: Db, frm: From = None, to: Optional[date] = None):
    return svc.profit_and_loss(db, user, frm, to)


@router.get("/balance-sheet")
def balance_sheet(user: Actor, db: Db, as_of: Optional[date] = None):
    return svc.balance_sheet(db, user, as_of)


@router.get("/journals", summary="Journal vouchers typed in by the accountant")
def journals(user: Actor, db: Db, frm: From = None, to: Optional[date] = None):
    return svc.list_journals(db, user, frm, to)


@router.post("/journals", status_code=status.HTTP_201_CREATED)
def add_journal(payload: JournalIn, user: Actor, db: Db):
    return svc.create_journal(db, user, payload.model_dump())


@router.get("/journals/{entry_id}")
def journal(entry_id: int, user: Actor, db: Db):
    return svc.get_journal(db, user, entry_id)


@router.post("/journals/{entry_id}/void")
def void_journal(entry_id: int, payload: VoidIn, user: Actor, db: Db):
    return svc.void_journal(db, user, entry_id, payload.reason)
