"""extend notice audience for section and single parent

Revision ID: ee077238e5e5
Revises: bef5c92bd688
Create Date: 2026-06-06 15:21:20.192039

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ee077238e5e5'
down_revision: Union[str, None] = 'bef5c92bd688'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new enum values to notice_audience (must be in their own commit per pg)
    op.execute("ALTER TYPE notice_audience ADD VALUE IF NOT EXISTS 'section_parents'")
    op.execute("ALTER TYPE notice_audience ADD VALUE IF NOT EXISTS 'single_parent'")
    op.add_column('notices', sa.Column('audience_section_id', sa.BigInteger(), nullable=True))
    op.add_column('notices', sa.Column('audience_student_id', sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        'fk_notices_audience_section_id', 'notices', 'sections',
        ['audience_section_id'], ['id'], ondelete='SET NULL',
    )
    op.create_foreign_key(
        'fk_notices_audience_student_id', 'notices', 'students',
        ['audience_student_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_notices_audience_student_id', 'notices', type_='foreignkey')
    op.drop_constraint('fk_notices_audience_section_id', 'notices', type_='foreignkey')
    op.drop_column('notices', 'audience_student_id')
    op.drop_column('notices', 'audience_section_id')
    # Note: cannot remove enum values cleanly in pg; downgrade keeps them unused.
