"""concession requests in the principal's approvals

Revision ID: concession_approval
Revises: receipt_cancel
"""
from typing import Sequence, Union

from alembic import op

revision: str = "concession_approval"
down_revision: Union[str, None] = "receipt_cancel"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE approval_kind ADD VALUE IF NOT EXISTS 'concession'")


def downgrade() -> None:
    pass  # Postgres cannot drop an enum value
