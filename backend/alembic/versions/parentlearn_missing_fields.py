"""parent app learning fields: exam instructions and paper syllabus, notice
links and event fields, report card acknowledgements

Revision ID: fields_parentlearn
Revises: 945cd484b8d9
Create Date: 2026-09-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fields_parentlearn"
down_revision: Union[str, None] = "945cd484b8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("instructions", sa.Text(), nullable=True))
    op.add_column("exam_subjects", sa.Column("syllabus", sa.String(length=500), nullable=True))

    op.add_column("notices", sa.Column("link", sa.String(length=300), nullable=True))
    op.add_column("notices", sa.Column("event_date", sa.Date(), nullable=True))
    op.add_column("notices", sa.Column("event_start_time", sa.Time(), nullable=True))
    op.add_column("notices", sa.Column("event_end_time", sa.Time(), nullable=True))
    op.add_column("notices", sa.Column("event_venue", sa.String(length=200), nullable=True))

    op.create_table(
        "report_card_acknowledgements",
        sa.Column("tenant_id", sa.BigInteger(), nullable=False),
        sa.Column("school_id", sa.BigInteger(), nullable=False),
        sa.Column("exam_id", sa.BigInteger(), nullable=False),
        sa.Column("student_id", sa.BigInteger(), nullable=False),
        sa.Column("parent_user_id", sa.BigInteger(), nullable=False),
        sa.Column("result_version", sa.Integer(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["exam_id"], ["exams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("exam_id", "student_id", "parent_user_id", name="uq_report_card_ack"),
    )
    op.create_index(
        "ix_report_card_acknowledgements_exam_id", "report_card_acknowledgements", ["exam_id"], unique=False
    )
    op.create_index(
        "ix_report_card_acknowledgements_student_id", "report_card_acknowledgements", ["student_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_report_card_acknowledgements_student_id", table_name="report_card_acknowledgements")
    op.drop_index("ix_report_card_acknowledgements_exam_id", table_name="report_card_acknowledgements")
    op.drop_table("report_card_acknowledgements")
    for col in ("event_venue", "event_end_time", "event_start_time", "event_date", "link"):
        op.drop_column("notices", col)
    op.drop_column("exam_subjects", "syllabus")
    op.drop_column("exams", "instructions")
