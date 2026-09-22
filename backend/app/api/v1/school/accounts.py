from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminOrAccountant
from app.core.enums import ChequeStatus, MoneyMode
from app.database import get_db
from app.schemas.accounts import (
    ConcessionDecision,
    ConcessionUpdate,
    ExpenseUpdate,
    CashBook,
    CategoryIn,
    CategoryRead,
    ChequeAction,
    ChequeIn,
    ChequeRead,
    CollectionRead,
    ConcessionIn,
    ConcessionRead,
    ExpenseIn,
    ExpenseRead,
    IncomeIn,
    IncomeRead,
    VoidIn,
)
from app.services import accounts_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Actor = SchoolAdminOrAccountant


def _range(frm: Optional[date], to: Optional[date]) -> tuple[date, date]:
    to = to or date.today()
    return frm or to.replace(day=1), to


# --- Expenses ---

@router.get("/expense-categories", response_model=list[CategoryRead])
def categories(current_user: Actor, db: Db):
    return [CategoryRead.model_validate(c) for c in svc.categories(db, current_user)]


@router.post("/expense-categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def add_category(payload: CategoryIn, current_user: Actor, db: Db):
    return CategoryRead.model_validate(svc.save_category(db, current_user, payload))


@router.put("/expense-categories/{category_id}", response_model=CategoryRead)
def update_category(category_id: int, payload: CategoryIn, current_user: Actor, db: Db):
    return CategoryRead.model_validate(svc.save_category(db, current_user, payload, category_id))


@router.get("/expenses", response_model=list[ExpenseRead])
def expenses(current_user: Actor, db: Db, frm: Optional[date] = Query(None, alias="from"), to: Optional[date] = Query(None), category_id: Optional[int] = Query(None)):
    f, t = _range(frm, to)
    return [ExpenseRead.model_validate(svc.expense_to_read(db, e)) for e in svc.list_expenses(db, current_user.school_id, f, t, category_id)]


@router.post("/expenses", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
def add_expense(payload: ExpenseIn, current_user: Actor, db: Db):
    return ExpenseRead.model_validate(svc.expense_to_read(db, svc.add_expense(db, current_user, payload)))


@router.patch("/expenses/{expense_id}", response_model=ExpenseRead, summary="Amend a voucher")
def update_expense(expense_id: int, payload: ExpenseUpdate, current_user: Actor, db: Db):
    return ExpenseRead.model_validate(
        svc.expense_to_read(db, svc.update_expense(db, expense_id, current_user, payload))
    )


@router.post("/expenses/{expense_id}/void", response_model=ExpenseRead)
def void_expense(expense_id: int, payload: VoidIn, current_user: Actor, db: Db):
    return ExpenseRead.model_validate(svc.expense_to_read(db, svc.void_expense(db, expense_id, current_user, payload.reason)))


# --- Other income ---

@router.get("/income", response_model=list[IncomeRead])
def income(current_user: Actor, db: Db, frm: Optional[date] = Query(None, alias="from"), to: Optional[date] = Query(None)):
    f, t = _range(frm, to)
    return [IncomeRead.model_validate(i) for i in svc.list_income(db, current_user.school_id, f, t)]


@router.post("/income", response_model=IncomeRead, status_code=status.HTTP_201_CREATED)
def add_income(payload: IncomeIn, current_user: Actor, db: Db):
    return IncomeRead.model_validate(svc.add_income(db, current_user, payload))


@router.post("/income/{income_id}/void", response_model=IncomeRead)
def void_income(income_id: int, current_user: Actor, db: Db):
    return IncomeRead.model_validate(svc.void_income(db, income_id, current_user))


# --- Cheques ---

@router.get("/cheques", response_model=list[ChequeRead])
def cheques(current_user: Actor, db: Db, status_filter: Optional[ChequeStatus] = Query(None, alias="status")):
    return [ChequeRead.model_validate(svc.cheque_to_read(db, c)) for c in svc.list_cheques(db, current_user.school_id, status_=status_filter)]


@router.post("/cheques", response_model=ChequeRead, status_code=status.HTTP_201_CREATED)
def record_cheque(payload: ChequeIn, current_user: Actor, db: Db):
    return ChequeRead.model_validate(svc.cheque_to_read(db, svc.record_cheque(db, current_user, payload)))


@router.post("/cheques/{cheque_id}/action", response_model=ChequeRead, summary="Deposit, clear (credits the fees), bounce or return")
def cheque_action(cheque_id: int, payload: ChequeAction, current_user: Actor, db: Db):
    return ChequeRead.model_validate(svc.cheque_to_read(db, svc.cheque_action(db, cheque_id, current_user, payload)))


# --- Concessions ---

@router.get("/concessions", response_model=list[ConcessionRead])
def concessions(current_user: Actor, db: Db, active_only: bool = Query(True)):
    return [ConcessionRead.model_validate(svc.concession_to_read(db, c)) for c in svc.list_concessions(db, current_user.school_id, active_only=active_only)]


@router.post("/concessions", response_model=ConcessionRead, status_code=status.HTTP_201_CREATED)
def add_concession(payload: ConcessionIn, current_user: Actor, db: Db):
    c, applied = svc.add_concession(db, current_user, payload)
    return ConcessionRead.model_validate(svc.concession_to_read(db, c, applied))


@router.patch("/concessions/{concession_id}", response_model=ConcessionRead,
              summary="Change a concession that is still running")
def update_concession(concession_id: int, payload: ConcessionUpdate, current_user: Actor, db: Db):
    return ConcessionRead.model_validate(
        svc.concession_to_read(db, svc.update_concession(db, concession_id, current_user, payload))
    )


@router.post("/concessions/{concession_id}/approve", response_model=ConcessionRead,
             summary="Approve a requested concession — it comes into force")
def approve_concession(concession_id: int, payload: ConcessionDecision, current_user: Actor, db: Db):
    c, applied = svc.decide_concession(db, concession_id, current_user, True, payload.note)
    return ConcessionRead.model_validate(svc.concession_to_read(db, c, applied))


@router.post("/concessions/{concession_id}/reject", response_model=ConcessionRead,
             summary="Turn down a requested concession")
def reject_concession(concession_id: int, payload: ConcessionDecision, current_user: Actor, db: Db):
    c, _ = svc.decide_concession(db, concession_id, current_user, False, payload.note)
    return ConcessionRead.model_validate(svc.concession_to_read(db, c))


@router.post("/concessions/{concession_id}/end", response_model=ConcessionRead)
def end_concession(concession_id: int, current_user: Actor, db: Db):
    return ConcessionRead.model_validate(svc.concession_to_read(db, svc.end_concession(db, concession_id, current_user)))


# --- Reports ---

@router.get("/collections", response_model=list[CollectionRead], summary="Fee receipts in a date range")
def collections(
    current_user: Actor,
    db: Db,
    frm: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
    mode: Optional[MoneyMode] = Query(None),
    student_id: Optional[int] = Query(None),
):
    f, t = _range(frm, to)
    return [CollectionRead.model_validate(c) for c in svc.collections(db, current_user.school_id, f, t, mode=mode, student_id=student_id)]


@router.get("/collections/{collection_id}", response_model=CollectionRead, summary="One receipt by id")
def collection(collection_id: int, current_user: Actor, db: Db):
    return CollectionRead.model_validate(svc.collection(db, current_user.school_id, collection_id))


@router.get("/cash-book", response_model=CashBook, summary="Money in and out for a period")
def cash_book(current_user: Actor, db: Db, frm: Optional[date] = Query(None, alias="from"), to: Optional[date] = Query(None)):
    f, t = _range(frm, to)
    return CashBook.model_validate(svc.cash_book(db, current_user.school_id, f, t))
