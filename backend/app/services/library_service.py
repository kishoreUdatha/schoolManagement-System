"""Library: catalogue, copies, circulation, reservations and fines.

Students and staff are members automatically; limits and loan periods come
from LibrarySettings. Returning a copy that someone reserved puts it on hold
for them instead of back on the shelf.
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import (
    BorrowerType,
    CopyStatus,
    FeeStatus,
    FineStatus,
    ReservationStatus,
    UserRole,
)
from app.core.scoping import get_school_student, require_linked_child, section_label
from app.models.fee import FeeHead, StudentFee
from app.models.library import Book, BookCopy, LibrarySettings, Loan, Reservation
from app.models.student import Student
from app.models.user import User
from app.schemas.library import (
    BookCreate,
    BookUpdate,
    Borrower,
    CopiesAdd,
    CopyUpdate,
    FineAction,
    FineCorrection,
    IssueRequest,
    LibrarySettingsUpdate,
    LostRequest,
    ReturnRequest,
)


ZERO = Decimal("0")
FEE_SOURCE = "library"


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


# --- Settings ---

def get_settings(db: Session, tenant_id: int, school_id: int) -> LibrarySettings:
    s = db.execute(select(LibrarySettings).where(LibrarySettings.school_id == school_id)).scalar_one_or_none()
    if s is None:
        s = LibrarySettings(tenant_id=tenant_id, school_id=school_id)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def update_settings(db: Session, tenant_id: int, school_id: int, data: LibrarySettingsUpdate) -> LibrarySettings:
    s = get_settings(db, tenant_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    if updates.get("fine_fee_head_id") is not None:
        head = db.get(FeeHead, updates["fine_fee_head_id"])
        if not head or head.school_id != school_id:
            raise _404("Fee head")
    for k, v in updates.items():
        if v is not None or k in ("fine_fee_head_id", "max_fine_per_loan"):
            setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


# --- Catalogue ---

def _book(db: Session, book_id: int, school_id: int) -> Book:
    b = db.get(Book, book_id)
    if not b or b.school_id != school_id:
        raise _404("Book")
    return b


def _next_accession(db: Session, school_id: int) -> int:
    rows = db.execute(select(BookCopy.accession_no).where(BookCopy.school_id == school_id)).scalars()
    nums = [int(a[1:]) for a in rows if a.startswith("A") and a[1:].isdigit()]
    return max(nums, default=0) + 1


def add_copies(db: Session, book_id: int, school_id: int, data: CopiesAdd) -> list[BookCopy]:
    book = _book(db, book_id, school_id)
    if data.accession_nos:
        numbers = [a.strip().upper() for a in data.accession_nos if a.strip()]
        if len(set(numbers)) != len(numbers):
            raise _400("Duplicate accession numbers in the list")
    else:
        start = _next_accession(db, school_id)
        numbers = [f"A{n:06d}" for n in range(start, start + data.count)]
    copies = [
        BookCopy(
            school_id=school_id,
            book_id=book.id,
            accession_no=n,
            status=CopyStatus.available,
            price=data.price,
            acquired_on=data.acquired_on or date.today(),
        )
        for n in numbers
    ]
    db.add_all(copies)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="One of those accession numbers is already used")
    for c in copies:
        db.refresh(c)
    _promote_reservations(db, book.id)
    return copies


def create_book(db: Session, tenant_id: int, school_id: int, data: BookCreate) -> Book:
    fields = data.model_dump(exclude={"copies", "price"})
    fields["title"] = fields["title"].strip()
    b = Book(tenant_id=tenant_id, school_id=school_id, is_active=True, **fields)
    db.add(b)
    db.commit()
    db.refresh(b)
    if data.copies:
        add_copies(db, b.id, school_id, CopiesAdd(count=data.copies, price=data.price))
    return b


def update_book(db: Session, book_id: int, school_id: int, data: BookUpdate) -> Book:
    b = _book(db, book_id, school_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    db.commit()
    db.refresh(b)
    return b


def _copy_counts(db: Session, book_ids: list[int]) -> dict[int, tuple[int, int]]:
    rows = db.execute(
        select(
            BookCopy.book_id,
            func.count(BookCopy.id).filter(BookCopy.status.not_in((CopyStatus.withdrawn, CopyStatus.lost))),
            func.count(BookCopy.id).filter(BookCopy.status == CopyStatus.available),
        )
        .where(BookCopy.book_id.in_(book_ids))
        .group_by(BookCopy.book_id)
    ).all()
    return {bid: (total, avail) for bid, total, avail in rows}


def _waiting(db: Session, book_ids: list[int]) -> dict[int, int]:
    return dict(
        db.execute(
            select(Reservation.book_id, func.count(Reservation.id))
            .where(Reservation.book_id.in_(book_ids), Reservation.status == ReservationStatus.waiting)
            .group_by(Reservation.book_id)
        ).all()
    )


def book_to_read(db: Session, b: Book, counts=None, waiting=None) -> dict:
    counts = counts if counts is not None else _copy_counts(db, [b.id])
    waiting = waiting if waiting is not None else _waiting(db, [b.id])
    total, avail = counts.get(b.id, (0, 0))
    d = {c: getattr(b, c) for c in (
        "id", "title", "authors", "isbn", "publisher", "edition", "publish_year", "category",
        "language", "shelf", "description", "digital_url", "is_reference", "is_active",
    )}
    d.update(total_copies=total, available_copies=avail, waiting_reservations=waiting.get(b.id, 0))
    return d


def search_books(
    db: Session,
    school_id: int,
    *,
    q: Optional[str] = None,
    category: Optional[str] = None,
    available_only: bool = False,
    digital_only: bool = False,
    include_inactive: bool = False,
    limit: int = 100,
) -> list[dict]:
    stmt = select(Book).where(Book.school_id == school_id)
    if not include_inactive:
        stmt = stmt.where(Book.is_active.is_(True))
    if q:
        like = f"%{q.strip()}%"
        acc_match = select(BookCopy.book_id).where(BookCopy.school_id == school_id, BookCopy.accession_no.ilike(like))
        stmt = stmt.where(
            or_(Book.title.ilike(like), Book.authors.ilike(like), Book.isbn.ilike(like), Book.id.in_(acc_match))
        )
    if category:
        stmt = stmt.where(Book.category == category)
    if digital_only:
        stmt = stmt.where(Book.digital_url.is_not(None))
    if available_only:
        stmt = stmt.where(
            Book.id.in_(select(BookCopy.book_id).where(BookCopy.status == CopyStatus.available))
        )
    books = list(db.execute(stmt.order_by(Book.title).limit(limit)).scalars())
    ids = [b.id for b in books]
    counts, waiting = _copy_counts(db, ids), _waiting(db, ids)
    return [book_to_read(db, b, counts, waiting) for b in books]


def categories(db: Session, school_id: int) -> list[str]:
    return [
        c for (c,) in db.execute(
            select(Book.category).where(Book.school_id == school_id, Book.category.is_not(None)).distinct().order_by(Book.category)
        ).all()
    ]


def book_detail(db: Session, book_id: int, school_id: int) -> dict:
    b = _book(db, book_id, school_id)
    d = book_to_read(db, b)
    copies = db.execute(select(BookCopy).where(BookCopy.book_id == b.id).order_by(BookCopy.accession_no)).scalars().all()
    open_loans = {
        l.copy_id: l
        for l in db.execute(
            select(Loan).where(Loan.copy_id.in_([c.id for c in copies]), Loan.returned_on.is_(None), Loan.lost_on.is_(None))
        ).scalars()
    }
    d["copies"] = []
    for c in copies:
        loan = open_loans.get(c.id)
        d["copies"].append({
            "id": c.id,
            "accession_no": c.accession_no,
            "status": c.status,
            "price": c.price,
            "acquired_on": c.acquired_on,
            "condition_note": c.condition_note,
            "borrower_name": _borrower_name(db, loan)[0] if loan else None,
            "due_on": loan.due_on if loan else None,
        })
    return d


def update_copy(db: Session, copy_id: int, school_id: int, data: CopyUpdate) -> BookCopy:
    c = db.get(BookCopy, copy_id)
    if not c or c.school_id != school_id:
        raise _404("Copy")
    updates = data.model_dump(exclude_unset=True)
    new_status = updates.pop("status", None)
    if new_status is not None and new_status != c.status:
        if c.status in (CopyStatus.issued, CopyStatus.on_hold):
            raise _400(f"Copy is {c.status.value}; return it or release the hold first")
        if new_status not in (CopyStatus.available, CopyStatus.damaged, CopyStatus.withdrawn):
            raise _400("Use issue / return / lost to change to that status")
        c.status = new_status
    for k, v in updates.items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    if c.status == CopyStatus.available:
        _promote_reservations(db, c.book_id)
    return c


# --- Borrowers ---

def _borrower_name(db: Session, obj) -> tuple[str, Optional[str]]:
    if obj.borrower_type == BorrowerType.student:
        s = db.get(Student, obj.student_id)
        return (s.full_name, f"{s.admission_no} · {section_label(db, s.section_id)}") if s else ("", None)
    u = db.get(User, obj.user_id)
    return (u.full_name, u.role.value) if u else ("", None)


def _check_borrower(db: Session, school_id: int, b: Borrower) -> None:
    if b.borrower_type == BorrowerType.student:
        s = get_school_student(db, b.student_id, school_id)
        if not s.is_active:
            raise _400("Student is inactive")
    else:
        u = db.get(User, b.user_id)
        if not u or u.school_id != school_id or not u.is_active or u.role in (UserRole.parent, UserRole.student):
            raise _404("Staff member")


def _borrower_filter(model, b: Borrower):
    if b.borrower_type == BorrowerType.student:
        return model.student_id == b.student_id
    return model.user_id == b.user_id


# --- Circulation ---

def _fine_for(loan: Loan, on: date, cfg: LibrarySettings) -> tuple[int, Decimal]:
    days = max((on - loan.due_on).days, 0)
    fine = cfg.fine_per_day * days
    if cfg.max_fine_per_loan is not None:
        fine = min(fine, cfg.max_fine_per_loan)
    return days, fine


def issue(db: Session, tenant_id: int, school_id: int, actor_id: int, data: IssueRequest) -> Loan:
    cfg = get_settings(db, tenant_id, school_id)
    _check_borrower(db, school_id, data)
    copy = db.execute(
        select(BookCopy)
        .where(BookCopy.school_id == school_id, func.upper(BookCopy.accession_no) == data.accession_no.strip().upper())
        .with_for_update()
    ).scalar_one_or_none()
    if not copy:
        raise _404(f"Copy {data.accession_no}")
    book = db.get(Book, copy.book_id)
    if book.is_reference:
        raise _400("Reference books can't be taken out of the library")

    hold = None
    if copy.status == CopyStatus.on_hold:
        hold = db.execute(
            select(Reservation).where(
                Reservation.held_copy_id == copy.id, Reservation.status == ReservationStatus.ready
            )
        ).scalar_one_or_none()
        if hold is None or not (
            hold.borrower_type == data.borrower_type
            and (hold.student_id == data.student_id if data.borrower_type == BorrowerType.student else hold.user_id == data.user_id)
        ):
            raise _400("This copy is on hold for someone who reserved it")
    elif copy.status != CopyStatus.available:
        raise _400(f"Copy {copy.accession_no} is {copy.status.value}")

    open_loans = db.execute(
        select(Loan).where(_borrower_filter(Loan, data), Loan.returned_on.is_(None), Loan.lost_on.is_(None))
    ).scalars().all()
    limit = cfg.max_books_student if data.borrower_type == BorrowerType.student else cfg.max_books_staff
    if len(open_loans) >= limit:
        raise _400(f"Borrowing limit reached ({limit} books)")
    today = date.today()
    if any(l.due_on < today for l in open_loans):
        raise _400("Borrower has an overdue book; return it first")
    unpaid = db.execute(
        select(func.coalesce(func.sum(Loan.fine_amount), 0)).where(
            _borrower_filter(Loan, data), Loan.fine_status == FineStatus.pending
        )
    ).scalar_one()
    if unpaid and Decimal(unpaid) > 0:
        raise _400(f"Borrower has unpaid library fines (₹{Decimal(unpaid):.0f})")

    days = cfg.loan_days_student if data.borrower_type == BorrowerType.student else cfg.loan_days_staff
    due = data.due_on or today + timedelta(days=days)
    if due < today:
        raise _400("Due date is in the past")
    loan = Loan(
        tenant_id=tenant_id,
        school_id=school_id,
        copy_id=copy.id,
        borrower_type=data.borrower_type,
        student_id=data.student_id if data.borrower_type == BorrowerType.student else None,
        user_id=data.user_id if data.borrower_type == BorrowerType.staff else None,
        issued_on=today,
        due_on=due,
        issued_by_user_id=actor_id,
    )
    db.add(loan)
    copy.status = CopyStatus.issued
    if hold:
        hold.status = ReservationStatus.fulfilled
        hold.closed_at = datetime.now(timezone.utc)
    else:
        # Borrowing a title you'd reserved (from a different copy) fulfils the reservation.
        mine = db.execute(
            select(Reservation).where(
                Reservation.book_id == book.id,
                _borrower_filter(Reservation, data),
                Reservation.status.in_((ReservationStatus.waiting, ReservationStatus.ready)),
            )
        ).scalars().all()
        for r in mine:
            if r.held_copy_id and r.held_copy_id != copy.id:
                held = db.get(BookCopy, r.held_copy_id)
                if held and held.status == CopyStatus.on_hold:
                    held.status = CopyStatus.available
            r.status = ReservationStatus.fulfilled
            r.closed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(loan)
    _promote_reservations(db, book.id)
    return loan


def _loan(db: Session, loan_id: int, school_id: int) -> Loan:
    l = db.get(Loan, loan_id)
    if not l or l.school_id != school_id:
        raise _404("Loan")
    return l


def _add_fine(loan: Loan, amount: Decimal, note: str) -> None:
    if amount <= 0:
        return
    loan.fine_amount = (loan.fine_amount or ZERO) + amount
    loan.fine_status = FineStatus.pending
    loan.fine_note = "; ".join(x for x in (loan.fine_note, note) if x)


def _auto_bill(db: Session, loan: Loan, cfg: LibrarySettings) -> None:
    if loan.borrower_type == BorrowerType.student and cfg.fine_fee_head_id and loan.fine_status == FineStatus.pending:
        _bill(db, loan, cfg)


def _bill(db: Session, loan: Loan, cfg: LibrarySettings) -> None:
    if loan.borrower_type != BorrowerType.student:
        raise _400("Only student fines can be added to fees")
    if not cfg.fine_fee_head_id:
        raise _400("Choose a fee head for library fines in library settings first")
    today = date.today()
    sf = StudentFee(
        tenant_id=loan.tenant_id,
        school_id=loan.school_id,
        student_id=loan.student_id,
        fee_structure_id=None,
        source=FEE_SOURCE,
        source_id=loan.id,
        fee_head_id=cfg.fine_fee_head_id,
        period=today.strftime("%Y-%m"),
        amount_due=loan.fine_amount,
        amount_paid=ZERO,
        due_date=today + timedelta(days=15),
        status=FeeStatus.pending,
        notes=f"Library: {loan.fine_note or 'fine'}"[:300],
    )
    db.add(sf)
    db.flush()
    loan.student_fee_id = sf.id
    loan.fine_status = FineStatus.billed


def return_copy(db: Session, loan_id: int, school_id: int, actor_id: int, data: ReturnRequest) -> Loan:
    loan = _loan(db, loan_id, school_id)
    if loan.returned_on or loan.lost_on:
        raise _400("This loan is already closed")
    cfg = get_settings(db, loan.tenant_id, school_id)
    on = data.returned_on or date.today()
    if on < loan.issued_on:
        raise _400("Return date is before the issue date")
    days, fine = _fine_for(loan, on, cfg)
    loan.returned_on = on
    loan.returned_by_user_id = actor_id
    if fine > 0:
        _add_fine(loan, fine, f"{days} day(s) late")
    copy = db.get(BookCopy, loan.copy_id)
    if data.damaged:
        copy.status = CopyStatus.damaged
        copy.condition_note = data.note or copy.condition_note
        if data.damage_charge:
            _add_fine(loan, data.damage_charge, f"damage: {data.note or 'damaged'}")
    else:
        copy.status = CopyStatus.available
    _auto_bill(db, loan, cfg)
    db.commit()
    db.refresh(loan)
    if copy.status == CopyStatus.available:
        _promote_reservations(db, copy.book_id)
    return loan


def renew(db: Session, loan_id: int, school_id: int) -> Loan:
    loan = _loan(db, loan_id, school_id)
    if loan.returned_on or loan.lost_on:
        raise _400("This loan is already closed")
    cfg = get_settings(db, loan.tenant_id, school_id)
    if loan.renew_count >= cfg.max_renewals:
        raise _400(f"Already renewed {loan.renew_count} time(s); the limit is {cfg.max_renewals}")
    if loan.due_on < date.today():
        raise _400("Overdue books must be returned (and any fine settled) before renewing")
    copy = db.get(BookCopy, loan.copy_id)
    waiting = db.execute(
        select(Reservation.id).where(Reservation.book_id == copy.book_id, Reservation.status == ReservationStatus.waiting)
    ).first()
    available = db.execute(
        select(BookCopy.id).where(BookCopy.book_id == copy.book_id, BookCopy.status == CopyStatus.available)
    ).first()
    if waiting and not available:
        raise _400("Someone is waiting for this book, so it can't be renewed")
    days = cfg.loan_days_student if loan.borrower_type == BorrowerType.student else cfg.loan_days_staff
    loan.due_on = max(loan.due_on, date.today()) + timedelta(days=days)
    loan.renew_count += 1
    db.commit()
    db.refresh(loan)
    return loan


def mark_lost(db: Session, loan_id: int, school_id: int, actor_id: int, data: LostRequest) -> Loan:
    loan = _loan(db, loan_id, school_id)
    if loan.returned_on or loan.lost_on:
        raise _400("This loan is already closed")
    cfg = get_settings(db, loan.tenant_id, school_id)
    copy = db.get(BookCopy, loan.copy_id)
    today = date.today()
    days, late = _fine_for(loan, today, cfg)
    charge = data.charge if data.charge is not None else (copy.price or ZERO)
    loan.lost_on = today
    loan.returned_by_user_id = actor_id
    if late > 0:
        _add_fine(loan, late, f"{days} day(s) late")
    if charge > 0:
        _add_fine(loan, charge, f"lost copy {copy.accession_no}")
    copy.status = CopyStatus.lost
    copy.condition_note = data.note or copy.condition_note
    _auto_bill(db, loan, cfg)
    db.commit()
    db.refresh(loan)
    return loan


def fine_action(db: Session, loan_id: int, school_id: int, data: FineAction) -> Loan:
    loan = _loan(db, loan_id, school_id)
    if loan.fine_status != FineStatus.pending:
        raise _400(f"Fine is {loan.fine_status.value}")
    if data.action == "bill":
        _bill(db, loan, get_settings(db, loan.tenant_id, school_id))
    else:
        loan.fine_status = FineStatus.paid if data.action == "paid" else FineStatus.waived
    if data.note:
        loan.fine_note = "; ".join(x for x in (loan.fine_note, data.note) if x)
    db.commit()
    db.refresh(loan)
    return loan


def loan_to_read(db: Session, l: Loan, cfg: Optional[LibrarySettings] = None) -> dict:
    copy = db.get(BookCopy, l.copy_id)
    book = db.get(Book, copy.book_id)
    name, detail = _borrower_name(db, l)
    today = date.today()
    open_ = l.returned_on is None and l.lost_on is None
    overdue = max(((l.returned_on or l.lost_on or today) - l.due_on).days, 0)
    accruing = ZERO
    if open_ and overdue:
        cfg = cfg or db.execute(select(LibrarySettings).where(LibrarySettings.school_id == l.school_id)).scalar_one_or_none()
        if cfg:
            accruing = _fine_for(l, today, cfg)[1]
    return {
        "id": l.id,
        "copy_id": copy.id,
        "accession_no": copy.accession_no,
        "book_id": book.id,
        "title": book.title,
        "borrower_type": l.borrower_type,
        "student_id": l.student_id,
        "user_id": l.user_id,
        "borrower_name": name,
        "borrower_detail": detail,
        "issued_on": l.issued_on,
        "due_on": l.due_on,
        "returned_on": l.returned_on,
        "lost_on": l.lost_on,
        "renew_count": l.renew_count,
        "overdue_days": overdue,
        "fine_amount": l.fine_amount,
        "accruing_fine": accruing,
        "fine_status": l.fine_status,
        "fine_note": l.fine_note,
    }


def list_loans(
    db: Session,
    school_id: int,
    *,
    open_only: bool = True,
    overdue_only: bool = False,
    fines_pending: bool = False,
    student_id: Optional[int] = None,
    user_id: Optional[int] = None,
    limit: int = 300,
) -> list[Loan]:
    stmt = select(Loan).where(Loan.school_id == school_id)
    if open_only or overdue_only:
        stmt = stmt.where(Loan.returned_on.is_(None), Loan.lost_on.is_(None))
    if overdue_only:
        stmt = stmt.where(Loan.due_on < date.today())
    if fines_pending:
        stmt = stmt.where(Loan.fine_status == FineStatus.pending)
    if student_id:
        stmt = stmt.where(Loan.student_id == student_id)
    if user_id:
        stmt = stmt.where(Loan.user_id == user_id)
    return list(db.execute(stmt.order_by(Loan.due_on).limit(limit)).scalars())


# --- Reservations ---

def _promote_reservations(db: Session, book_id: int) -> None:
    """Put available copies on hold for the longest-waiting reservations."""
    changed = False
    while True:
        r = db.execute(
            select(Reservation)
            .where(Reservation.book_id == book_id, Reservation.status == ReservationStatus.waiting)
            .order_by(Reservation.created_at, Reservation.id)
            .limit(1)
        ).scalar_one_or_none()
        if r is None:
            break
        copy = db.execute(
            select(BookCopy)
            .where(BookCopy.book_id == book_id, BookCopy.status == CopyStatus.available)
            .order_by(BookCopy.accession_no)
            .limit(1)
            .with_for_update()
        ).scalar_one_or_none()
        if copy is None:
            break
        cfg = db.execute(select(LibrarySettings).where(LibrarySettings.school_id == r.school_id)).scalar_one_or_none()
        copy.status = CopyStatus.on_hold
        r.status = ReservationStatus.ready
        r.held_copy_id = copy.id
        r.hold_until = date.today() + timedelta(days=cfg.hold_days if cfg else 3)
        # The session doesn't autoflush; without this the next query sees the
        # same reservation as still waiting and loops forever.
        db.flush()
        changed = True
    if changed:
        db.commit()


def expire_holds(db: Session, school_id: int) -> int:
    today = date.today()
    expired = db.execute(
        select(Reservation).where(
            Reservation.school_id == school_id,
            Reservation.status == ReservationStatus.ready,
            Reservation.hold_until < today,
        )
    ).scalars().all()
    books = set()
    for r in expired:
        r.status = ReservationStatus.expired
        r.closed_at = datetime.now(timezone.utc)
        if r.held_copy_id:
            c = db.get(BookCopy, r.held_copy_id)
            if c and c.status == CopyStatus.on_hold:
                c.status = CopyStatus.available
        books.add(r.book_id)
    db.commit()
    for b in books:
        _promote_reservations(db, b)
    return len(expired)


def reserve(db: Session, school_id: int, data) -> Reservation:
    book = _book(db, data.book_id, school_id)
    _check_borrower(db, school_id, data)
    if book.is_reference or not book.is_active:
        raise _400("This title can't be reserved")
    if not db.execute(select(BookCopy.id).where(BookCopy.book_id == book.id, BookCopy.status.not_in((CopyStatus.lost, CopyStatus.withdrawn)))).first():
        raise _400("The library has no copies of this title")
    dup = db.execute(
        select(Reservation.id).where(
            Reservation.book_id == book.id,
            _borrower_filter(Reservation, data),
            Reservation.status.in_((ReservationStatus.waiting, ReservationStatus.ready)),
        )
    ).first()
    if dup:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already reserved")
    r = Reservation(
        school_id=school_id,
        book_id=book.id,
        borrower_type=data.borrower_type,
        student_id=data.student_id if data.borrower_type == BorrowerType.student else None,
        user_id=data.user_id if data.borrower_type == BorrowerType.staff else None,
        status=ReservationStatus.waiting,
    )
    db.add(r)
    db.commit()
    _promote_reservations(db, book.id)
    db.refresh(r)
    return r


def cancel_reservation(db: Session, reservation_id: int, school_id: int) -> Reservation:
    r = db.get(Reservation, reservation_id)
    if not r or r.school_id != school_id:
        raise _404("Reservation")
    if r.status not in (ReservationStatus.waiting, ReservationStatus.ready):
        raise _400(f"Reservation is already {r.status.value}")
    if r.held_copy_id:
        c = db.get(BookCopy, r.held_copy_id)
        if c and c.status == CopyStatus.on_hold:
            c.status = CopyStatus.available
    r.status = ReservationStatus.cancelled
    r.closed_at = datetime.now(timezone.utc)
    db.commit()
    _promote_reservations(db, r.book_id)
    db.refresh(r)
    return r


def reservation_to_read(db: Session, r: Reservation) -> dict:
    book = db.get(Book, r.book_id)
    pos = None
    if r.status == ReservationStatus.waiting:
        pos = db.execute(
            select(func.count(Reservation.id)).where(
                Reservation.book_id == r.book_id,
                Reservation.status == ReservationStatus.waiting,
                Reservation.created_at <= r.created_at,
            )
        ).scalar_one()
    held = db.get(BookCopy, r.held_copy_id) if r.held_copy_id else None
    return {
        "id": r.id,
        "book_id": r.book_id,
        "title": book.title if book else "",
        "borrower_name": _borrower_name(db, r)[0],
        "status": r.status,
        "queue_position": pos,
        "hold_until": r.hold_until,
        "held_accession_no": held.accession_no if held else None,
        "created_at": r.created_at,
    }


def list_reservations(db: Session, school_id: int, *, active_only: bool = True) -> list[Reservation]:
    expire_holds(db, school_id)
    stmt = select(Reservation).where(Reservation.school_id == school_id)
    if active_only:
        stmt = stmt.where(Reservation.status.in_((ReservationStatus.waiting, ReservationStatus.ready)))
    return list(db.execute(stmt.order_by(Reservation.status.desc(), Reservation.created_at)).scalars())


# --- Dashboard ---

def dashboard(db: Session, tenant_id: int, school_id: int) -> dict:
    expire_holds(db, school_id)
    today = date.today()
    open_ = (Loan.school_id == school_id, Loan.returned_on.is_(None), Loan.lost_on.is_(None))
    top = db.execute(
        select(Book.id, Book.title, func.count(Loan.id))
        .join(BookCopy, BookCopy.book_id == Book.id)
        .join(Loan, Loan.copy_id == BookCopy.id)
        .where(Book.school_id == school_id, Loan.issued_on >= today - timedelta(days=90))
        .group_by(Book.id, Book.title)
        .order_by(func.count(Loan.id).desc())
        .limit(5)
    ).all()
    return {
        "titles": db.execute(select(func.count(Book.id)).where(Book.school_id == school_id, Book.is_active.is_(True))).scalar_one(),
        "copies": db.execute(
            select(func.count(BookCopy.id)).where(
                BookCopy.school_id == school_id, BookCopy.status.not_in((CopyStatus.lost, CopyStatus.withdrawn))
            )
        ).scalar_one(),
        "on_loan": db.execute(select(func.count(Loan.id)).where(*open_)).scalar_one(),
        "overdue": db.execute(select(func.count(Loan.id)).where(*open_, Loan.due_on < today)).scalar_one(),
        "reservations_ready": db.execute(
            select(func.count(Reservation.id)).where(
                Reservation.school_id == school_id, Reservation.status == ReservationStatus.ready
            )
        ).scalar_one(),
        "fines_pending": db.execute(
            select(func.coalesce(func.sum(Loan.fine_amount), 0)).where(
                Loan.school_id == school_id, Loan.fine_status == FineStatus.pending
            )
        ).scalar_one(),
        "top_borrowed": [{"book_id": i, "title": t, "loans": n} for i, t, n in top],
    }


# --- Parent / staff self-service ---

def child_loans(db: Session, parent_user_id: int, student_id: int) -> list[Loan]:
    require_linked_child(db, parent_user_id, student_id)
    return list(
        db.execute(
            select(Loan).where(Loan.student_id == student_id).order_by(Loan.issued_on.desc()).limit(100)
        ).scalars()
    )


def my_loans(db: Session, user_id: int) -> list[Loan]:
    return list(db.execute(select(Loan).where(Loan.user_id == user_id).order_by(Loan.issued_on.desc()).limit(100)).scalars())


# --- Fines as a register of their own ---


def fine_to_read(db: Session, l: Loan) -> dict:
    """A loan seen as a fine: what is owed, by whom, and how it stands."""
    copy = db.get(BookCopy, l.copy_id)
    book = db.get(Book, copy.book_id)
    name, _ = _borrower_name(db, l)
    ended = l.returned_on or l.lost_on or date.today()
    return {
        "loan_id": l.id,
        "accession_no": copy.accession_no,
        "title": book.title,
        "borrower_type": l.borrower_type,
        "borrower_name": name,
        "student_id": l.student_id,
        "user_id": l.user_id,
        "issued_on": l.issued_on,
        "due_on": l.due_on,
        "returned_on": l.returned_on,
        "overdue_days": max((ended - l.due_on).days, 0),
        "amount": l.fine_amount,
        "status": l.fine_status,
        "note": l.fine_note,
    }


def list_fines(
    db: Session,
    school_id: int,
    *,
    fine_status: Optional[FineStatus] = None,
    student_id: Optional[int] = None,
    user_id: Optional[int] = None,
    limit: int = 300,
) -> dict:
    """Every fine the library has raised, with what is still outstanding."""
    stmt = select(Loan).where(Loan.school_id == school_id, Loan.fine_status != FineStatus.none)
    if fine_status:
        stmt = stmt.where(Loan.fine_status == fine_status)
    if student_id:
        stmt = stmt.where(Loan.student_id == student_id)
    if user_id:
        stmt = stmt.where(Loan.user_id == user_id)
    loans = list(db.execute(stmt.order_by(Loan.fine_status, Loan.due_on).limit(limit)).scalars())

    totals = {FineStatus.pending: ZERO, FineStatus.paid: ZERO, FineStatus.waived: ZERO, FineStatus.billed: ZERO}
    for row in db.execute(
        select(Loan.fine_status, func.coalesce(func.sum(Loan.fine_amount), 0))
        .where(Loan.school_id == school_id, Loan.fine_status != FineStatus.none)
        .group_by(Loan.fine_status)
    ):
        totals[row[0]] = Decimal(row[1])
    pending = db.execute(
        select(func.count(Loan.id)).where(
            Loan.school_id == school_id, Loan.fine_status == FineStatus.pending
        )
    ).scalar_one()
    return {
        "pending": pending,
        "pending_amount": totals[FineStatus.pending],
        "collected_amount": totals[FineStatus.paid],
        "waived_amount": totals[FineStatus.waived],
        "billed_amount": totals[FineStatus.billed],
        "fines": [fine_to_read(db, l) for l in loans],
    }


def get_fine(db: Session, loan_id: int, school_id: int) -> dict:
    loan = _loan(db, loan_id, school_id)
    if loan.fine_status == FineStatus.none:
        raise _404("Fine")
    return fine_to_read(db, loan)


def correct_fine(db: Session, loan_id: int, school_id: int, data: FineCorrection) -> dict:
    """Change the amount or note while the fine is still owed. Once it has been
    collected, waived or billed to the fees, it is history and stays put."""
    loan = _loan(db, loan_id, school_id)
    if loan.fine_status != FineStatus.pending:
        raise _400(
            f"This fine is already {loan.fine_status.value} — it can't be changed now"
        )
    if data.amount is not None:
        loan.fine_amount = data.amount
    if data.note is not None:
        loan.fine_note = data.note.strip() or None
    db.commit()
    db.refresh(loan)
    return fine_to_read(db, loan)
