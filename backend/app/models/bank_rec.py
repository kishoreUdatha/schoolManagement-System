"""Bank statements uploaded for reconciliation (services/bank_rec_service.py)."""
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import BigInteger, Date, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class BankStatement(Base, PrimaryKeyMixin, TimestampMixin):
    __audited__ = True
    __tablename__ = "bank_statements"
    __table_args__ = (Index("ix_bank_statements_school", "school_id", "period_to"),)

    tenant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    school_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    account_name: Mapped[str] = mapped_column(String(120), nullable=False)
    period_from: Mapped[date] = mapped_column(Date, nullable=False)
    period_to: Mapped[date] = mapped_column(Date, nullable=False)
    opening_balance: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2))
    closing_balance: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2))
    file_name: Mapped[Optional[str]] = mapped_column(String(200))
    uploaded_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"))


class BankStatementLine(Base):
    """One line of the bank's statement, and what in the books it matches:
    `match_keys` names postings as "source:id" (books_service.entries)."""

    __tablename__ = "bank_statement_lines"
    __table_args__ = (
        Index("ix_bank_lines_statement", "statement_id", "line_no"),
        Index("ix_bank_lines_school_status", "school_id", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    statement_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("bank_statements.id", ondelete="CASCADE"), nullable=False)
    school_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    txn_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    debit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    credit: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    balance: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2))
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="unmatched")  # unmatched | matched | ignored
    match_keys: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    match_note: Mapped[Optional[str]] = mapped_column(String(200))
