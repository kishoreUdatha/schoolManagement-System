"""the platform's own WhatsApp and SMS, and the log of what it sent

Revision ID: platform_messaging
Revises: whatsapp_integration
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "platform_messaging"
down_revision: Union[str, None] = "whatsapp_integration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "platform_messaging_channels",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("channel", sa.String(20), nullable=False, unique=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("sender", sa.String(40), nullable=False),
        sa.Column("account_id", sa.String(64)),
        sa.Column("token_enc", sa.String(1000)),
        sa.Column("template", sa.String(120)),
        sa.Column("language", sa.String(10), nullable=False, server_default="en"),
        sa.Column("default_country_code", sa.String(4), nullable=False, server_default="91"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_error", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "platform_message_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("to_number", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("provider_message_id", sa.String(120)),
        sa.Column("error", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_platform_message_logs_tenant_id", "platform_message_logs", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_platform_message_logs_tenant_id", table_name="platform_message_logs")
    op.drop_table("platform_message_logs")
    op.drop_table("platform_messaging_channels")
