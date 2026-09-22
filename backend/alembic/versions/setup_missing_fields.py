"""setup: fields the setup and settings screens show but the API did not keep

School: board, school type, website, accent colour, attendance mode,
promotion threshold, quiet hours. Academic year: admissions open flag and
the date they open. Class: code, school level, capacity, coordinator,
active flag. Term: working-day count. Department: email, phone. Branch:
email, capacity. Subject group: class, minimum and maximum picks.

Revision ID: fields_setup
Revises: 945cd484b8d9
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fields_setup"
down_revision: Union[str, None] = "945cd484b8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("schools", sa.Column("board", sa.String(length=40), nullable=True))
    op.add_column("schools", sa.Column("school_type", sa.String(length=60), nullable=True))
    op.add_column("schools", sa.Column("website", sa.String(length=255), nullable=True))
    op.add_column("schools", sa.Column("accent_color", sa.String(length=7), nullable=True))
    op.add_column(
        "schools",
        sa.Column("attendance_mode", sa.String(length=20), server_default="daily", nullable=False),
    )
    op.add_column("schools", sa.Column("promotion_threshold", sa.SmallInteger(), nullable=True))
    op.add_column("schools", sa.Column("quiet_hours_start", sa.Time(), nullable=True))
    op.add_column("schools", sa.Column("quiet_hours_end", sa.Time(), nullable=True))

    op.add_column(
        "academic_years",
        sa.Column("admissions_open", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column("academic_years", sa.Column("admission_opens_on", sa.Date(), nullable=True))

    op.add_column("school_classes", sa.Column("code", sa.String(length=20), nullable=True))
    op.add_column("school_classes", sa.Column("school_level", sa.String(length=40), nullable=True))
    op.add_column("school_classes", sa.Column("capacity", sa.Integer(), nullable=True))
    op.add_column("school_classes", sa.Column("coordinator_user_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_school_classes_coordinator_user_id", "school_classes", "users",
        ["coordinator_user_id"], ["id"], ondelete="SET NULL",
    )
    op.add_column(
        "school_classes",
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
    )

    op.add_column("terms", sa.Column("working_days", sa.Integer(), nullable=True))

    op.add_column("departments", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column("departments", sa.Column("phone", sa.String(length=20), nullable=True))

    op.add_column("branches", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column("branches", sa.Column("capacity", sa.Integer(), nullable=True))

    op.add_column("subject_groups", sa.Column("class_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_subject_groups_class_id", "subject_groups", "school_classes",
        ["class_id"], ["id"], ondelete="SET NULL",
    )
    op.add_column("subject_groups", sa.Column("min_picks", sa.SmallInteger(), nullable=True))
    op.add_column("subject_groups", sa.Column("max_picks", sa.SmallInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("subject_groups", "max_picks")
    op.drop_column("subject_groups", "min_picks")
    op.drop_constraint("fk_subject_groups_class_id", "subject_groups", type_="foreignkey")
    op.drop_column("subject_groups", "class_id")
    op.drop_column("branches", "capacity")
    op.drop_column("branches", "email")
    op.drop_column("departments", "phone")
    op.drop_column("departments", "email")
    op.drop_column("terms", "working_days")
    op.drop_column("school_classes", "is_active")
    op.drop_constraint("fk_school_classes_coordinator_user_id", "school_classes", type_="foreignkey")
    op.drop_column("school_classes", "coordinator_user_id")
    op.drop_column("school_classes", "capacity")
    op.drop_column("school_classes", "school_level")
    op.drop_column("school_classes", "code")
    op.drop_column("academic_years", "admission_opens_on")
    op.drop_column("academic_years", "admissions_open")
    op.drop_column("schools", "quiet_hours_end")
    op.drop_column("schools", "quiet_hours_start")
    op.drop_column("schools", "promotion_threshold")
    op.drop_column("schools", "attendance_mode")
    op.drop_column("schools", "accent_color")
    op.drop_column("schools", "website")
    op.drop_column("schools", "school_type")
    op.drop_column("schools", "board")
