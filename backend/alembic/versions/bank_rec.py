"""bank reconciliation: uploaded statements and their lines

Revision ID: bank_rec
Revises: advances
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "bank_rec"
down_revision: Union[str, None] = "advances"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bank_statements",
        sa.Column("account_name", sa.String(120), nullable=False),
        sa.Column("period_from", sa.Date(), nullable=False),
        sa.Column("period_to", sa.Date(), nullable=False),
        sa.Column("opening_balance", sa.Numeric(14, 2), nullable=True),
        sa.Column("closing_balance", sa.Numeric(14, 2), nullable=True),
        sa.Column("file_name", sa.String(200), nullable=True),
        sa.Column("uploaded_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_bank_statements_school", "bank_statements", ["school_id", "period_to"])
    op.create_table(
        "bank_statement_lines",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("statement_id", sa.BigInteger(), sa.ForeignKey("bank_statements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("line_no", sa.Integer(), nullable=False),
        sa.Column("txn_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(300), nullable=False, server_default=""),
        sa.Column("reference", sa.String(120), nullable=True),
        sa.Column("debit", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("credit", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("balance", sa.Numeric(14, 2), nullable=True),
        sa.Column("status", sa.String(12), nullable=False, server_default="unmatched"),
        sa.Column("match_keys", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("match_note", sa.String(200), nullable=True),
    )
    op.create_index("ix_bank_lines_statement", "bank_statement_lines", ["statement_id", "line_no"])
    op.create_index("ix_bank_lines_school_status", "bank_statement_lines", ["school_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_bank_lines_school_status", table_name="bank_statement_lines")
    op.drop_index("ix_bank_lines_statement", table_name="bank_statement_lines")
    op.drop_table("bank_statement_lines")
    op.drop_index("ix_bank_statements_school", table_name="bank_statements")
    op.drop_table("bank_statements")
