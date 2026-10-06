"""ledger accounts get a category (account group) for statements and filters

Revision ID: ledger_account_category
Revises: ledger_books
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "ledger_account_category"
down_revision: Union[str, None] = "ledger_books"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ledger_accounts", sa.Column("category", sa.String(60), nullable=True))


def downgrade() -> None:
    op.drop_column("ledger_accounts", "category")
