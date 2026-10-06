"""petty cash (a float, its spends and top-ups) and yearly budgets per account

Revision ID: petty_cash_budgets
Revises: money_controls
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "petty_cash_budgets"
down_revision: Union[str, None] = "money_controls"
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
    # the petty cash float the custodian is kept topped up to
    op.add_column("schools", sa.Column("petty_cash_float", sa.Numeric(12, 2), nullable=False, server_default="5000"))
    op.create_table(
        "petty_cash_entries",
        sa.Column("entry_no", sa.String(20), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),  # topup | spend
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        # a top-up: where the money came from (cash, bank_transfer, cheque…)
        sa.Column("mode", sa.String(20), nullable=True),
        # a spend: what it was for
        sa.Column("category_id", sa.BigInteger(), sa.ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("paid_to", sa.String(120), nullable=True),
        sa.Column("description", sa.String(300), nullable=False),
        sa.Column("bill_no", sa.String(60), nullable=True),
        sa.Column("is_void", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("void_reason", sa.String(200), nullable=True),
        sa.Column("created_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        *_school_cols(),
    )
    op.create_index("ix_petty_cash_school_date", "petty_cash_entries", ["school_id", "entry_date"])
    op.create_index("uq_petty_cash_entry_no", "petty_cash_entries", ["school_id", "entry_no"], unique=True)
    op.create_table(
        "budgets",
        # the financial year by its first day (1 April)
        sa.Column("year_from", sa.Date(), nullable=False),
        sa.Column("account_id", sa.BigInteger(), sa.ForeignKey("ledger_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("notes", sa.String(200), nullable=True),
        *_school_cols(),
    )
    op.create_index("uq_budget_year_account", "budgets", ["school_id", "year_from", "account_id"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_budget_year_account", table_name="budgets")
    op.drop_table("budgets")
    op.drop_index("uq_petty_cash_entry_no", table_name="petty_cash_entries")
    op.drop_index("ix_petty_cash_school_date", table_name="petty_cash_entries")
    op.drop_table("petty_cash_entries")
    op.drop_column("schools", "petty_cash_float")
