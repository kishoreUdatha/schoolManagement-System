import secrets
import string
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import ParentRelation, UserRole
from app.core.security import hash_password
from app.models.academic import SchoolClass, Section
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.user import User
from app.schemas.parent import (
    LinkChildRequest,
    ParentCreate,
    ParentUpdate,
)


def _generate_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _get_student(db: Session, student_id: int, school_id: int) -> Student:
    s = db.get(Student, student_id)
    if not s or s.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )
    return s


def _get_parent(db: Session, user_id: int, tenant_id: int, school_id: int) -> User:
    u = db.get(User, user_id)
    if (
        not u
        or u.role != UserRole.parent
        or u.tenant_id != tenant_id
        or u.school_id != school_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Parent not found"
        )
    return u


def _section_label(db: Session, section_id: int) -> Optional[str]:
    sec = db.get(Section, section_id)
    if not sec:
        return None
    cls = db.get(SchoolClass, sec.class_id)
    if not cls:
        return sec.name
    return f"{cls.name} {sec.name}"


def _children_for_parent(
    db: Session, parent_user_id: int
) -> list[dict]:
    rows = db.execute(
        select(ParentStudent, Student)
        .join(Student, ParentStudent.student_id == Student.id)
        .where(ParentStudent.parent_user_id == parent_user_id)
        .order_by(Student.full_name)
    ).all()
    out = []
    for link, student in rows:
        out.append(
            {
                "student_id": student.id,
                "full_name": student.full_name,
                "admission_no": student.admission_no,
                "section_id": student.section_id,
                "section_label": _section_label(db, student.section_id),
                "relation": link.relation,
            }
        )
    return out


def parent_to_read_dict(db: Session, u: User) -> dict:
    return {
        "user_id": u.id,
        "full_name": u.full_name,
        "email": u.email,
        "phone": u.phone,
        "is_active": u.is_active,
        "last_login_at": u.last_login_at,
        "children": _children_for_parent(db, u.id),
    }


def create_parent(
    db: Session, tenant_id: int, school_id: int, data: ParentCreate
) -> tuple[User, str]:
    student = _get_student(db, data.student_id, school_id)

    # Reject if email already used in this tenant — guide them to "link existing"
    existing = db.execute(
        select(User).where(
            User.tenant_id == tenant_id, User.email == data.email.strip()
        )
    ).scalar_one_or_none()
    if existing:
        if existing.role == UserRole.parent:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"A parent account with email '{data.email}' already exists "
                    f"(user_id={existing.id}). Use 'Link existing parent' to add this "
                    f"student to that parent."
                ),
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Email '{data.email}' is already used by another account "
                f"(role={existing.role.value}). Use a different email."
            ),
        )

    raw_password = _generate_password()
    user = User(
        tenant_id=tenant_id,
        school_id=school_id,
        full_name=data.full_name.strip(),
        email=data.email.strip(),
        phone=data.phone.strip() if data.phone else None,
        password_hash=hash_password(raw_password),
        role=UserRole.parent,
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

    link = ParentStudent(
        tenant_id=tenant_id,
        school_id=school_id,
        parent_user_id=user.id,
        student_id=student.id,
        relation=data.relation,
    )
    db.add(link)
    db.commit()
    db.refresh(user)
    return user, raw_password


def list_parents(
    db: Session,
    school_id: int,
    *,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
) -> list[User]:
    stmt = (
        select(User)
        .where(User.school_id == school_id, User.role == UserRole.parent)
        .order_by(User.full_name)
    )
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
                User.phone.ilike(like),
            )
        )
    return list(db.execute(stmt).scalars().all())


def get_parent(db: Session, user_id: int, tenant_id: int, school_id: int) -> User:
    return _get_parent(db, user_id, tenant_id, school_id)


def update_parent(
    db: Session,
    user_id: int,
    tenant_id: int,
    school_id: int,
    data: ParentUpdate,
) -> User:
    u = _get_parent(db, user_id, tenant_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    if "full_name" in updates:
        u.full_name = updates["full_name"].strip()
    if "phone" in updates:
        v = updates["phone"]
        u.phone = v.strip() if v else None
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Phone already in use for this tenant",
        )
    db.refresh(u)
    return u


def link_child(
    db: Session,
    user_id: int,
    tenant_id: int,
    school_id: int,
    data: LinkChildRequest,
) -> ParentStudent:
    parent = _get_parent(db, user_id, tenant_id, school_id)
    student = _get_student(db, data.student_id, school_id)

    existing = db.execute(
        select(ParentStudent).where(
            ParentStudent.parent_user_id == parent.id,
            ParentStudent.student_id == student.id,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{parent.full_name} is already linked to {student.full_name}",
        )

    link = ParentStudent(
        tenant_id=tenant_id,
        school_id=school_id,
        parent_user_id=parent.id,
        student_id=student.id,
        relation=data.relation,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def unlink_child(
    db: Session,
    user_id: int,
    tenant_id: int,
    school_id: int,
    student_id: int,
) -> None:
    parent = _get_parent(db, user_id, tenant_id, school_id)
    link = db.execute(
        select(ParentStudent).where(
            ParentStudent.parent_user_id == parent.id,
            ParentStudent.student_id == student_id,
        )
    ).scalar_one_or_none()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Link not found"
        )
    db.delete(link)
    db.commit()


def set_active(
    db: Session,
    user_id: int,
    tenant_id: int,
    school_id: int,
    *,
    active: bool,
) -> User:
    u = _get_parent(db, user_id, tenant_id, school_id)
    u.is_active = active
    db.commit()
    db.refresh(u)
    return u


def reset_password(
    db: Session, user_id: int, tenant_id: int, school_id: int
) -> tuple[User, str]:
    u = _get_parent(db, user_id, tenant_id, school_id)
    raw = _generate_password()
    u.password_hash = hash_password(raw)
    db.commit()
    db.refresh(u)
    return u, raw


# --- Parent portal helpers ---

def list_children_for_parent_portal(
    db: Session, parent_user_id: int
) -> list[dict]:
    rows = db.execute(
        select(ParentStudent, Student)
        .join(Student, ParentStudent.student_id == Student.id)
        .where(ParentStudent.parent_user_id == parent_user_id)
        .order_by(Student.full_name)
    ).all()
    from app.services import fee_service, student_profile_service  # local to avoid cycle
    out = []
    for link, student in rows:
        att = student_profile_service._attendance_summary(db, student.id)
        out.append(
            {
                "id": student.id,
                "full_name": student.full_name,
                "admission_no": student.admission_no,
                "roll_no": student.roll_no,
                "section_id": student.section_id,
                "section_label": _section_label(db, student.section_id),
                "photo_url": student.photo_url,
                "is_active": student.is_active,
                "attendance_percent": att["attendance_percent"],
                "fees_pending_amount": float(
                    fee_service.child_pending_total(db, student.id)
                ),
                "relation": link.relation,
            }
        )
    return out


def get_child_for_parent(
    db: Session, parent_user_id: int, student_id: int
) -> dict:
    """Returns child detail ONLY if parent is linked to that student. 404 otherwise."""
    row = db.execute(
        select(ParentStudent, Student)
        .join(Student, ParentStudent.student_id == Student.id)
        .where(
            ParentStudent.parent_user_id == parent_user_id,
            ParentStudent.student_id == student_id,
        )
    ).one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child not found or not linked to this parent",
        )
    link, student = row
    from app.services import fee_service, student_profile_service  # local to avoid cycle
    att = student_profile_service._attendance_summary(db, student.id)
    return {
        "id": student.id,
        "full_name": student.full_name,
        "admission_no": student.admission_no,
        "roll_no": student.roll_no,
        "section_id": student.section_id,
        "section_label": _section_label(db, student.section_id),
        "photo_url": student.photo_url,
        "is_active": student.is_active,
        "attendance_percent": att["attendance_percent"],
        "fees_pending_amount": float(fee_service.child_pending_total(db, student.id)),
        "relation": link.relation,
    }
