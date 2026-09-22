"""reports: kept health-probe samples

Revision ID: fields_reports
Revises: fields_files
Create Date: 2026-09-22

Everything else the reports area needed is computed from data already kept
(timetable, calendar, audit log, marks, loans, payslips …). The one series
that cannot be recomputed later is the health probe, so it gets a table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fields_reports"
down_revision: Union[str, None] = "fields_files"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "health_samples",
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("service", sa.String(length=60), nullable=False),
        sa.Column("state", sa.String(length=20), nullable=False),
        sa.Column("latency_ms", sa.Float(), nullable=True),
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_health_samples_service_checked", "health_samples", ["service", "checked_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_health_samples_service_checked", table_name="health_samples")
    op.drop_table("health_samples")
