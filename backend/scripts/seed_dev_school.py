"""Seed (or reset) a known dev tenant + school + school_admin user.

Use this for local development so you have a stable school admin login
without copying temporary passwords out of tenant-creation responses.

Run:
    docker exec sms-backend python -m scripts.seed_dev_school

Creates / resets:
    Tenant code: DEVSCHOOL
    School:      Dev Demo School
    Login:       school@sms.local / SchoolPass123!
"""
from __future__ import annotations

import sys

from sqlalchemy import select

from app.core.enums import SchoolStatus, TenantStatus, UserRole
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.tenant import School, Tenant
from app.models.user import User


TENANT_CODE = "DEVSCHOOL"
SCHOOL_NAME = "Dev Demo School"
ADMIN_EMAIL = "school@sms.local"
ADMIN_PASSWORD = "SchoolPass123!"
ADMIN_NAME = "Dev School Admin"


def main() -> int:
    db = SessionLocal()
    try:
        tenant = db.execute(
            select(Tenant).where(Tenant.code == TENANT_CODE)
        ).scalar_one_or_none()

        if not tenant:
            tenant = Tenant(
                name=SCHOOL_NAME,
                code=TENANT_CODE,
                contact_email="contact@devschool.local",
                contact_mobile="+910000000000",
                contact_person="Dev Contact",
                status=TenantStatus.active,
                is_active=True,
            )
            db.add(tenant)
            db.flush()
            print(f"Created tenant id={tenant.id} code={tenant.code}")
        else:
            tenant.status = TenantStatus.active
            tenant.is_active = True
            print(f"Found existing tenant id={tenant.id} code={tenant.code} (reactivated)")

        school = db.execute(
            select(School).where(School.tenant_id == tenant.id)
        ).scalar_one_or_none()

        if not school:
            school = School(
                tenant_id=tenant.id,
                name=SCHOOL_NAME,
                code=TENANT_CODE,
                status=SchoolStatus.active,
                is_active=True,
            )
            db.add(school)
            db.flush()
            print(f"Created school id={school.id}")
        else:
            print(f"Found existing school id={school.id}")

        admin = db.execute(
            select(User).where(
                User.email == ADMIN_EMAIL, User.role == UserRole.school_admin
            )
        ).scalar_one_or_none()

        if not admin:
            admin = User(
                tenant_id=tenant.id,
                school_id=school.id,
                full_name=ADMIN_NAME,
                email=ADMIN_EMAIL,
                password_hash=hash_password(ADMIN_PASSWORD),
                role=UserRole.school_admin,
                is_active=True,
            )
            db.add(admin)
            db.flush()
            print(f"Created school admin id={admin.id}")
        else:
            admin.tenant_id = tenant.id
            admin.school_id = school.id
            admin.full_name = ADMIN_NAME
            admin.password_hash = hash_password(ADMIN_PASSWORD)
            admin.is_active = True
            print(f"Reset existing school admin id={admin.id}")

        db.commit()
        print()
        print("Dev login:")
        print(f"  URL:      http://127.0.0.1:3000/school/login")
        print(f"  Email:    {ADMIN_EMAIL}")
        print(f"  Password: {ADMIN_PASSWORD}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
