import secrets
import string
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import SubscriptionStatus, UserRole
from app.core.security import hash_password
from app.models.plan import Plan
from app.models.staff import Staff
from app.models.subscription import TenantSubscription
from app.models.user import User
from app.schemas.staff import StaffCreate, StaffUpdate
from app.services import foundation_service


def _generate_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _check_staff_quota(db: Session, tenant_id: int) -> None:
    sub = db.execute(
        select(TenantSubscription)
        .where(
            TenantSubscription.tenant_id == tenant_id,
            TenantSubscription.status == SubscriptionStatus.active,
        )
        .order_by(TenantSubscription.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if not sub:
        # No subscription = no quota check; super admin should assign a plan
        return
    plan = db.get(Plan, sub.plan_id)
    if not plan or plan.staff_limit == 0:
        return
    current = db.execute(
        select(func.count(User.id)).where(
            User.tenant_id == tenant_id,
            User.role.in_(
                [
                    UserRole.teacher,
                    UserRole.staff,
                    UserRole.principal,
                    UserRole.accountant,
                ]
            ),
            User.is_active.is_(True),
        )
    ).scalar_one()
    if current >= plan.staff_limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Plan limit reached: {plan.staff_limit} staff members. "
                "Upgrade the subscription to add more."
            ),
        )


def _get_staff(db: Session, staff_id: int, school_id: int) -> Staff:
    s = db.get(Staff, staff_id)
    if not s or s.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found"
        )
    return s


_EXTRA_FIELDS = (
    "qualification_summary",
    "experience_years",
    "address",
    "emergency_contact_name",
    "emergency_contact_phone",
    "emergency_contact_relation",
    "employment_type",
    "reporting_manager_id",
    "max_periods_per_week",
    "other_duty_periods",
    "other_duties",
)


def check_reporting_manager(
    db: Session, school_id: int, manager_id: Optional[int], staff_id: Optional[int] = None
) -> None:
    """A manager must be staff at the same school, and not somebody who
    (directly or up the chain) reports to this person."""
    if manager_id is None:
        return
    m = db.get(Staff, manager_id)
    if not m or m.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown reporting manager"
        )
    if staff_id is None:
        return
    seen: set[int] = set()
    cur: Optional[Staff] = m
    while cur is not None and cur.id not in seen:
        if cur.id == staff_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Somebody cannot report to themselves, directly or through others",
            )
        seen.add(cur.id)
        cur = db.get(Staff, cur.reporting_manager_id) if cur.reporting_manager_id else None


def _clean(value):
    return (value.strip() or None) if isinstance(value, str) else value


def extra_to_dict(db: Session, s: Staff) -> dict:
    """The record fields beyond name, role and department, with the
    manager's name resolved."""
    manager = db.get(Staff, s.reporting_manager_id) if s.reporting_manager_id else None
    out = {f: getattr(s, f) for f in _EXTRA_FIELDS}
    out["employment_type"] = s.employment_type.value if s.employment_type else None
    out["reporting_manager_name"] = manager.user.full_name if manager else None
    return out


_STAFF_ROLE_MAP = {
    "teacher": UserRole.teacher,
    "staff": UserRole.staff,
    "principal": UserRole.principal,
    "accountant": UserRole.accountant,
}


def create_staff(
    db: Session, tenant_id: int, school_id: int, data: StaffCreate
) -> tuple[Staff, str]:
    _check_staff_quota(db, tenant_id)

    role = _STAFF_ROLE_MAP.get(data.role, UserRole.staff)
    raw_password = _generate_password()

    user = User(
        tenant_id=tenant_id,
        school_id=school_id,
        full_name=data.full_name.strip(),
        email=data.email.strip(),
        phone=data.phone.strip() if data.phone else None,
        password_hash=hash_password(raw_password),
        role=role,
        is_active=True,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email or phone already exists for this tenant",
        )

    foundation_service.check_department(db, school_id, data.department_id)
    check_reporting_manager(db, school_id, data.reporting_manager_id)
    staff = Staff(
        tenant_id=tenant_id,
        school_id=school_id,
        user_id=user.id,
        employee_no=data.employee_no.strip(),
        designation=data.designation.strip() if data.designation else None,
        joining_date=data.joining_date,
        department_id=data.department_id,
        **{f: _clean(getattr(data, f)) for f in _EXTRA_FIELDS},
    )
    db.add(staff)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Employee number '{data.employee_no}' already exists for this school",
        )

    db.refresh(staff)
    db.refresh(user)
    return staff, raw_password


def list_staff(
    db: Session,
    school_id: int,
    *,
    role: Optional[str] = None,
    designation: Optional[str] = None,
    status_filter: Optional[str] = None,  # "active" | "inactive" | None
    search: Optional[str] = None,
) -> list[Staff]:
    stmt = (
        select(Staff)
        .join(User, Staff.user_id == User.id)
        .where(Staff.school_id == school_id)
    )

    if role in _STAFF_ROLE_MAP:
        stmt = stmt.where(User.role == _STAFF_ROLE_MAP[role])
    if designation:
        stmt = stmt.where(Staff.designation.ilike(f"%{designation}%"))
    if status_filter == "active":
        stmt = stmt.where(User.is_active.is_(True))
    elif status_filter == "inactive":
        stmt = stmt.where(User.is_active.is_(False))
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(
                User.full_name.ilike(like),
                User.email.ilike(like),
                Staff.employee_no.ilike(like),
            )
        )

    stmt = stmt.order_by(User.full_name)
    return list(db.execute(stmt).scalars().all())


def get_staff(db: Session, staff_id: int, school_id: int) -> Staff:
    return _get_staff(db, staff_id, school_id)


def update_staff(
    db: Session, staff_id: int, school_id: int, data: StaffUpdate
) -> Staff:
    staff = _get_staff(db, staff_id, school_id)
    user = staff.user

    updates = data.model_dump(exclude_unset=True)

    if "full_name" in updates:
        user.full_name = updates.pop("full_name").strip()
    if "phone" in updates:
        v = updates.pop("phone")
        user.phone = v.strip() if v else None

    if updates.get("department_id") is not None:
        foundation_service.check_department(db, staff.school_id, updates["department_id"])
    if "reporting_manager_id" in updates:
        check_reporting_manager(db, staff.school_id, updates["reporting_manager_id"], staff.id)
    for field, value in updates.items():
        if field == "designation" and isinstance(value, str):
            value = value.strip()
        if field == "employee_no" and isinstance(value, str):
            value = value.strip()
        if field in _EXTRA_FIELDS:
            value = _clean(value)
        setattr(staff, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Employee number, email, or phone conflicts with another record",
        )
    db.refresh(staff)
    return staff


def set_active(
    db: Session, staff_id: int, school_id: int, *, active: bool
) -> Staff:
    staff = _get_staff(db, staff_id, school_id)
    staff.user.is_active = active
    db.commit()
    db.refresh(staff)
    return staff


def reset_password(db: Session, staff_id: int, school_id: int) -> tuple[Staff, str]:
    staff = _get_staff(db, staff_id, school_id)
    raw = _generate_password()
    staff.user.password_hash = hash_password(raw)
    db.commit()
    db.refresh(staff)
    return staff, raw


def list_teachers_for_assignment(
    db: Session, school_id: int, *, include_inactive: bool = False
) -> list[User]:
    """Used for class teacher + subject teacher dropdowns."""
    stmt = (
        select(User)
        .where(
            User.school_id == school_id,
            User.role == UserRole.teacher,
        )
        .order_by(User.full_name)
    )
    if not include_inactive:
        stmt = stmt.where(User.is_active.is_(True))
    return list(db.execute(stmt).scalars().all())


def validate_teacher_for_school(
    db: Session, user_id: int, school_id: int
) -> None:
    user = db.get(User, user_id)
    if not user or user.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found"
        )
    if user.role != UserRole.teacher:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must have role 'teacher' to be assigned",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Teacher is inactive",
        )


def staff_to_read_dict(s: Staff) -> dict:
    """Flatten Staff + User into the StaffRead shape."""
    from sqlalchemy.orm import object_session

    u = s.user
    return {
        **extra_to_dict(object_session(s), s),
        "id": s.id,
        "user_id": s.user_id,
        "employee_no": s.employee_no,
        "designation": s.designation,
        "joining_date": s.joining_date,
        "department_id": s.department_id,
        "department_name": s.department.name if s.department_id and s.department else None,
        "created_at": s.created_at,
        "full_name": u.full_name,
        "email": u.email,
        "phone": u.phone,
        "role": u.role.value,
        "is_active": u.is_active,
        "last_login_at": u.last_login_at,
    }
