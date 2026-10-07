"""transport settings: whether families hear at boarding and drop

Revision ID: transport_notices
Revises: library_tools
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "transport_notices"
down_revision: Union[str, None] = "library_tools"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "transport_settings",
        sa.Column("boarding_notices", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("school_id", name="uq_transport_settings_school"),
    )


def downgrade() -> None:
    op.drop_table("transport_settings")
