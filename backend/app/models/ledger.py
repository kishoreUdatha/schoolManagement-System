"""Double-entry books: the chart of accounts and hand-made journal vouchers.

Everything the rest of the system already records — fees raised, receipts,
other income, store sales, expenses, supplier bills and payments, payroll,
refunds — is posted to these accounts when the books are read (see
books_service), so there is one copy of each fact and a voided expense
leaves the books the moment it is voided. Only what has no other home is
stored here: the accounts themselves, and journal vouchers for opening
balances, bank transfers, depreciation and corrections.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class LedgerAccount(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """One account in the school's chart.

    `kind` is asset, liability, equity, income or expense. `system_key` marks
    the accounts the automatic postings land in ("cash", "fees_receivable",
    "fee_head:12", "expense_cat:3" ...); the school may rename and renumber
    those but not delete them or change their kind.
    """

    __audited__ = True

    __tablename__ = "ledger_accounts"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_ledger_account_code"),
        Index(
            "uq_ledger_account_system_key", "school_id", "system_key",
            unique=True, postgresql_where=text("system_key IS NOT NULL"),
        ),
    )

    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    system_key: Mapped[Optional[str]] = mapped_column(String(60))
    # The group a statement lists it under: "Fee income", "Staff costs" ...
    category: Mapped[Optional[str]] = mapped_column(String(60))
    description: Mapped[Optional[str]] = mapped_column(String(300))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class JournalEntry(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A journal voucher typed in by the accountant. Its lines must balance."""

    __audited__ = True

    __tablename__ = "journal_entries"
    __table_args__ = (
        UniqueConstraint("school_id", "entry_no", name="uq_journal_entry_no"),
        Index("ix_journal_entries_school_date", "school_id", "entry_date"),
    )

    entry_no: Mapped[str] = mapped_column(String(30), nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    narration: Mapped[str] = mapped_column(String(300), nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    is_void: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    void_reason: Mapped[Optional[str]] = mapped_column(String(300))
    # "draft" is kept but stays out of the books; "posted" is in them
    status: Mapped[str] = mapped_column(String(10), default="posted", server_default="posted", nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500))
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class JournalLine(Base, PrimaryKeyMixin):
    __tablename__ = "journal_lines"
    __table_args__ = (
        Index("ix_journal_lines_entry", "entry_id"),
        Index("ix_journal_lines_account", "account_id"),
    )

    entry_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("ledger_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(200))
    # where the money belongs, for branch- and department-wise books
    branch_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("branches.id", ondelete="SET NULL"))
    department_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("departments.id", ondelete="SET NULL"))
