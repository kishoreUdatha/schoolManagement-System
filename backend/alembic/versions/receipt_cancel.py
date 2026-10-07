"""cancelled fee receipts, and their approval

Revision ID: receipt_cancel
Revises: petty_cash_budgets
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "receipt_cancel"
down_revision: Union[str, None] = "petty_cash_budgets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE approval_kind ADD VALUE IF NOT EXISTS 'receipt_cancel'")
    op.create_table(
        "cancelled_receipts",
        sa.Column("receipt_no", sa.String(30), nullable=False),
        sa.Column("student_id", sa.BigInteger(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("collected_on", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("mode", sa.String(20), nullable=False),
        sa.Column("reference", sa.String(120), nullable=True),
        sa.Column("collected_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("lines", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("reason", sa.String(300), nullable=False),
        sa.Column("requested_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_cancelled_receipts_school", "cancelled_receipts", ["school_id", "collected_on"])


def downgrade() -> None:
    op.drop_index("ix_cancelled_receipts_school", table_name="cancelled_receipts")
    op.drop_table("cancelled_receipts")
