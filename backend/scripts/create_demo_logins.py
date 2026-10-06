"""Demo logins for the roles a dev school has no one in yet: an accountant,
a non-teaching staff member and a student.

Creates them in one school (or, run again, gives them fresh passwords) and
prints a markdown table of how to sign in. The passwords appear only in that
output; send it to a file that git ignores rather than to the terminal:

    docker exec sms-backend python -m scripts.create_demo_logins 83 > dev-logins.local.md

Arguments: school id (default 83), and the admission number of the student
to give a login (default: the first active student without one).
"""
from __future__ import annotations

import logging
import secrets
import string
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import UserRole
from app.core.security import hash_password
from app.database import SessionLocal
from app.models.tenant import School
from app.models.student import Student
from app.models.user import User
from app.schemas.staff import StaffCreate
from app.services import staff_service, student_portal_service

STAFF = [
    # email, name, login, designation
    ("accountant.demo@example.com", "Demo Accountant", "accountant", "Accountant"),
    ("staff.demo@example.com", "Demo Office Staff", "staff", "Office Assistant"),
]


def _password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "Demo-" + "".join(secrets.choice(alphabet) for _ in range(10)) + "!"


def _set(db: Session, user: User, password: str) -> None:
    # a demo login keeps its password: no forced change at first sign-in
    user.password_hash = hash_password(password)
    user.must_change_password = False
    user.is_active = True


def main() -> int:
    logging.disable(logging.WARNING)
    school_id = int(sys.argv[1]) if len(sys.argv) > 1 else 83
    admission_no = sys.argv[2] if len(sys.argv) > 2 else None
    db = SessionLocal()
    try:
        school = db.get(School, school_id)
        if school is None:
            print(f"No school {school_id}", file=sys.stderr)
            return 1
        rows = []
        for email, name, role, designation in STAFF:
            user = db.execute(select(User).where(User.email == email)).scalars().first()
            if user is None:
                staff, _ = staff_service.create_staff(
                    db, school.tenant_id, school.id,
                    StaffCreate(full_name=name, email=email, role=role, designation=designation),
                )
                user = db.get(User, staff.user_id)
            password = _password()
            _set(db, user, password)
            db.commit()
            rows.append((role, f"`{email}`", f"`{password}`", f"{name} · {designation}"))

        q = select(Student).where(Student.school_id == school.id, Student.is_active.is_(True))
        if admission_no:
            q = q.where(Student.admission_no == admission_no)
        else:
            q = q.where(Student.user_id.is_(None))
        student = db.execute(q.order_by(Student.admission_no)).scalars().first()
        if student is None:
            print("No student to give a login", file=sys.stderr)
            return 1
        r = student_portal_service.create_login(db, school.id, student.id)
        user = db.get(User, r["user_id"])
        password = _password()
        _set(db, user, password)
        db.commit()
        rows.append(("student", f"school code `{school.code}` + admission no `{student.admission_no}`",
                     f"`{password}`", student.full_name))

        print(f"# Demo logins: {school.name} (school {school.id})\n")
        print("Local dev only; this file is git-ignored. Re-run the script for fresh passwords.\n")
        print("| Role | Sign in with | Password | Who |")
        print("|---|---|---|---|")
        for role, login, pw, who in rows:
            print(f"| {role} | {login} | {pw} | {who} |")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
