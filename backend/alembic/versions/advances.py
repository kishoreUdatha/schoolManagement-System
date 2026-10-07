"""advances: money paid beyond what is due, its use, and moving a payment between students

Revision ID: advances
Revises: concession_approval
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "advances"
down_revision: Union[str, None] = "concession_approval"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE approval_kind ADD VALUE IF NOT EXISTS 'payment_move'")
    op.create_table(
        "advance_uses",
        sa.Column("student_id", sa.BigInteger(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_fee_id", sa.BigInteger(), sa.ForeignKey("student_fees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("used_on", sa.Date(), nullable=False),
        sa.Column("used_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_advance_uses_student", "advance_uses", ["student_id"])


def downgrade() -> None:
    op.drop_index("ix_advance_uses_student", table_name="advance_uses")
    op.drop_table("advance_uses")
