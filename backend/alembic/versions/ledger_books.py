"""double-entry books: chart of accounts and journal vouchers

Revision ID: ledger_books
Revises: homework_marks
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "ledger_books"
down_revision: Union[str, None] = "homework_marks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _school_cols() -> list:
    return [
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "ledger_accounts",
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("system_key", sa.String(60), nullable=True),
        sa.Column("description", sa.String(300), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_school_cols(),
        sa.UniqueConstraint("school_id", "code", name="uq_ledger_account_code"),
        sa.CheckConstraint(
            "kind IN ('asset','liability','equity','income','expense')", name="ck_ledger_account_kind"
        ),
    )
    op.create_index(
        "uq_ledger_account_system_key", "ledger_accounts", ["school_id", "system_key"],
        unique=True, postgresql_where=sa.text("system_key IS NOT NULL"),
    )

    op.create_table(
        "journal_entries",
        sa.Column("entry_no", sa.String(30), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("narration", sa.String(300), nullable=False),
        sa.Column("reference", sa.String(120), nullable=True),
        sa.Column("created_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_void", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("void_reason", sa.String(300), nullable=True),
        *_school_cols(),
        sa.UniqueConstraint("school_id", "entry_no", name="uq_journal_entry_no"),
    )
    op.create_index("ix_journal_entries_school_date", "journal_entries", ["school_id", "entry_date"])

    op.create_table(
        "journal_lines",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("entry_id", sa.BigInteger(), sa.ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", sa.BigInteger(), sa.ForeignKey("ledger_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("debit", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("credit", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("note", sa.String(200), nullable=True),
        sa.CheckConstraint("debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0)", name="ck_journal_line_side"),
    )
    op.create_index("ix_journal_lines_entry", "journal_lines", ["entry_id"])
    op.create_index("ix_journal_lines_account", "journal_lines", ["account_id"])


def downgrade() -> None:
    op.drop_table("journal_lines")
    op.drop_table("journal_entries")
    op.drop_index("uq_ledger_account_system_key", table_name="ledger_accounts")
    op.drop_table("ledger_accounts")
