"""people: missing fields on parents, admissions and students

- parent_notes: school-side notes on a parent
- admission_enquiries.branch_id: the campus an enquiry is about
- admission_applications.transport_required
- student_enrollments.exit_remarks: remarks kept when a child leaves
- medical_profiles.guardian_consent / consent_given_by / consent_on

Revision ID: fields_people
Revises: 945cd484b8d9
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fields_people"
down_revision: Union[str, None] = "945cd484b8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "parent_notes",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.BigInteger(), nullable=False),
        sa.Column("school_id", sa.BigInteger(), nullable=False),
        sa.Column("parent_user_id", sa.BigInteger(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_by_user_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_parent_notes_parent", "parent_notes", ["parent_user_id"])

    op.add_column("admission_enquiries", sa.Column("branch_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_admission_enquiries_branch_id", "admission_enquiries", "branches",
        ["branch_id"], ["id"], ondelete="SET NULL",
    )

    op.add_column(
        "admission_applications",
        sa.Column("transport_required", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )

    op.add_column("student_enrollments", sa.Column("exit_remarks", sa.Text(), nullable=True))

    op.add_column("medical_profiles", sa.Column("guardian_consent", sa.Boolean(), nullable=True))
    op.add_column("medical_profiles", sa.Column("consent_given_by", sa.String(length=160), nullable=True))
    op.add_column("medical_profiles", sa.Column("consent_on", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("medical_profiles", "consent_on")
    op.drop_column("medical_profiles", "consent_given_by")
    op.drop_column("medical_profiles", "guardian_consent")
    op.drop_column("student_enrollments", "exit_remarks")
    op.drop_column("admission_applications", "transport_required")
    op.drop_constraint("fk_admission_enquiries_branch_id", "admission_enquiries", type_="foreignkey")
    op.drop_column("admission_enquiries", "branch_id")
    op.drop_index("ix_parent_notes_parent", table_name="parent_notes")
    op.drop_table("parent_notes")
