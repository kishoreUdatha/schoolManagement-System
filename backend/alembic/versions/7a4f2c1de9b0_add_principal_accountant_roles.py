"""add principal and accountant to user_role enum

Revision ID: 7a4f2c1de9b0
Revises: 49219c7f3cf4
Create Date: 2026-06-06 18:30:00.000000

Postgres enum values are immutable, so this uses ALTER TYPE ... ADD VALUE.
ALTER TYPE cannot run inside a transaction with other DDL, so this migration
is intentionally minimal.

Downgrade is intentionally a no-op — Postgres does not support removing enum
values without rebuilding the type. If you need to remove these, write a
manual DROP TYPE + recreate migration.
"""
from alembic import op


revision = "7a4f2c1de9b0"
down_revision = "49219c7f3cf4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS guards against re-running in dev where the value already
    # exists (e.g., schema was reset manually).
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'principal'")
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'accountant'")


def downgrade() -> None:
    # Removing an enum value in Postgres requires recreating the type. Leave as
    # a no-op; the unused values are harmless and stay in the enum.
    pass
