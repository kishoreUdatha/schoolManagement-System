"""what homework is out of, and what a child scored

Revision ID: homework_marks
Revises: staff_bank_details
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "homework_marks"
down_revision: Union[str, None] = "staff_bank_details"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("homework", sa.Column("max_marks", sa.Numeric(6, 2), nullable=True))
    op.add_column("homework_submissions", sa.Column("marks", sa.Numeric(6, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("homework_submissions", "marks")
    op.drop_column("homework", "max_marks")
