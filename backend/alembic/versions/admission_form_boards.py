"""admission form: the school's board, and questions of its own

Revision ID: admission_form_boards
Revises: admission_form
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "admission_form_boards"
down_revision: Union[str, None] = "admission_form"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("admission_form_settings", sa.Column("board", sa.String(20), nullable=True))
    op.create_table(
        "admission_custom_fields",
        sa.Column("key", sa.String(40), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("section", sa.String(20), nullable=False),
        sa.Column("type", sa.String(12), nullable=False),
        sa.Column("options", postgresql.JSONB(), nullable=True),
        sa.Column("help", sa.String(200), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("uq_admission_custom_field_key", "admission_custom_fields", ["school_id", "key"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_admission_custom_field_key", table_name="admission_custom_fields")
    op.drop_table("admission_custom_fields")
    op.drop_column("admission_form_settings", "board")
