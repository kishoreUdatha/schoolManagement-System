"""fee receipts: one receipt number may cover several fee lines paid together

Revision ID: receipt_lines
Revises: starter_job_roles
"""
from typing import Sequence, Union

from alembic import op

revision: str = "receipt_lines"
down_revision: Union[str, None] = "starter_job_roles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # numbers stay unique per payment: ledger_service takes them under a lock
    op.drop_constraint("uq_fee_collection_receipt", "fee_collections", type_="unique")
    op.create_index("ix_fee_collections_receipt", "fee_collections", ["school_id", "receipt_no"])


def downgrade() -> None:
    op.drop_index("ix_fee_collections_receipt", table_name="fee_collections")
    op.create_unique_constraint("uq_fee_collection_receipt", "fee_collections", ["school_id", "receipt_no"])
