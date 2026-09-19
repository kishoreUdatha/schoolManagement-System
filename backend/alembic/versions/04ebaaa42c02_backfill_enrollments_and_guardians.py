"""backfill enrollments and guardians

Revision ID: 04ebaaa42c02
Revises: 46376e6bc8b0
Create Date: 2026-09-19 19:04:42.533952

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '04ebaaa42c02'
down_revision: Union[str, None] = '46376e6bc8b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # One enrolment per student for the year they're in now (earlier years
    # were overwritten by promotion before history existed).
    op.execute("""
        INSERT INTO student_enrollments
            (tenant_id, school_id, student_id, academic_year_id, section_id, roll_no,
             start_date, end_date, outcome, notes, created_at, updated_at)
        SELECT s.tenant_id, s.school_id, s.id, s.academic_year_id, s.section_id, s.roll_no,
               COALESCE(y.start_date, s.created_at::date),
               CASE WHEN s.is_active THEN NULL ELSE s.updated_at::date END,
               CASE WHEN s.is_active THEN 'studying' ELSE 'left' END::enrollment_outcome,
               'Backfilled from the student record', now(), now()
        FROM students s
        LEFT JOIN academic_years y ON y.id = s.academic_year_id
        ON CONFLICT (student_id, academic_year_id) DO NOTHING
    """)
    # A guardian record for every parent login, linked to their children.
    op.execute("""
        INSERT INTO guardians (tenant_id, school_id, full_name, phone, email, user_id, created_at, updated_at)
        SELECT u.tenant_id, u.school_id, u.full_name, u.phone, u.email, u.id, now(), now()
        FROM users u
        WHERE u.role = 'parent' AND u.school_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM guardians g WHERE g.user_id = u.id)
    """)
    op.execute("""
        INSERT INTO student_guardians
            (student_id, guardian_id, relation, is_primary, can_pickup, is_emergency_contact,
             lives_with_student, created_at, updated_at)
        SELECT ps.student_id, g.id, ps.relation::text::guardian_relation,
               ROW_NUMBER() OVER (PARTITION BY ps.student_id ORDER BY ps.id) = 1,
               true, true, true, now(), now()
        FROM parent_students ps
        JOIN guardians g ON g.user_id = ps.parent_user_id
        ON CONFLICT (student_id, guardian_id) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM student_guardians")
    op.execute("DELETE FROM guardians")
    op.execute("DELETE FROM student_enrollments")
