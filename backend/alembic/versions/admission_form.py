"""full admission form: per-class field settings, application details, student profiles

Revision ID: admission_form
Revises: journal_status
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "admission_form"
down_revision: Union[str, None] = "journal_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _school_cols() -> list:
    return [
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    op.add_column("admission_applications", sa.Column("details", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.create_table(
        "admission_form_settings",
        sa.Column("class_id", sa.BigInteger(), sa.ForeignKey("school_classes.id", ondelete="CASCADE"), nullable=True),
        sa.Column("required", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("hidden", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        *_school_cols(),
    )
    op.create_index("uq_admission_form_default", "admission_form_settings", ["school_id"], unique=True,
                    postgresql_where=sa.text("class_id IS NULL"))
    op.create_index("uq_admission_form_class", "admission_form_settings", ["school_id", "class_id"], unique=True,
                    postgresql_where=sa.text("class_id IS NOT NULL"))
    op.create_table(
        "student_profiles",
        sa.Column("student_id", sa.BigInteger(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("details", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        *_school_cols(),
    )
    op.create_index("uq_student_profile_student", "student_profiles", ["student_id"], unique=True)


def downgrade() -> None:
    op.drop_table("student_profiles")
    op.drop_index("uq_admission_form_class", table_name="admission_form_settings")
    op.drop_index("uq_admission_form_default", table_name="admission_form_settings")
    op.drop_table("admission_form_settings")
    op.drop_column("admission_applications", "details")
