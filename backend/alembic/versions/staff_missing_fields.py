"""staff area: fields the screens show that the backend did not store

Staff record: qualification summary, experience, address, emergency contact,
employment type, reporting manager, workload capacity and other duties, and
who closed the onboarding checklist. Offers: department and reporting
manager. Leave types: an approver. Staff leaves: who filed it when somebody
filed it for someone else. Classroom observations: three 1-5 scores. Class
subjects: the usual room.

Revision ID: fields_staff
Revises: fields_setup
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "fields_staff"
down_revision: Union[str, None] = "fields_setup"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    employment_type = postgresql.ENUM(
        "full_time", "part_time", "contract", "temporary",
        name="employment_type", create_type=False,
    )

    # ----- staff -----
    op.add_column("staff", sa.Column("qualification_summary", sa.String(200), nullable=True))
    op.add_column("staff", sa.Column("experience_years", sa.Numeric(4, 1), nullable=True))
    op.add_column("staff", sa.Column("address", sa.Text(), nullable=True))
    op.add_column("staff", sa.Column("emergency_contact_name", sa.String(160), nullable=True))
    op.add_column("staff", sa.Column("emergency_contact_phone", sa.String(20), nullable=True))
    op.add_column("staff", sa.Column("emergency_contact_relation", sa.String(60), nullable=True))
    op.add_column("staff", sa.Column("employment_type", employment_type, nullable=True))
    op.add_column("staff", sa.Column("reporting_manager_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_staff_reporting_manager", "staff", "staff",
        ["reporting_manager_id"], ["id"], ondelete="SET NULL",
    )
    op.add_column("staff", sa.Column("max_periods_per_week", sa.SmallInteger(), nullable=True))
    op.add_column("staff", sa.Column("other_duty_periods", sa.SmallInteger(), nullable=True))
    op.add_column("staff", sa.Column("other_duties", sa.String(300), nullable=True))
    op.add_column("staff", sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("staff", sa.Column("onboarding_completed_by_user_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_staff_onboarding_completed_by", "staff", "users",
        ["onboarding_completed_by_user_id"], ["id"], ondelete="SET NULL",
    )

    # ----- offers -----
    op.add_column("offers", sa.Column("department_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_offers_department", "offers", "departments",
        ["department_id"], ["id"], ondelete="SET NULL",
    )
    op.add_column("offers", sa.Column("reporting_manager_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_offers_reporting_manager", "offers", "staff",
        ["reporting_manager_id"], ["id"], ondelete="SET NULL",
    )

    # ----- leave -----
    op.add_column("leave_types", sa.Column("approver_user_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_leave_types_approver", "leave_types", "users",
        ["approver_user_id"], ["id"], ondelete="SET NULL",
    )
    op.add_column("staff_leaves", sa.Column("filed_by_user_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_staff_leaves_filed_by", "staff_leaves", "users",
        ["filed_by_user_id"], ["id"], ondelete="SET NULL",
    )

    # ----- observations -----
    for col in ("lesson_preparation", "student_engagement", "subject_knowledge"):
        op.add_column("classroom_observations", sa.Column(col, sa.SmallInteger(), nullable=True))
        op.create_check_constraint(
            f"ck_observation_{col}_1_5", "classroom_observations",
            f"{col} IS NULL OR ({col} BETWEEN 1 AND 5)",
        )

    # ----- class subjects -----
    op.add_column("class_subjects", sa.Column("room_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_class_subjects_room", "class_subjects", "rooms",
        ["room_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_class_subjects_room", "class_subjects", type_="foreignkey")
    op.drop_column("class_subjects", "room_id")
    for col in ("lesson_preparation", "student_engagement", "subject_knowledge"):
        op.drop_constraint(f"ck_observation_{col}_1_5", "classroom_observations", type_="check")
        op.drop_column("classroom_observations", col)
    op.drop_constraint("fk_staff_leaves_filed_by", "staff_leaves", type_="foreignkey")
    op.drop_column("staff_leaves", "filed_by_user_id")
    op.drop_constraint("fk_leave_types_approver", "leave_types", type_="foreignkey")
    op.drop_column("leave_types", "approver_user_id")
    op.drop_constraint("fk_offers_reporting_manager", "offers", type_="foreignkey")
    op.drop_column("offers", "reporting_manager_id")
    op.drop_constraint("fk_offers_department", "offers", type_="foreignkey")
    op.drop_column("offers", "department_id")
    op.drop_constraint("fk_staff_onboarding_completed_by", "staff", type_="foreignkey")
    op.drop_constraint("fk_staff_reporting_manager", "staff", type_="foreignkey")
    for col in (
        "onboarding_completed_by_user_id", "onboarding_completed_at", "other_duties",
        "other_duty_periods", "max_periods_per_week", "reporting_manager_id",
        "employment_type", "emergency_contact_relation", "emergency_contact_phone",
        "emergency_contact_name", "address", "experience_years", "qualification_summary",
    ):
        op.drop_column("staff", col)
