"""front office post and courier register

Revision ID: front_office_post
Revises: transport_notices
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "front_office_post"
down_revision: Union[str, None] = "transport_notices"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "front_office_post",
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("direction", sa.String(3), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False, server_default="letter"),
        sa.Column("party", sa.String(160), nullable=False),
        sa.Column("for_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("for_text", sa.String(160), nullable=True),
        sa.Column("courier", sa.String(80), nullable=True),
        sa.Column("tracking_no", sa.String(80), nullable=True),
        sa.Column("note", sa.String(300), nullable=True),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("logged_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("handed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("handed_to", sa.String(120), nullable=True),
        sa.Column("handed_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_front_office_post_school", "front_office_post", ["school_id", "logged_at"])


def downgrade() -> None:
    op.drop_index("ix_front_office_post_school", table_name="front_office_post")
    op.drop_table("front_office_post")
