"""ops area: missing fields behind the screens' "Not wired" notes

Revision ID: fields_ops
Revises: 945cd484b8d9
Create Date: 2026-09-22

Additive only: new nullable columns (or columns with server defaults) and new tables.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "fields_ops"
down_revision: Union[str, None] = "945cd484b8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, column) pairs added below; downgrade drops them in reverse.
COLUMNS: list[tuple[str, sa.Column]] = [
    # #1 concession request -> approval
    ("fee_concessions", sa.Column("approval_status", sa.String(20), server_default="approved", nullable=False)),
    ("fee_concessions", sa.Column("requested_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)),
    ("fee_concessions", sa.Column("apply_to_pending_on_approval", sa.Boolean(), server_default=sa.false(), nullable=False)),
    # #34 late entry / early exit: who authorised it, who logged it
    ("student_attendance", sa.Column("times_authorised_by", sa.String(120), nullable=True)),
    ("student_attendance", sa.Column("times_recorded_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)),
    # #35 event coordinator and capacity
    ("school_events", sa.Column("coordinator", sa.String(160), nullable=True)),
    ("school_events", sa.Column("capacity", sa.Integer(), nullable=True)),
    # #37 PTM meeting mode chosen at booking
    ("ptm_slots", sa.Column("meeting_mode", sa.String(20), nullable=True)),
    # #47 certificate signatory
    ("certificate_issues", sa.Column("signatory", sa.String(120), nullable=True)),
    # #48 exam classes and result date
    ("exams", sa.Column("class_ids", postgresql.JSONB(), nullable=True)),
    ("exams", sa.Column("result_date", sa.Date(), nullable=True)),
    # #54 medication: prescription, consent, who typed the entry
    ("medication_administrations", sa.Column("prescribed_by", sa.String(160), nullable=True)),
    ("medication_administrations", sa.Column("consent_reference", sa.String(120), nullable=True)),
    ("medication_administrations", sa.Column("recorded_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)),
    # #55 counselling session support plan
    ("counselling_sessions", sa.Column("support_plan", sa.Text(), nullable=True)),
    # #56 when an emergency contact can be reached
    ("emergency_escalations", sa.Column("availability", sa.String(120), nullable=True)),
    # #60 scheduled publishing of homework
    ("homework", sa.Column("publish_on", sa.Date(), nullable=True)),
    # #62 hostel roll call: check-in time, late, remark
    ("hostel_attendance", sa.Column("checked_in_at", sa.Time(), nullable=True)),
    ("hostel_attendance", sa.Column("is_late", sa.Boolean(), server_default=sa.false(), nullable=False)),
    ("hostel_attendance", sa.Column("remark", sa.String(300), nullable=True)),
    # #70/#71 where stock went in or out
    ("stock_moves", sa.Column("location", sa.String(80), nullable=True)),
    # #72 supplier category
    ("suppliers", sa.Column("category", sa.String(80), nullable=True)),
    # #73 library issue remarks; #75 fine received and how
    ("library_loans", sa.Column("issue_remarks", sa.String(300), nullable=True)),
    ("library_loans", sa.Column("fine_received", sa.Numeric(10, 2), nullable=True)),
    ("library_loans", sa.Column("fine_payment_method", sa.String(20), nullable=True)),
    # #74 reservation date and notification channel
    ("library_reservations", sa.Column("reserved_on", sa.Date(), nullable=True)),
    ("library_reservations", sa.Column("notify_channel", sa.String(20), nullable=True)),
    # #135 visit pass expiry; #136 pass returned at check-out, and by whom
    ("visits", sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True)),
    ("visits", sa.Column("pass_returned", sa.Boolean(), nullable=True)),
    ("visits", sa.Column("checked_out_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)),
]


def _school_cols() -> list[sa.Column]:
    return [
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("tenant_id", sa.BigInteger(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("school_id", sa.BigInteger(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
    ]


def _tables() -> dict[str, list]:
    """New tables: name -> columns and constraints (the id/timestamps/school
    columns every table here carries come first)."""
    return {
        # #51 a name for one class's fee structure in a year
        "fee_structure_names": [
            *_school_cols(),
            sa.Column("academic_year_id", sa.BigInteger(), sa.ForeignKey("academic_years.id", ondelete="CASCADE"), nullable=False),
            sa.Column("class_id", sa.BigInteger(), sa.ForeignKey("school_classes.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(160), nullable=False),
            sa.UniqueConstraint("school_id", "academic_year_id", "class_id", name="uq_fee_structure_name"),
        ],
        # #137 staff logged in / out at the gate
        "staff_gate_entries": [
            *_school_cols(),
            sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("direction", sa.String(3), nullable=False),
            sa.Column("at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("vehicle_no", sa.String(20), nullable=True),
            sa.Column("note", sa.String(300), nullable=True),
            sa.Column("recorded_by_user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Index("ix_staff_gate_entries_school_at", "school_id", "at"),
        ],
    }


def _has(table: str, column: str) -> bool:
    return column in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _has_table(table: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table)


def upgrade() -> None:
    for name, cols in _tables().items():
        if not _has_table(name):
            op.create_table(name, *cols)
    for table, column in COLUMNS:
        if not _has(table, column.name):
            op.add_column(table, column)
            if (table, column.name) == ("student_attendance", "times_recorded_by_user_id"):
                # Times already on the register came from the late/early desk:
                # keep them listed there (the list now ignores bare check-in times).
                op.execute("UPDATE student_attendance SET times_recorded_by_user_id = marked_by_user_id "
                           "WHERE arrived_at IS NOT NULL OR left_at IS NOT NULL")


def downgrade() -> None:
    for table, column in reversed(COLUMNS):
        if _has(table, column.name):
            op.drop_column(table, column.name)
    for name in reversed(list(_tables())):
        if _has_table(name):
            op.drop_table(name)
