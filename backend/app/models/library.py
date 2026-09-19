from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import BorrowerType, CopyStatus, FineStatus, ReservationStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class LibrarySettings(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "library_settings"

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    loan_days_student: Mapped[int] = mapped_column(Integer, default=14, nullable=False)
    loan_days_staff: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    max_books_student: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    max_books_staff: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    max_renewals: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    fine_per_day: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("2"), nullable=False)
    max_fine_per_loan: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    hold_days: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    # When set, student fines are added to their fees under this head.
    fine_fee_head_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("fee_heads.id", ondelete="SET NULL")
    )


class Book(Base, PrimaryKeyMixin, TimestampMixin):
    """A title in the catalogue. Physical items are BookCopy rows; a digital
    resource (e-book, link) has `digital_url` and usually no copies."""

    __tablename__ = "library_books"
    __table_args__ = (
        Index("ix_library_books_school", "school_id"),
        Index("ix_library_books_title", "school_id", "title"),
        Index("ix_library_books_isbn", "school_id", "isbn"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    authors: Mapped[Optional[str]] = mapped_column(String(300))
    isbn: Mapped[Optional[str]] = mapped_column(String(20))
    publisher: Mapped[Optional[str]] = mapped_column(String(160))
    edition: Mapped[Optional[str]] = mapped_column(String(40))
    publish_year: Mapped[Optional[int]] = mapped_column(Integer)
    category: Mapped[Optional[str]] = mapped_column(String(80))  # Fiction, Science, Reference…
    language: Mapped[Optional[str]] = mapped_column(String(40))
    shelf: Mapped[Optional[str]] = mapped_column(String(40))
    description: Mapped[Optional[str]] = mapped_column(Text)
    digital_url: Mapped[Optional[str]] = mapped_column(String(500))
    is_reference: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # in-library use only
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class BookCopy(Base, PrimaryKeyMixin, TimestampMixin):
    __audited__ = True

    __tablename__ = "library_copies"
    __table_args__ = (
        UniqueConstraint("school_id", "accession_no", name="uq_library_copy_accession"),
        Index("ix_library_copies_book", "book_id"),
    )

    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    book_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("library_books.id", ondelete="CASCADE"), nullable=False
    )
    accession_no: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[CopyStatus] = mapped_column(
        SAEnum(CopyStatus, name="library_copy_status"), default=CopyStatus.available, nullable=False
    )
    price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    acquired_on: Mapped[Optional[date]] = mapped_column(Date)
    condition_note: Mapped[Optional[str]] = mapped_column(String(300))


class Loan(Base, PrimaryKeyMixin, TimestampMixin):
    """Circulation record: one copy lent to one borrower."""

    __audited__ = True

    __tablename__ = "library_loans"
    __table_args__ = (
        CheckConstraint(
            "(borrower_type = 'student' AND student_id IS NOT NULL) OR "
            "(borrower_type = 'staff' AND user_id IS NOT NULL)",
            name="ck_library_loan_borrower",
        ),
        Index("ix_library_loans_school_open", "school_id", "returned_on"),
        Index("ix_library_loans_student", "student_id"),
        Index("ix_library_loans_user", "user_id"),
        # A copy can only be out once at a time.
        Index("uq_library_loan_open_copy", "copy_id", unique=True, postgresql_where=text("returned_on IS NULL AND lost_on IS NULL")),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    copy_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("library_copies.id", ondelete="RESTRICT"), nullable=False
    )
    borrower_type: Mapped[BorrowerType] = mapped_column(
        SAEnum(BorrowerType, name="library_borrower_type"), nullable=False
    )
    student_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE")
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE")
    )
    issued_on: Mapped[date] = mapped_column(Date, nullable=False)
    due_on: Mapped[date] = mapped_column(Date, nullable=False)
    returned_on: Mapped[Optional[date]] = mapped_column(Date)
    lost_on: Mapped[Optional[date]] = mapped_column(Date)
    renew_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    fine_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    fine_status: Mapped[FineStatus] = mapped_column(
        SAEnum(FineStatus, name="library_fine_status"), default=FineStatus.none, nullable=False
    )
    fine_note: Mapped[Optional[str]] = mapped_column(String(300))
    student_fee_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("student_fees.id", ondelete="SET NULL")
    )

    issued_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    returned_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class Reservation(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "library_reservations"
    __table_args__ = (
        Index("ix_library_reservations_book", "book_id", "status"),
    )

    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    book_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("library_books.id", ondelete="CASCADE"), nullable=False
    )
    borrower_type: Mapped[BorrowerType] = mapped_column(
        SAEnum(BorrowerType, name="library_borrower_type"), nullable=False
    )
    student_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE")
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE")
    )
    status: Mapped[ReservationStatus] = mapped_column(
        SAEnum(ReservationStatus, name="library_reservation_status"),
        default=ReservationStatus.waiting,
        nullable=False,
    )
    held_copy_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("library_copies.id", ondelete="SET NULL")
    )
    hold_until: Mapped[Optional[date]] = mapped_column(Date)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
