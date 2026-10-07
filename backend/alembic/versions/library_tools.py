"""library stock checks: a check of the shelves and the accession numbers seen

Revision ID: library_tools
Revises: staff_role_defaults
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "library_tools"
down_revision: Union[str, None] = "staff_role_defaults"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "library_stock_checks",
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.String(200), nullable=True),
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_library_stock_checks_school_id", "library_stock_checks", ["school_id"])
    op.create_table(
        "library_stock_check_scans",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("check_id", sa.BigInteger(), sa.ForeignKey("library_stock_checks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("accession_no", sa.String(40), nullable=False),
        sa.Column("copy_id", sa.BigInteger(), sa.ForeignKey("library_copies.id", ondelete="SET NULL"), nullable=True),
        sa.Column("shelf", sa.String(40), nullable=True),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scanned_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("check_id", "accession_no", name="uq_stock_scan_once"),
    )
    op.create_index("ix_library_stock_check_scans_check_id", "library_stock_check_scans", ["check_id"])


def downgrade() -> None:
    op.drop_index("ix_library_stock_check_scans_check_id", table_name="library_stock_check_scans")
    op.drop_table("library_stock_check_scans")
    op.drop_index("ix_library_stock_checks_school_id", table_name="library_stock_checks")
    op.drop_table("library_stock_checks")
