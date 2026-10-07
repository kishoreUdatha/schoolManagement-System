from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import ChequeStatus, ConcessionKind, MoneyMode
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class FeeCollection(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """One money-in event against a student fee — the receipt ledger.
    StudentFee.amount_paid is the running total; this keeps each payment,
    so collections can be reported by day, mode and collector."""

    __tablename__ = "fee_collections"
    __table_args__ = (
        # several lines paid together share a receipt number (ledger_service.next_receipt)
        Index("ix_fee_collections_receipt", "school_id", "receipt_no"),
        Index("ix_fee_collections_school_date", "school_id", "collected_on"),
        Index("ix_fee_collections_fee", "student_fee_id"),
    )

    student_fee_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("student_fees.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    mode: Mapped[MoneyMode] = mapped_column(SAEnum(MoneyMode, name="money_mode"), nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    collected_on: Mapped[date] = mapped_column(Date, nullable=False)
    receipt_no: Mapped[str] = mapped_column(String(30), nullable=False)
    collected_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    notes: Mapped[Optional[str]] = mapped_column(String(300))


class ExpenseCategory(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __tablename__ = "expense_categories"
    __table_args__ = (UniqueConstraint("school_id", "name", name="uq_expense_category_name"),)

    name: Mapped[str] = mapped_column(String(80), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Expense(Base, PrimaryKeyMixin, TimestampMixin, _School):
    __audited__ = True

    __tablename__ = "expenses"
    __table_args__ = (Index("ix_expenses_school_date", "school_id", "spent_on"),)

    spent_on: Mapped[date] = mapped_column(Date, nullable=False)
    category_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False
    )
    supplier_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("suppliers.id", ondelete="SET NULL")
    )
    payee: Mapped[Optional[str]] = mapped_column(String(160))  # when not a saved supplier
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    mode: Mapped[MoneyMode] = mapped_column(SAEnum(MoneyMode, name="money_mode"), nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(120))  # bill / txn no.
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    bill_document_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("documents.id", ondelete="SET NULL")
    )
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    is_void: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    void_reason: Mapped[Optional[str]] = mapped_column(String(300))
    # where the money belongs, for branch- and department-wise books
    branch_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("branches.id", ondelete="SET NULL"))
    department_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("departments.id", ondelete="SET NULL"))


class OtherIncome(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Money in that isn't a student fee: donations, hall rent, grants, interest."""

    __audited__ = True

    __tablename__ = "other_income"
    __table_args__ = (
        UniqueConstraint("school_id", "receipt_no", name="uq_other_income_receipt"),
        Index("ix_other_income_school_date", "school_id", "received_on"),
    )

    received_on: Mapped[date] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(String(40), nullable=False)  # donation, rent, grant, interest, other
    payer: Mapped[str] = mapped_column(String(160), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    mode: Mapped[MoneyMode] = mapped_column(SAEnum(MoneyMode, name="money_mode"), nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(String(300))
    receipt_no: Mapped[str] = mapped_column(String(30), nullable=False)
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    is_void: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # where the money belongs, for branch- and department-wise books
    branch_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("branches.id", ondelete="SET NULL"))
    department_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("departments.id", ondelete="SET NULL"))


class Cheque(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Cheques (incl. post-dated) received against a student's fees. The fees
    are credited only when the cheque clears."""

    __audited__ = True

    __tablename__ = "cheques"
    __table_args__ = (
        Index("ix_cheques_school_status", "school_id", "status"),
        Index("ix_cheques_school_date", "school_id", "cheque_date"),
    )

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    fee_ids: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    cheque_no: Mapped[str] = mapped_column(String(20), nullable=False)
    bank_name: Mapped[str] = mapped_column(String(120), nullable=False)
    drawer_name: Mapped[Optional[str]] = mapped_column(String(160))
    cheque_date: Mapped[date] = mapped_column(Date, nullable=False)
    received_on: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[ChequeStatus] = mapped_column(SAEnum(ChequeStatus, name="cheque_status"), nullable=False)
    deposited_on: Mapped[Optional[date]] = mapped_column(Date)
    cleared_on: Mapped[Optional[date]] = mapped_column(Date)
    bounce_reason: Mapped[Optional[str]] = mapped_column(String(200))
    bounce_charge_fee_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("student_fees.id", ondelete="SET NULL")
    )
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class Concession(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Discount / scholarship on a fee head for one student. Applied when
    class fees are generated (the fee row notes the reduction)."""

    __audited__ = True

    __tablename__ = "fee_concessions"
    __table_args__ = (Index("ix_fee_concessions_student", "student_id"),)

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    fee_head_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("fee_heads.id", ondelete="CASCADE")
    )  # None = every head
    kind: Mapped[ConcessionKind] = mapped_column(SAEnum(ConcessionKind, name="concession_kind"), nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(80), nullable=False)  # sibling, merit, staff ward, scholarship, need-based
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[Optional[date]] = mapped_column(Date)
    approved_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # "approved" (in force or ended), "pending" (asked for, not yet applied) or "rejected".
    approval_status: Mapped[str] = mapped_column(String(20), default="approved", server_default="approved", nullable=False)
    requested_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    apply_to_pending_on_approval: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)


class CashDeposit(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Cash from the counter taken to the bank. Its journal voucher moves the
    amount from Cash in hand to the Bank account in the books."""

    __audited__ = True
    __tablename__ = "cash_deposits"
    __table_args__ = (Index("ix_cash_deposits_school_date", "school_id", "deposited_on"),)

    deposited_on: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    slip_no: Mapped[Optional[str]] = mapped_column(String(60))
    notes: Mapped[Optional[str]] = mapped_column(String(300))
    journal_entry_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("journal_entries.id", ondelete="SET NULL"))
    deposited_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))


class PettyCashEntry(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A petty cash top-up (money into the float) or spend (a small bill paid
    from it). See services/petty_cash_service.py."""

    __audited__ = True
    __tablename__ = "petty_cash_entries"
    __table_args__ = (
        Index("ix_petty_cash_school_date", "school_id", "entry_date"),
        Index("uq_petty_cash_entry_no", "school_id", "entry_no", unique=True),
    )

    entry_no: Mapped[str] = mapped_column(String(20), nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)  # topup | spend
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    mode: Mapped[Optional[str]] = mapped_column(String(20))
    category_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("expense_categories.id", ondelete="RESTRICT"))
    paid_to: Mapped[Optional[str]] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    bill_no: Mapped[Optional[str]] = mapped_column(String(60))
    is_void: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    void_reason: Mapped[Optional[str]] = mapped_column(String(200))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))


class CancelledReceipt(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """A fee receipt cancelled as entered in error: what it said, why it was
    cancelled, who asked and who approved (services/receipt_cancel_service.py)."""

    __audited__ = True
    __tablename__ = "cancelled_receipts"
    __table_args__ = (Index("ix_cancelled_receipts_school", "school_id", "collected_on"),)

    receipt_no: Mapped[str] = mapped_column(String(30), nullable=False)
    student_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    collected_on: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    collected_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))
    lines: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    reason: Mapped[str] = mapped_column(String(300), nullable=False)
    requested_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))
    approved_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))
    cancelled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
