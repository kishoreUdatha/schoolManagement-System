"""branch and department on the money records the books cannot place by themselves

Fees follow the student's section and payroll the staff record; expenses,
supplier bills, other income and journal lines are tagged when they are
entered.

Revision ID: book_dimensions
Revises: ledger_account_category
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "book_dimensions"
down_revision: Union[str, None] = "ledger_account_category"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("expenses", "vendor_bills", "other_income", "journal_lines")


def upgrade() -> None:
    for t in TABLES:
        op.add_column(t, sa.Column("branch_id", sa.BigInteger(), sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True))
        op.add_column(t, sa.Column("department_id", sa.BigInteger(), sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True))


def downgrade() -> None:
    for t in TABLES:
        op.drop_column(t, "department_id")
        op.drop_column(t, "branch_id")
