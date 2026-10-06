"""journal vouchers: draft or posted, and a longer description

A draft is kept but stays out of the books until it is posted.

Revision ID: journal_status
Revises: book_dimensions
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "journal_status"
down_revision: Union[str, None] = "book_dimensions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("journal_entries", sa.Column("status", sa.String(10), nullable=False, server_default="posted"))
    op.add_column("journal_entries", sa.Column("description", sa.String(500), nullable=True))
    op.add_column("journal_entries", sa.Column("posted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint("ck_journal_entry_status", "journal_entries", "status IN ('draft','posted')")


def downgrade() -> None:
    op.drop_constraint("ck_journal_entry_status", "journal_entries", type_="check")
    op.drop_column("journal_entries", "posted_at")
    op.drop_column("journal_entries", "description")
    op.drop_column("journal_entries", "status")
