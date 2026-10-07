"""staff role defaults: a staff login no longer carries four jobs; HR loses fee reports

Every school's built-in Staff role was seeded with front desk, library,
inventory and hostel, so everyone who signs in as staff held all four. Where a
school's Staff role still has exactly that set, it is emptied: those jobs come
from the Receptionist, Librarian, Lab Assistant and Hostel Warden roles. The
HR starter role loses reports.view (fee reports) where the school hasn't
changed it; its staff reports come with hr.manage. A school that changed
either role keeps its own choice.

Revision ID: staff_role_defaults
Revises: bank_rec
"""
from typing import Sequence, Union

from alembic import op

revision: str = "staff_role_defaults"
down_revision: Union[str, None] = "bank_rec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_STAFF = "'frontdesk.manage','hostel.manage','inventory.manage','library.manage'"
OLD_HR = "'hr.manage','reports.view','staff.manage'"


def _unchanged(code: str, system: bool, codes: str, count: int) -> str:
    """Roles with this code whose permissions are exactly the old default."""
    return f"""
        SELECT r.id FROM roles r
        WHERE r.code = '{code}' AND r.is_system = {str(system).lower()}
          AND (SELECT count(*) FROM role_permissions rp WHERE rp.role_id = r.id) = {count}
          AND (SELECT count(*) FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
               WHERE rp.role_id = r.id AND p.code IN ({codes})) = {count}
    """


def upgrade() -> None:
    op.execute(f"DELETE FROM role_permissions WHERE role_id IN ({_unchanged('staff', True, OLD_STAFF, 4)})")
    op.execute(f"""
        DELETE FROM role_permissions
        WHERE role_id IN ({_unchanged('hr', False, OLD_HR, 3)})
          AND permission_id = (SELECT id FROM permissions WHERE code = 'reports.view')
    """)


def downgrade() -> None:
    # the old defaults are not put back: a school sets its roles in Users & roles
    pass
