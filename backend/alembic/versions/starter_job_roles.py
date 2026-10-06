"""the usual school jobs (Librarian, Vice Principal…) as roles every school starts with

Revision ID: starter_job_roles
Revises: admission_form_boards
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text
from sqlalchemy.orm import Session

revision: str = "starter_job_roles"
down_revision: Union[str, None] = "admission_form_boards"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Data only: each existing school gets the starter roles it does not
    # already have (by code). New schools get them when their roles are first made.
    from app.services import rbac_service

    db = Session(bind=op.get_bind())
    schools = db.execute(text("select id, tenant_id from schools")).all()
    for school_id, tenant_id in schools:
        has_roles = db.execute(text("select 1 from roles where school_id = :s limit 1"), {"s": school_id}).first()
        if has_roles:
            rbac_service.seed_starter_roles(db, tenant_id, school_id)
    db.flush()


def downgrade() -> None:
    from app.core.permissions import STARTER_ROLES

    op.get_bind().execute(
        text("delete from roles where is_system = false and code = any(:codes) "
             "and id not in (select role_id from user_role_assignments)"),
        {"codes": list(STARTER_ROLES)},
    )
