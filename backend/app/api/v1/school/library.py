from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import LibraryManager, SchoolAdminUser
from app.core.enums import FineStatus
from app.database import get_db
from app.schemas.library import (
    BookCreate,
    BookDetail,
    BookRead,
    BookUpdate,
    CopiesAdd,
    CopyLookup,
    CopyRead,
    CopyUpdate,
    FineAction,
    DueDateUpdate,
    FineCorrection,
    HoldUpdate,
    FineRead,
    FineSummary,
    MemberRead,
    IssueRequest,
    LibraryDashboard,
    LibrarySettingsRead,
    LibrarySettingsUpdate,
    LoanRead,
    LostRequest,
    ReservationCreate,
    ReservationRead,
    ReturnRequest,
)
from app.services import library_service as svc
from app.services import library_tools_service as tools


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/dashboard", response_model=LibraryDashboard)
def dashboard(current_user: LibraryManager, db: Db):
    return LibraryDashboard.model_validate(svc.dashboard(db, current_user.tenant_id, current_user.school_id))


@router.get("/settings", response_model=LibrarySettingsRead)
def get_settings(current_user: LibraryManager, db: Db):
    return LibrarySettingsRead.model_validate(svc.get_settings(db, current_user.tenant_id, current_user.school_id))


@router.patch("/settings", response_model=LibrarySettingsRead)
def update_settings(payload: LibrarySettingsUpdate, current_user: LibraryManager, db: Db):
    return LibrarySettingsRead.model_validate(
        svc.update_settings(db, current_user.tenant_id, current_user.school_id, payload)
    )


# --- Catalogue ---

@router.get("/categories", response_model=list[str])
def categories(current_user: LibraryManager, db: Db):
    return svc.categories(db, current_user.school_id)


@router.get("/books", response_model=list[BookRead])
def search_books(
    current_user: LibraryManager,
    db: Db,
    q: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    available_only: bool = Query(False),
    digital_only: bool = Query(False),
    include_inactive: bool = Query(False),
):
    return [
        BookRead.model_validate(b)
        for b in svc.search_books(
            db,
            current_user.school_id,
            q=q,
            category=category,
            available_only=available_only,
            digital_only=digital_only,
            include_inactive=include_inactive,
        )
    ]


@router.post("/books", response_model=BookDetail, status_code=status.HTTP_201_CREATED)
def create_book(payload: BookCreate, current_user: LibraryManager, db: Db):
    b = svc.create_book(db, current_user.tenant_id, current_user.school_id, payload)
    return BookDetail.model_validate(svc.book_detail(db, b.id, current_user.school_id))


@router.get("/books/{book_id}", response_model=BookDetail)
def get_book(book_id: int, current_user: LibraryManager, db: Db):
    return BookDetail.model_validate(svc.book_detail(db, book_id, current_user.school_id))


@router.patch("/books/{book_id}", response_model=BookDetail)
def update_book(book_id: int, payload: BookUpdate, current_user: LibraryManager, db: Db):
    svc.update_book(db, book_id, current_user.school_id, payload)
    return BookDetail.model_validate(svc.book_detail(db, book_id, current_user.school_id))


@router.post("/books/{book_id}/copies", response_model=BookDetail, status_code=status.HTTP_201_CREATED)
def add_copies(book_id: int, payload: CopiesAdd, current_user: LibraryManager, db: Db):
    svc.add_copies(db, book_id, current_user.school_id, payload)
    return BookDetail.model_validate(svc.book_detail(db, book_id, current_user.school_id))


@router.get("/copies/lookup", response_model=CopyLookup, summary="The title behind an accession number / barcode")
def lookup_copy(current_user: LibraryManager, db: Db, accession_no: str = Query(..., min_length=1, max_length=40)):
    return svc.lookup_copy(db, current_user.school_id, accession_no)


@router.patch("/copies/{copy_id}", response_model=CopyRead)
def update_copy(copy_id: int, payload: CopyUpdate, current_user: LibraryManager, db: Db):
    return CopyRead.model_validate(svc.update_copy(db, copy_id, current_user.school_id, payload))


# --- Circulation ---

@router.get("/loans", response_model=list[LoanRead])
def list_loans(
    current_user: LibraryManager,
    db: Db,
    open_only: bool = Query(True),
    overdue_only: bool = Query(False),
    fines_pending: bool = Query(False),
    student_id: Optional[int] = Query(None),
    user_id: Optional[int] = Query(None),
):
    cfg = svc.get_settings(db, current_user.tenant_id, current_user.school_id)
    return [
        LoanRead.model_validate(svc.loan_to_read(db, l, cfg))
        for l in svc.list_loans(
            db,
            current_user.school_id,
            open_only=open_only,
            overdue_only=overdue_only,
            fines_pending=fines_pending,
            student_id=student_id,
            user_id=user_id,
        )
    ]


@router.post("/loans", response_model=LoanRead, status_code=status.HTTP_201_CREATED, summary="Issue a copy by accession number")
def issue(payload: IssueRequest, current_user: LibraryManager, db: Db):
    l = svc.issue(db, current_user.tenant_id, current_user.school_id, current_user.id, payload)
    return LoanRead.model_validate(svc.loan_to_read(db, l))


@router.post("/loans/{loan_id}/return", response_model=LoanRead)
def return_copy(loan_id: int, payload: ReturnRequest, current_user: LibraryManager, db: Db):
    return LoanRead.model_validate(
        svc.loan_to_read(db, svc.return_copy(db, loan_id, current_user.school_id, current_user.id, payload))
    )


@router.patch("/loans/{loan_id}", response_model=LoanRead,
              summary="Override when a book is due back")
def set_due_date(loan_id: int, payload: DueDateUpdate, current_user: LibraryManager, db: Db):
    return LoanRead.model_validate(svc.loan_to_read(db, svc.set_due_date(db, loan_id, current_user.school_id, payload)))


@router.post("/loans/{loan_id}/renew", response_model=LoanRead)
def renew(loan_id: int, current_user: LibraryManager, db: Db):
    return LoanRead.model_validate(svc.loan_to_read(db, svc.renew(db, loan_id, current_user.school_id)))


@router.post("/loans/{loan_id}/lost", response_model=LoanRead)
def lost(loan_id: int, payload: LostRequest, current_user: LibraryManager, db: Db):
    return LoanRead.model_validate(
        svc.loan_to_read(db, svc.mark_lost(db, loan_id, current_user.school_id, current_user.id, payload))
    )


@router.get("/members", response_model=list[MemberRead],
            summary="Who can borrow, and what they are holding")
def members(
    current_user: LibraryManager,
    db: Db,
    q: Optional[str] = Query(None, description="Name, admission number or section"),
    with_books_only: bool = False,
):
    return svc.members(db, current_user.school_id, q=q, with_books_only=with_books_only)


@router.get("/fines", response_model=FineSummary, summary="Every fine raised, and what is still owed")
def list_fines(
    current_user: LibraryManager,
    db: Db,
    fine_status: Optional[FineStatus] = Query(None, alias="status"),
    student_id: Optional[int] = None,
    user_id: Optional[int] = None,
):
    return svc.list_fines(
        db, current_user.school_id, fine_status=fine_status, student_id=student_id, user_id=user_id
    )


@router.get("/fines/{loan_id}", response_model=FineRead)
def get_fine(loan_id: int, current_user: LibraryManager, db: Db):
    return svc.get_fine(db, loan_id, current_user.school_id)


@router.patch("/fines/{loan_id}", response_model=FineRead, summary="Correct a fine that hasn't been settled")
def correct_fine(loan_id: int, payload: FineCorrection, current_user: LibraryManager, db: Db):
    return svc.correct_fine(db, loan_id, current_user.school_id, payload)


@router.post("/loans/{loan_id}/fine", response_model=LoanRead, summary="Collect, waive or add a fine to the student's fees")
def fine(loan_id: int, payload: FineAction, current_user: LibraryManager, db: Db):
    return LoanRead.model_validate(svc.loan_to_read(db, svc.fine_action(db, loan_id, current_user.school_id, payload)))


# --- Reservations ---

@router.get("/reservations", response_model=list[ReservationRead])
def list_reservations(current_user: LibraryManager, db: Db, active_only: bool = Query(True)):
    return [
        ReservationRead.model_validate(svc.reservation_to_read(db, r))
        for r in svc.list_reservations(db, current_user.school_id, active_only=active_only)
    ]


@router.post("/reservations", response_model=ReservationRead, status_code=status.HTTP_201_CREATED)
def reserve(payload: ReservationCreate, current_user: LibraryManager, db: Db):
    return ReservationRead.model_validate(svc.reservation_to_read(db, svc.reserve(db, current_user.school_id, payload)))


@router.patch("/reservations/{reservation_id}", response_model=ReservationRead,
              summary="Hold a reserved book a little longer")
def extend_hold(reservation_id: int, payload: HoldUpdate, current_user: LibraryManager, db: Db):
    return ReservationRead.model_validate(
        svc.reservation_to_read(db, svc.extend_hold(db, reservation_id, current_user.school_id, payload))
    )


@router.post("/reservations/{reservation_id}/cancel", response_model=ReservationRead)
def cancel(reservation_id: int, current_user: LibraryManager, db: Db):
    return ReservationRead.model_validate(
        svc.reservation_to_read(db, svc.cancel_reservation(db, reservation_id, current_user.school_id))
    )



# --- The librarian's bulk work: import, labels, overdue reminders, stock check ---


class ImportRow(BaseModel):
    title: Optional[str] = Field(None, max_length=400)
    authors: Optional[str] = Field(None, max_length=400)
    isbn: Optional[str] = Field(None, max_length=40)
    publisher: Optional[str] = Field(None, max_length=200)
    edition: Optional[str] = Field(None, max_length=60)
    publish_year: Optional[str] = Field(None, max_length=10)
    category: Optional[str] = Field(None, max_length=100)
    language: Optional[str] = Field(None, max_length=60)
    shelf: Optional[str] = Field(None, max_length=60)
    copies: Optional[str] = Field(None, max_length=10)
    accession_nos: Optional[str] = Field(None, max_length=8000)
    price: Optional[str] = Field(None, max_length=20)


class ImportIn(BaseModel):
    rows: list[ImportRow] = Field(..., min_length=1, max_length=5000)
    dry_run: bool = True


class ScanIn(BaseModel):
    accession_nos: list[str] = Field(..., min_length=1, max_length=2000)
    shelf: Optional[str] = Field(None, max_length=40)


class CopyIdsIn(BaseModel):
    copy_ids: list[int] = Field(..., min_length=1, max_length=5000)


class StockCheckIn(BaseModel):
    note: Optional[str] = Field(None, max_length=200)


@router.post("/import", summary="Bring in books from a spreadsheet: check (dry_run) then save the good rows")
def import_books(payload: ImportIn, current_user: LibraryManager, db: Db):
    return tools.import_books(db, current_user, [r.model_dump() for r in payload.rows], payload.dry_run)


@router.get("/labels.pdf", summary="Spine / barcode labels, 24 to an A4 sheet")
def labels(current_user: LibraryManager, db: Db, book_id: Optional[int] = None, copy_ids: Optional[str] = None,
           from_no: Optional[str] = Query(None, max_length=40), to_no: Optional[str] = Query(None, max_length=40),
           since: Optional[date] = None):
    ids = [int(x) for x in (copy_ids or "").split(",") if x.strip().isdigit()] or None
    body, n = tools.labels_pdf(db, current_user.school_id, copy_ids=ids, book_id=book_id, from_no=from_no, to_no=to_no, since=since)
    return Response(body, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="library-labels-{n}.pdf"'})


@router.post("/overdue-reminders", summary="Tell each family (and member of staff) about their overdue books")
def overdue_reminders(current_user: LibraryManager, db: Db):
    return tools.remind_overdue(db, current_user)


@router.get("/stock-checks", summary="Stock checks, newest first")
def stock_checks(current_user: LibraryManager, db: Db):
    return tools.list_checks(db, current_user.school_id)


@router.post("/stock-checks", status_code=status.HTTP_201_CREATED, summary="Start a stock check")
def start_stock_check(payload: StockCheckIn, current_user: LibraryManager, db: Db):
    c = tools.start_check(db, current_user, payload.note)
    return tools.check_detail(db, current_user, c.id)


@router.get("/stock-checks/{check_id}", summary="What the shelves showed against the catalogue")
def stock_check(check_id: int, current_user: LibraryManager, db: Db):
    return tools.check_detail(db, current_user, check_id)


@router.post("/stock-checks/{check_id}/scans", summary="Accession numbers seen on the shelf")
def stock_scan(check_id: int, payload: ScanIn, current_user: LibraryManager, db: Db):
    return tools.scan(db, current_user, check_id, payload.accession_nos, payload.shelf)


@router.delete("/stock-checks/{check_id}/scans/{accession_no}", status_code=204, summary="Take back a scan")
def stock_unscan(check_id: int, accession_no: str, current_user: LibraryManager, db: Db):
    tools.unscan(db, current_user, check_id, accession_no)


@router.post("/stock-checks/{check_id}/mark-lost", summary="Write off missing copies as lost")
def stock_mark_lost(check_id: int, payload: CopyIdsIn, current_user: LibraryManager, db: Db):
    return tools.mark_missing_lost(db, current_user, check_id, payload.copy_ids)


@router.post("/stock-checks/{check_id}/mark-found", summary="Put copies recorded as lost back in stock")
def stock_mark_found(check_id: int, payload: CopyIdsIn, current_user: LibraryManager, db: Db):
    return tools.mark_found(db, current_user, check_id, payload.copy_ids)


@router.post("/stock-checks/{check_id}/close", summary="Finish the stock check")
def stock_close(check_id: int, current_user: LibraryManager, db: Db):
    tools.close_check(db, current_user, check_id)
    return tools.check_detail(db, current_user, check_id)
