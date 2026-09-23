"""A member of staff reading and keeping up their own record.

What the office decides (name, employee number, role, department, salary)
is read-only here; what only they can answer (where they live, who to call in
an emergency, which account their pay goes to) is theirs to change. Every
change lands in the audit log like any other, because Staff is audited.
"""
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.staff import Staff
from app.models.user import User
from app.schemas.self_profile import MyProfileUpdate


def my_staff_row(db: Session, user: User) -> Staff:
    s = db.execute(select(Staff).where(Staff.user_id == user.id)).scalar_one_or_none()
    if not s:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You do not have a staff record. Ask the office to add one.",
        )
    return s


def _manager_name(db: Session, staff: Staff) -> Optional[str]:
    if not staff.reporting_manager_id:
        return None
    m = db.get(Staff, staff.reporting_manager_id)
    return m.user.full_name if m and m.user else None


def to_read(db: Session, staff: Staff) -> dict:
    u = staff.user
    return {
        "staff_id": staff.id,
        "user_id": staff.user_id,
        "full_name": u.full_name,
        "email": u.email,
        "employee_no": staff.employee_no,
        "role": u.role.value,
        "designation": staff.designation,
        "department_name": staff.department.name if staff.department_id and staff.department else None,
        "joining_date": staff.joining_date,
        "employment_type": staff.employment_type.value if staff.employment_type else None,
        "reporting_manager_name": _manager_name(db, staff),
        "phone": u.phone,
        "address": staff.address,
        "emergency_contact_name": staff.emergency_contact_name,
        "emergency_contact_phone": staff.emergency_contact_phone,
        "emergency_contact_relation": staff.emergency_contact_relation,
        "qualification_summary": staff.qualification_summary,
        "experience_years": staff.experience_years,
        "bank_name": staff.bank_name,
        "bank_account_no": staff.bank_account_no,
        "bank_ifsc": staff.bank_ifsc,
        "pan": staff.pan,
        "uan": staff.uan,
    }


# phone lives on the login; the rest on the staff record
_STAFF_FIELDS = (
    "address", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
    "qualification_summary", "experience_years",
    "bank_name", "bank_account_no", "bank_ifsc", "pan", "uan",
)


def update_mine(db: Session, user: User, data: MyProfileUpdate) -> Staff:
    staff = my_staff_row(db, user)
    given = data.model_dump(exclude_unset=True)
    if "phone" in given:
        phone = (given.pop("phone") or "").strip()
        user.phone = phone or None
    for field in _STAFF_FIELDS:
        if field in given:
            value = given[field]
            if isinstance(value, str):
                value = value.strip() or None
            setattr(staff, field, value)
    db.commit()
    db.refresh(staff)
    return staff
