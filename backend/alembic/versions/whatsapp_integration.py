"""per-school WhatsApp: connection, templates, provider ids on deliveries

Revision ID: whatsapp_integration
Revises: fields_ops
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "whatsapp_integration"
down_revision: Union[str, None] = "fields_ops"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "school_whatsapp_configs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("sender_number", sa.String(20), nullable=False),
        sa.Column("phone_number_id", sa.String(64)),
        sa.Column("business_account_id", sa.String(64)),
        sa.Column("account_sid", sa.String(64)),
        sa.Column("token_enc", sa.Text()),
        sa.Column("app_secret_enc", sa.Text()),
        sa.Column("verify_token", sa.String(64)),
        sa.Column("default_country_code", sa.String(4), nullable=False, server_default="91"),
        sa.Column("auto_categories", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_error", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("school_id", name="uq_whatsapp_config_school"),
    )
    op.create_table(
        "school_whatsapp_templates",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("template_name", sa.String(120), nullable=False),
        sa.Column("language", sa.String(10), nullable=False, server_default="en"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("school_id", "purpose", name="uq_whatsapp_template_purpose"),
    )
    op.add_column("notice_recipients", sa.Column("provider_message_id", sa.String(100)))
    op.add_column("notice_recipients", sa.Column("to_phone", sa.String(20)))
    op.create_index("ix_notice_recipients_provider_msg", "notice_recipients", ["provider_message_id"])
    op.create_index("ix_notice_recipients_queue", "notice_recipients", ["channel", "status"])


def downgrade() -> None:
    op.drop_index("ix_notice_recipients_queue", table_name="notice_recipients")
    op.drop_index("ix_notice_recipients_provider_msg", table_name="notice_recipients")
    op.drop_column("notice_recipients", "to_phone")
    op.drop_column("notice_recipients", "provider_message_id")
    op.drop_table("school_whatsapp_templates")
    op.drop_table("school_whatsapp_configs")
