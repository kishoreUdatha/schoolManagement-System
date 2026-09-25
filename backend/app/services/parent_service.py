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
from app.models.foundation import Guardian, StudentGuardian
from app.models.parent import ParentNote, ParentStudent
from app.models.student import Student
from app.models.user import User
from app.schemas.parent import (
    LinkChildRequest,
    ParentCreate,
    ParentNoteIn,
    ParentUpdate,
)
from app.services import foundation_service


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


def _guardian_of(db: Session, parent_user_id: int) -> Optional[Guardian]:
    """The family contact that mirrors this parent login, if there is one."""
    return db.execute(
        select(Guardian).where(Guardian.user_id == parent_user_id)
    ).scalar_one_or_none()


def _primary_for(db: Session, parent_user_id: int) -> set[int]:
    """Student ids this parent is the primary contact for."""
    g = _guardian_of(db, parent_user_id)
    if not g:
        return set()
    return set(
        db.execute(
            select(StudentGuardian.student_id).where(
                StudentGuardian.guardian_id == g.id,
                StudentGuardian.is_primary.is_(True),
            )
        ).scalars()
    )


def _make_primary(db: Session, parent_user_id: int, student_ids: list[int]) -> None:
    """Make this parent the primary contact for these children. Flush only."""
    parent = db.get(User, parent_user_id)
    # Older links may predate the guardian mirror; fill it in first (idempotent).
    for link, student in db.execute(
        select(ParentStudent, Student)
        .join(Student, ParentStudent.student_id == Student.id)
        .where(ParentStudent.parent_user_id == parent_user_id, ParentStudent.student_id.in_(student_ids or [-1]))
    ).all():
        foundation_service.on_parent_linked(db, parent, student, link.relation)
    g = _guardian_of(db, parent_user_id)
    if not g:
        return
    for sid in student_ids:
        link = db.execute(
            select(StudentGuardian).where(
                StudentGuardian.student_id == sid, StudentGuardian.guardian_id == g.id
            )
        ).scalar_one_or_none()
        if link:
            foundation_service._set_primary(db, sid, link)
    db.flush()


def _set_contact_details(db: Session, u: User, updates: dict) -> None:
    """Occupation and address live on the guardian record. Flush only."""
    if "occupation" not in updates and "address" not in updates:
        return
    g = _guardian_of(db, u.id)
    if g is None:
        g = Guardian(tenant_id=u.tenant_id, school_id=u.school_id, full_name=u.full_name,
                     phone=u.phone, email=u.email, user_id=u.id)
        db.add(g)
    for k in ("occupation", "address"):
        if k in updates:
            v = updates[k]
            setattr(g, k, (v.strip() or None) if isinstance(v, str) else None)
    db.flush()


def _children_for_parent(
    db: Session, parent_user_id: int
) -> list[dict]:
    rows = db.execute(
        select(ParentStudent, Student)
        .join(Student, ParentStudent.student_id == Student.id)
        .where(ParentStudent.parent_user_id == parent_user_id)
        .order_by(Student.full_name)
    ).all()
    primary = _primary_for(db, parent_user_id)
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
                "is_primary_contact": student.id in primary,
            }
        )
    return out


def parent_to_read_dict(db: Session, u: User) -> dict:
    g = _guardian_of(db, u.id)
    return {
        "user_id": u.id,
        "full_name": u.full_name,
        "email": u.email,
        "phone": u.phone,
        "is_active": u.is_active,
        "last_login_at": u.last_login_at,
        "occupation": g.occupation if g else None,
        "address": g.address if g else None,
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
        # The office read this password off the screen: the parent replaces it at first sign-in.
        must_change_password=True,
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
    foundation_service.on_parent_linked(db, user, student, data.relation)
    _set_contact_details(db, user, data.model_dump(include={"occupation", "address"}, exclude_unset=True))
    if data.primary_contact:
        _make_primary(db, user.id, [student.id])
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
    _set_contact_details(db, u, updates)
    if updates.get("primary_contact"):
        kids = list(db.execute(
            select(ParentStudent.student_id).where(ParentStudent.parent_user_id == u.id)
        ).scalars())
        _make_primary(db, u.id, kids)
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
    foundation_service.on_parent_linked(db, parent, student, data.relation)
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
    foundation_service.on_parent_unlinked(db, parent.id, student_id)
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
    u.must_change_password = True
    db.commit()
    db.refresh(u)
    return u, raw


# --- School-side notes on a parent ---

def _note_to_read(db: Session, n: ParentNote) -> dict:
    who = db.get(User, n.created_by_user_id) if n.created_by_user_id else None
    return {
        "id": n.id,
        "parent_user_id": n.parent_user_id,
        "body": n.body,
        "created_by_user_id": n.created_by_user_id,
        "created_by_name": who.full_name if who else None,
        "created_at": n.created_at,
    }


def list_notes(db: Session, user_id: int, tenant_id: int, school_id: int) -> list[dict]:
    p = _get_parent(db, user_id, tenant_id, school_id)
    rows = db.execute(
        select(ParentNote)
        .where(ParentNote.parent_user_id == p.id, ParentNote.school_id == school_id)
        .order_by(ParentNote.created_at.desc(), ParentNote.id.desc())
    ).scalars()
    return [_note_to_read(db, n) for n in rows]


def add_note(db: Session, user_id: int, actor: User, data: ParentNoteIn) -> dict:
    p = _get_parent(db, user_id, actor.tenant_id, actor.school_id)
    body = data.body.strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Write the note first")
    n = ParentNote(tenant_id=p.tenant_id, school_id=p.school_id, parent_user_id=p.id,
                   body=body, created_by_user_id=actor.id)
    db.add(n)
    db.commit()
    db.refresh(n)
    return _note_to_read(db, n)


def delete_note(db: Session, user_id: int, note_id: int, actor: User) -> None:
    p = _get_parent(db, user_id, actor.tenant_id, actor.school_id)
    n = db.get(ParentNote, note_id)
    if not n or n.parent_user_id != p.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    db.delete(n)
    db.commit()


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
