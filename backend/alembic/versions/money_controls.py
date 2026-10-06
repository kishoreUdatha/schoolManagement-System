"""money controls: fee waiver and payroll approvals, the waiver limit, bank deposits

Revision ID: money_controls
Revises: receipt_lines
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "money_controls"
down_revision: Union[str, None] = "receipt_lines"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE approval_kind ADD VALUE IF NOT EXISTS 'fee_waiver'")
        op.execute("ALTER TYPE approval_kind ADD VALUE IF NOT EXISTS 'payroll_run'")
    # waivers above this need the principal (null: no limit)
    op.add_column("schools", sa.Column("waiver_approval_above", sa.Numeric(12, 2), nullable=True, server_default="1000"))
    op.add_column("payroll_runs", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payroll_runs", sa.Column("approved_by_user_id", sa.BigInteger(),
                                            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.create_table(
        "cash_deposits",
        sa.Column("deposited_on", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("slip_no", sa.String(60), nullable=True),
        sa.Column("notes", sa.String(300), nullable=True),
        sa.Column("journal_entry_id", sa.BigInteger(), sa.ForeignKey("journal_entries.id", ondelete="SET NULL"), nullable=True),
        sa.Column("deposited_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_cash_deposits_school_date", "cash_deposits", ["school_id", "deposited_on"])


def downgrade() -> None:
    op.drop_index("ix_cash_deposits_school_date", table_name="cash_deposits")
    op.drop_table("cash_deposits")
    op.drop_column("payroll_runs", "approved_by_user_id")
    op.drop_column("payroll_runs", "approved_at")
    op.drop_column("schools", "waiver_approval_above")
    # enum values stay: Postgres cannot drop them
