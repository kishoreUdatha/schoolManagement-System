from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import BorrowerType, CopyStatus, FineStatus, ReservationStatus


class LibrarySettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    loan_days_student: int
    loan_days_staff: int
    max_books_student: int
    max_books_staff: int
    max_renewals: int
    fine_per_day: Decimal
    max_fine_per_loan: Optional[Decimal] = None
    hold_days: int
    fine_fee_head_id: Optional[int] = None


class LibrarySettingsUpdate(BaseModel):
    loan_days_student: Optional[int] = Field(None, ge=1, le=365)
    loan_days_staff: Optional[int] = Field(None, ge=1, le=365)
    max_books_student: Optional[int] = Field(None, ge=0, le=50)
    max_books_staff: Optional[int] = Field(None, ge=0, le=100)
    max_renewals: Optional[int] = Field(None, ge=0, le=10)
    fine_per_day: Optional[Decimal] = Field(None, ge=0)
    max_fine_per_loan: Optional[Decimal] = Field(None, ge=0)
    hold_days: Optional[int] = Field(None, ge=1, le=30)
    fine_fee_head_id: Optional[int] = None


class BookIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    authors: Optional[str] = Field(None, max_length=300)
    isbn: Optional[str] = Field(None, max_length=20)
    publisher: Optional[str] = Field(None, max_length=160)
    edition: Optional[str] = Field(None, max_length=40)
    publish_year: Optional[int] = Field(None, ge=1450, le=2100)
    category: Optional[str] = Field(None, max_length=80)
    language: Optional[str] = Field(None, max_length=40)
    shelf: Optional[str] = Field(None, max_length=40)
    description: Optional[str] = Field(None, max_length=4000)
    digital_url: Optional[str] = Field(None, max_length=500, pattern=r"^https?://")
    is_reference: bool = False


class BookCreate(BookIn):
    copies: int = Field(0, ge=0, le=200)  # auto-numbered physical copies to add
    price: Optional[Decimal] = Field(None, ge=0)


class BookUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=300)
    authors: Optional[str] = Field(None, max_length=300)
    isbn: Optional[str] = Field(None, max_length=20)
    publisher: Optional[str] = Field(None, max_length=160)
    edition: Optional[str] = Field(None, max_length=40)
    publish_year: Optional[int] = Field(None, ge=1450, le=2100)
    category: Optional[str] = Field(None, max_length=80)
    language: Optional[str] = Field(None, max_length=40)
    shelf: Optional[str] = Field(None, max_length=40)
    description: Optional[str] = Field(None, max_length=4000)
    digital_url: Optional[str] = Field(None, max_length=500, pattern=r"^https?://")
    is_reference: Optional[bool] = None
    is_active: Optional[bool] = None


class CopyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    accession_no: str
    status: CopyStatus
    price: Optional[Decimal] = None
    acquired_on: Optional[date] = None
    condition_note: Optional[str] = None
    borrower_name: Optional[str] = None
    due_on: Optional[date] = None


class BookRead(BookIn):
    id: int
    is_active: bool
    total_copies: int
    available_copies: int
    waiting_reservations: int


class BookDetail(BookRead):
    copies: list[CopyRead]


class CopiesAdd(BaseModel):
    count: int = Field(1, ge=1, le=200)
    accession_nos: Optional[list[str]] = None  # explicit numbers instead of auto
    price: Optional[Decimal] = Field(None, ge=0)
    acquired_on: Optional[date] = None


class CopyUpdate(BaseModel):
    status: Optional[CopyStatus] = None  # only available / damaged / withdrawn by hand
    price: Optional[Decimal] = Field(None, ge=0)
    condition_note: Optional[str] = Field(None, max_length=300)


class Borrower(BaseModel):
    borrower_type: BorrowerType
    student_id: Optional[int] = None
    user_id: Optional[int] = None

    @model_validator(mode="after")
    def _one(self):
        if self.borrower_type == BorrowerType.student and not self.student_id:
            raise ValueError("student_id is required")
        if self.borrower_type == BorrowerType.staff and not self.user_id:
            raise ValueError("user_id is required")
        return self


class IssueRequest(Borrower):
    accession_no: str = Field(..., min_length=1, max_length=40)
    due_on: Optional[date] = None
    remarks: Optional[str] = Field(None, max_length=300)


class CopyLookup(BaseModel):
    copy_id: int
    accession_no: str
    book_id: int
    title: str
    author: Optional[str] = None
    status: str
    is_reference: bool = False
    held_for: Optional[str] = None  # who it is on hold for, if anyone


class ReturnRequest(BaseModel):
    returned_on: Optional[date] = None
    damaged: bool = False
    damage_charge: Optional[Decimal] = Field(None, ge=0)
    note: Optional[str] = Field(None, max_length=300)


class LostRequest(BaseModel):
    charge: Optional[Decimal] = Field(None, ge=0)  # defaults to the copy's price
    note: Optional[str] = Field(None, max_length=300)


class FineAction(BaseModel):
    action: str = Field(..., pattern=r"^(paid|waived|bill)$")
    note: Optional[str] = Field(None, max_length=300)
    # when collecting: what was handed over (defaults to the fine) and how
    amount_received: Optional[Decimal] = Field(None, ge=0)
    payment_method: Optional[str] = Field(None, pattern=r"^(cash|upi|card|cheque|bank_transfer|other)$")


class LoanRead(BaseModel):
    id: int
    copy_id: int
    accession_no: str
    book_id: int
    title: str
    borrower_type: BorrowerType
    student_id: Optional[int] = None
    user_id: Optional[int] = None
    borrower_name: str
    borrower_detail: Optional[str] = None
    issued_on: date
    due_on: date
    returned_on: Optional[date] = None
    lost_on: Optional[date] = None
    renew_count: int
    overdue_days: int
    fine_amount: Decimal
    remarks: Optional[str] = None
    accruing_fine: Decimal  # for open overdue loans: fine if returned today
    fine_status: FineStatus
    fine_note: Optional[str] = None


class ReservationCreate(Borrower):
    book_id: int
    reserved_on: Optional[date] = None  # defaults to today
    notify_channel: Optional[str] = Field(None, pattern=r"^(in_app|sms|email|whatsapp|phone)$")


class ReservationRead(BaseModel):
    id: int
    book_id: int
    title: str
    borrower_name: str
    status: ReservationStatus
    queue_position: Optional[int] = None
    hold_until: Optional[date] = None
    held_accession_no: Optional[str] = None
    reserved_on: Optional[date] = None
    notify_channel: Optional[str] = None
    created_at: datetime


class LibraryDashboard(BaseModel):
    titles: int
    copies: int
    on_loan: int
    overdue: int
    reservations_ready: int
    fines_pending: Decimal
    top_borrowed: list[dict]


class FineCorrection(BaseModel):
    """Correct a fine that hasn't been settled yet — a loan the office decides
    was mis-priced, or a note the librarian wants on the record."""

    amount: Optional[Decimal] = Field(None, ge=0, le=100000)
    note: Optional[str] = Field(None, max_length=300)


class FineRead(BaseModel):
    loan_id: int
    accession_no: str
    title: str
    borrower_type: BorrowerType
    borrower_name: str
    student_id: Optional[int] = None
    user_id: Optional[int] = None
    issued_on: date
    due_on: date
    returned_on: Optional[date] = None
    overdue_days: int
    amount: Decimal
    status: FineStatus
    note: Optional[str] = None
    received: Optional[Decimal] = None
    payment_method: Optional[str] = None


class FineSummary(BaseModel):
    pending: int
    pending_amount: Decimal
    collected_amount: Decimal
    waived_amount: Decimal
    billed_amount: Decimal
    fines: list[FineRead]


class DueDateUpdate(BaseModel):
    """Override when a loan is due back, outside the renewal rules."""

    due_on: date
    note: Optional[str] = Field(None, max_length=200)


class HoldUpdate(BaseModel):
    """Hold a reserved book a little longer."""

    hold_until: date


class MemberRead(BaseModel):
    """A borrower at the counter: what they hold, and whether they may take more."""

    borrower_type: BorrowerType
    student_id: Optional[int] = None
    user_id: Optional[int] = None
    name: str
    detail: Optional[str] = None
    out: int
    overdue: int
    fine_due: Decimal
    limit: int
    can_borrow: bool
    borrowed_ever: int
    last_issued_on: Optional[date] = None
