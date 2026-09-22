"""parent services: requests, help desk, surveys, achievements, milestones,
canteen menu, communication hours, certificate delivery preference

Revision ID: fields_parentsvc
Revises: fields_parentlearn
Create Date: 2026-09-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "fields_parentsvc"
down_revision: Union[str, None] = "fields_parentlearn"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _school_cols():
    return [
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
    ]


def _base_cols():
    return [
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "parent_requests",
        *_base_cols(),
        *_school_cols(),
        sa.Column("parent_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.BigInteger(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=True),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("details", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("reason", sa.String(500), nullable=True),
        sa.Column("decided_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.String(500), nullable=True),
    )
    op.create_index("ix_parent_requests_school_kind", "parent_requests", ["school_id", "kind", "status"])
    op.create_index("ix_parent_requests_parent", "parent_requests", ["parent_user_id"])

    op.create_table(
        "parent_service_settings",
        *_base_cols(),
        *_school_cols(),
        sa.Column("communication_hours", sa.String(200), nullable=True),
        sa.Column("office_hours", sa.String(200), nullable=True),
        sa.Column("office_phone", sa.String(20), nullable=True),
        sa.Column("office_email", sa.String(255), nullable=True),
        sa.Column("help_desk_note", sa.String(300), nullable=True),
        sa.UniqueConstraint("school_id", name="uq_parent_service_settings_school"),
    )

    op.create_table(
        "help_tickets",
        *_base_cols(),
        *_school_cols(),
        sa.Column("parent_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.BigInteger(), sa.ForeignKey("students.id", ondelete="SET NULL"), nullable=True),
        sa.Column("category", sa.String(60), nullable=False),
        sa.Column("subject", sa.String(150), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("assigned_to_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("parent_unread", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_help_tickets_school_status", "help_tickets", ["school_id", "status"])
    op.create_index("ix_help_tickets_parent", "help_tickets", ["parent_user_id"])

    op.create_table(
        "help_ticket_replies",
        *_base_cols(),
        sa.Column("ticket_id", sa.BigInteger(), sa.ForeignKey("help_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
    )
    op.create_index("ix_help_ticket_replies_ticket", "help_ticket_replies", ["ticket_id"])

    op.create_table(
        "surveys",
        *_base_cols(),
        *_school_cols(),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("audience", sa.String(20), nullable=False, server_default="all"),
        sa.Column("class_id", sa.BigInteger(), sa.ForeignKey("school_classes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("questions", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("closes_on", sa.Date(), nullable=True),
        sa.Column("created_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_surveys_school_status", "surveys", ["school_id", "status"])

    op.create_table(
        "survey_responses",
        *_base_cols(),
        sa.Column("survey_id", sa.BigInteger(), sa.ForeignKey("surveys.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("answers", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.UniqueConstraint("survey_id", "parent_user_id", name="uq_survey_response_per_parent"),
    )
    op.create_index("ix_survey_responses_survey", "survey_responses", ["survey_id"])

    op.create_table(
        "student_achievements",
        *_base_cols(),
        *_school_cols(),
        sa.Column("student_id", sa.BigInteger(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("category", sa.String(40), nullable=False, server_default="academic"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="achieved"),
        sa.Column("achieved_on", sa.Date(), nullable=True),
        sa.Column("target_value", sa.Integer(), nullable=True),
        sa.Column("current_value", sa.Integer(), nullable=True),
        sa.Column("unit", sa.String(40), nullable=True),
        sa.Column("shared_with_parents", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("recorded_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_student_achievements_student", "student_achievements", ["student_id"])

    op.create_table(
        "project_milestones",
        *_base_cols(),
        *_school_cols(),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("due_on", sa.Date(), nullable=True),
        sa.Column("position", sa.SmallInteger(), nullable=False, server_default="0"),
    )
    op.create_index("ix_project_milestones_project", "project_milestones", ["project_id"])

    op.create_table(
        "canteen_menu",
        *_base_cols(),
        *_school_cols(),
        sa.Column("day_of_week", sa.SmallInteger(), nullable=False),
        sa.Column("meal", sa.String(20), nullable=False),
        sa.Column("items", sa.String(500), nullable=False),
        sa.UniqueConstraint("school_id", "day_of_week", "meal", name="uq_canteen_menu_slot"),
    )

    op.add_column("certificate_issues", sa.Column("delivery_preference", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("certificate_issues", "delivery_preference")
    for t in (
        "canteen_menu",
        "project_milestones",
        "student_achievements",
        "survey_responses",
        "surveys",
        "help_ticket_replies",
        "help_tickets",
        "parent_service_settings",
        "parent_requests",
    ):
        op.drop_table(t)
