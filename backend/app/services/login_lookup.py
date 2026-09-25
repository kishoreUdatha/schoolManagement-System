"""Find the account a sign-in is for.

Emails are unique within a tenant, not across tenants: a parent with children
at two BrightCampus schools, or a teacher who works at both, has one account
in each. The sign-in form only has email and password, so the account is the
one whose password matches (the most recently used one if several do).
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import UserRole
from app.core.security import verify_password
from app.models.user import User


def find_login_user(db: Session, email: str, role: UserRole, password: str) -> Optional[User]:
    candidates = db.execute(
        select(User)
        .where(User.email == email, User.role == role, User.is_active.is_(True))
        .order_by(User.last_login_at.desc().nullslast(), User.id.desc())
    ).scalars().all()
    for user in candidates:
        if user.password_hash and verify_password(password, user.password_hash):
            return user
    return None
