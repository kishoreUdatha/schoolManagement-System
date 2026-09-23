"""where a member of staff is paid, on their own record

Revision ID: staff_bank_details
Revises: platform_messaging
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "staff_bank_details"
down_revision: Union[str, None] = "platform_messaging"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = (
    ("bank_name", sa.String(120)),
    ("bank_account_no", sa.String(34)),
    ("bank_ifsc", sa.String(11)),
    ("pan", sa.String(10)),
    ("uan", sa.String(12)),
)


def upgrade() -> None:
    for name, type_ in COLUMNS:
        op.add_column("staff", sa.Column(name, type_, nullable=True))
    # carry over what payroll already holds, latest salary revision first
    op.execute(
        """
        UPDATE staff s
        SET bank_name = x.bank_name,
            bank_account_no = x.bank_account_no,
            bank_ifsc = x.bank_ifsc,
            pan = x.pan,
            uan = x.uan
        FROM (
            SELECT DISTINCT ON (staff_id) staff_id, bank_name, bank_account_no, bank_ifsc, pan, uan
            FROM staff_salaries
            ORDER BY staff_id, effective_from DESC
        ) x
        WHERE x.staff_id = s.id AND x.bank_account_no IS NOT NULL
        """
    )


def downgrade() -> None:
    for name, _ in COLUMNS:
        op.drop_column("staff", name)
