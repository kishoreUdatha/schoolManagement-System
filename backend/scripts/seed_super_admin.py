"""Seed (or update) the first super admin user.

Usage inside the backend container:

    docker exec sms-backend python -m scripts.seed_super_admin \
        --email admin@example.com --password "ChangeMe123!" --name "Platform Admin"

Or via env vars:

    SEED_EMAIL=... SEED_PASSWORD=... SEED_NAME=... \
        docker exec sms-backend python -m scripts.seed_super_admin

If a super admin with the same email already exists, the password and name
are updated and the account is re-activated.
"""
from __future__ import annotations

import argparse
import os
import sys

from sqlalchemy import select

from app.core.enums import UserRole
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.user import User


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the first super admin user")
    parser.add_argument("--email", default=os.environ.get("SEED_EMAIL"))
    parser.add_argument("--password", default=os.environ.get("SEED_PASSWORD"))
    parser.add_argument(
        "--name", default=os.environ.get("SEED_NAME", "Platform Admin")
    )
    args = parser.parse_args()

    if not args.email or not args.password:
        print(
            "ERROR: --email and --password are required "
            "(or set SEED_EMAIL / SEED_PASSWORD env vars).",
            file=sys.stderr,
        )
        return 2

    db = SessionLocal()
    try:
        existing = db.execute(
            select(User).where(
                User.email == args.email, User.role == UserRole.super_admin
            )
        ).scalar_one_or_none()

        if existing:
            existing.password_hash = hash_password(args.password)
            existing.full_name = args.name
            existing.is_active = True
            db.commit()
            db.refresh(existing)
            print(
                f"Updated super admin id={existing.id} email={existing.email} "
                f"(password reset, name set, activated)"
            )
        else:
            user = User(
                tenant_id=None,
                school_id=None,
                full_name=args.name,
                email=args.email,
                password_hash=hash_password(args.password),
                role=UserRole.super_admin,
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Created super admin id={user.id} email={user.email}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
