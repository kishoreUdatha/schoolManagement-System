"""Roles, permissions and branches.

The permission catalogue is seeded from app.core.permissions. Each school gets
system roles mirroring the built-in ones the first time it opens the screen;
after that the school can add its own roles and assign them to people."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import UserRole
from app.core.permissions import CATALOGUE, SYSTEM_ROLE_PERMISSIONS
from app.models.academic import Section
from app.models.rbac import Branch, Permission, Role, RolePermission, UserRoleAssignment
from app.models.staff import Staff
from app.models.student import Student
from app.models.user import User
from app.schemas.rbac import BranchIn, RoleIn


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


# ---------- catalogue ----------


def sync_catalogue(db: Session) -> int:
    """Make the permissions table match the code catalogue."""
    have = {p.code: p for p in db.execute(select(Permission)).scalars()}
    added = 0
    for code, (module, name, description) in CATALOGUE.items():
        p = have.get(code)
        if p:
            p.module, p.name, p.description = module, name, description
        else:
            db.add(Permission(code=code, module=module, name=name, description=description))
            added += 1
    db.commit()
    return added


def list_permissions(db: Session) -> list[Permission]:
    if db.execute(select(func.count()).select_from(Permission)).scalar_one() < len(CATALOGUE):
        sync_catalogue(db)
    return list(db.execute(select(Permission).order_by(Permission.module, Permission.name)).scalars())


# ---------- roles ----------


def ensure_system_roles(db: Session, tenant_id: int, school_id: int) -> None:
    """Create the built-in roles for a school the first time they're needed."""
    sync_catalogue(db)
    perms = {p.code: p for p in db.execute(select(Permission)).scalars()}
    existing = {r.code for r in db.execute(select(Role).where(Role.school_id == school_id)).scalars()}
    for base in UserRole:
        if base in (UserRole.super_admin,):
            continue
        code = base.value
        if code in existing:
            continue
        role = Role(tenant_id=tenant_id, school_id=school_id, name=base.value.replace("_", " ").title(),
                    code=code, base_role=base, is_system=True,
                    description="Built-in role")
        db.add(role)
        db.flush()
        codes = list(CATALOGUE) if base == UserRole.school_admin else SYSTEM_ROLE_PERMISSIONS.get(code, [])
        for c in codes:
            if c in perms:
                db.add(RolePermission(tenant_id=tenant_id, school_id=school_id, role_id=role.id,
                                      permission_id=perms[c].id))
    db.commit()


def get_role(db: Session, role_id: int, school_id: int) -> Role:
    r = db.get(Role, role_id)
    if not r or r.school_id != school_id:
        raise _404("Role")
    return r


def list_roles(db: Session, tenant_id: int, school_id: int) -> list[Role]:
    ensure_system_roles(db, tenant_id, school_id)
    return list(db.execute(
        select(Role).where(Role.school_id == school_id).order_by(Role.is_system.desc(), Role.name)
    ).scalars())


def _set_permissions(db: Session, role: Role, codes: list[str]) -> None:
    perms = {p.code: p for p in db.execute(select(Permission).where(Permission.code.in_(codes or [""]))).scalars()}
    unknown = set(codes) - set(perms)
    if unknown:
        raise _400(f"Unknown permission(s): {', '.join(sorted(unknown))}")
    role.permissions.clear()
    db.flush()
    for c in codes:
        role.permissions.append(RolePermission(tenant_id=role.tenant_id, school_id=role.school_id,
                                               permission_id=perms[c].id))


def _code_taken(db: Session, school_id: int, code: str, except_id: Optional[int] = None) -> bool:
    stmt = select(Role.id).where(Role.school_id == school_id, Role.code == code.lower())
    if except_id:
        stmt = stmt.where(Role.id != except_id)
    return db.execute(stmt.limit(1)).first() is not None


def create_role(db: Session, user: User, data: RoleIn) -> Role:
    if data.base_role == UserRole.super_admin:
        raise _400("A school role can't be a super admin")
    if _code_taken(db, user.school_id, data.code):
        raise _400("A role with that code already exists")
    r = Role(tenant_id=user.tenant_id, school_id=user.school_id, name=data.name, code=data.code.lower(),
             description=data.description, base_role=data.base_role, is_active=data.is_active)
    db.add(r)
    db.flush()
    _set_permissions(db, r, data.permissions)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _400("A role with that code already exists")
    db.refresh(r)
    return r


def update_role(db: Session, user: User, role_id: int, data: RoleIn) -> Role:
    r = get_role(db, role_id, user.school_id)
    if r.is_system:
        # the built-ins keep their code and portal; only their permissions move
        _set_permissions(db, r, data.permissions)
        r.description = data.description
    else:
        if data.base_role == UserRole.super_admin:
            raise _400("A school role can't be a super admin")
        if _code_taken(db, user.school_id, data.code, except_id=r.id):
            raise _400("A role with that code already exists")
        r.name, r.code, r.description = data.name, data.code.lower(), data.description
        r.base_role, r.is_active = data.base_role, data.is_active
        _set_permissions(db, r, data.permissions)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _400("A role with that code already exists")
    db.refresh(r)
    return r


def delete_role(db: Session, user: User, role_id: int) -> None:
    r = get_role(db, role_id, user.school_id)
    if r.is_system:
        raise _400("Built-in roles can't be deleted")
    if db.execute(select(UserRoleAssignment.id).where(UserRoleAssignment.role_id == r.id).limit(1)).first():
        raise _400("People still have this role; take it away from them first")
    db.delete(r)
    db.commit()


def role_to_read(db: Session, r: Role) -> dict:
    codes = list(db.execute(
        select(Permission.code).join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == r.id)
    ).scalars())
    n = db.execute(
        select(func.count()).select_from(UserRoleAssignment).where(UserRoleAssignment.role_id == r.id)
    ).scalar_one()
    return dict(id=r.id, name=r.name, code=r.code, description=r.description, base_role=r.base_role,
                is_system=r.is_system, is_active=r.is_active, permissions=sorted(codes), users=n)


# ---------- assignments ----------


def assign(db: Session, user: User, target_user_id: int, role_id: int, branch_id: Optional[int]) -> UserRoleAssignment:
    target = db.get(User, target_user_id)
    if not target or target.school_id != user.school_id:
        raise _400("Unknown user")
    role = get_role(db, role_id, user.school_id)
    if not role.is_active:
        raise _400("That role is switched off")
    if branch_id is not None:
        get_branch(db, branch_id, user.school_id)
    existing = db.execute(
        select(UserRoleAssignment).where(UserRoleAssignment.user_id == target.id, UserRoleAssignment.role_id == role.id)
    ).scalar_one_or_none()
    if existing:
        raise _400(f"{target.full_name} already has the {role.name} role")
    a = UserRoleAssignment(tenant_id=user.tenant_id, school_id=user.school_id, user_id=target.id, role_id=role.id,
                           branch_id=branch_id, assigned_by_user_id=user.id, assigned_at=datetime.now(timezone.utc))
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def unassign(db: Session, user: User, assignment_id: int) -> None:
    a = db.get(UserRoleAssignment, assignment_id)
    if not a or a.school_id != user.school_id:
        raise _404("Assignment")
    db.delete(a)
    db.commit()


def assignments(db: Session, school_id: int, user_id: Optional[int], role_id: Optional[int]) -> list[dict]:
    stmt = select(UserRoleAssignment).where(UserRoleAssignment.school_id == school_id)
    if user_id:
        stmt = stmt.where(UserRoleAssignment.user_id == user_id)
    if role_id:
        stmt = stmt.where(UserRoleAssignment.role_id == role_id)
    rows = list(db.execute(stmt.order_by(UserRoleAssignment.id.desc())).scalars())
    users = dict(db.execute(
        select(User.id, User.full_name).where(User.id.in_({a.user_id for a in rows} or {-1}))
    ).all())
    roles = {r.id: r for r in db.execute(select(Role).where(Role.id.in_({a.role_id for a in rows} or {-1}))).scalars()}
    branches = dict(db.execute(
        select(Branch.id, Branch.name).where(Branch.id.in_({a.branch_id for a in rows if a.branch_id} or {-1}))
    ).all())
    return [
        dict(id=a.id, user_id=a.user_id, user_name=users.get(a.user_id, ""), role_id=a.role_id,
             role_name=roles[a.role_id].name if a.role_id in roles else "", branch_id=a.branch_id,
             branch_name=branches.get(a.branch_id), assigned_at=a.assigned_at)
        for a in rows
    ]


def permissions_for(db: Session, user: User) -> set[str]:
    """Everything this user may do: their base role's built-in set plus any
    custom roles they've been given. School admins get everything."""
    if user.role == UserRole.school_admin:
        return set(CATALOGUE)
    codes = set(SYSTEM_ROLE_PERMISSIONS.get(user.role.value, []))
    extra = db.execute(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(UserRoleAssignment, UserRoleAssignment.role_id == Role.id)
        .where(UserRoleAssignment.user_id == user.id, Role.is_active.is_(True))
    ).scalars()
    return codes | set(extra)


def has_permission(db: Session, user: User, code: str) -> bool:
    return code in permissions_for(db, user)


def my_access(db: Session, user: User) -> dict:
    roles = list(db.execute(
        select(Role).join(UserRoleAssignment, UserRoleAssignment.role_id == Role.id)
        .where(UserRoleAssignment.user_id == user.id)
    ).scalars())
    return dict(base_role=user.role, roles=[r.name for r in roles], permissions=sorted(permissions_for(db, user)))


# ---------- branches ----------


def get_branch(db: Session, branch_id: int, school_id: int) -> Branch:
    b = db.get(Branch, branch_id)
    if not b or b.school_id != school_id:
        raise _404("Branch")
    return b


def list_branches(db: Session, school_id: int) -> list[Branch]:
    return list(db.execute(
        select(Branch).where(Branch.school_id == school_id).order_by(Branch.is_main.desc(), Branch.name)
    ).scalars())


def _check_head(db: Session, school_id: int, head_user_id: Optional[int]) -> None:
    if head_user_id is None:
        return
    u = db.get(User, head_user_id)
    if not u or u.school_id != school_id or u.role in (UserRole.parent, UserRole.student):
        raise _400("Pick a staff member to head the branch")


def _branch_code_taken(db: Session, school_id: int, code: str, except_id: Optional[int] = None) -> bool:
    stmt = select(Branch.id).where(Branch.school_id == school_id, func.lower(Branch.code) == code.strip().lower())
    if except_id:
        stmt = stmt.where(Branch.id != except_id)
    return db.execute(stmt.limit(1)).first() is not None


def create_branch(db: Session, user: User, data: BranchIn) -> Branch:
    _check_head(db, user.school_id, data.head_user_id)
    if _branch_code_taken(db, user.school_id, data.code):
        raise _400("A branch with that code already exists")
    b = Branch(tenant_id=user.tenant_id, school_id=user.school_id, **data.model_dump())
    if data.is_main:
        _clear_main(db, user.school_id, None)
    db.add(b)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _400("A branch with that code already exists")
    db.refresh(b)
    return b


def _clear_main(db: Session, school_id: int, keep_id: Optional[int]) -> None:
    for b in db.execute(select(Branch).where(Branch.school_id == school_id, Branch.is_main.is_(True))).scalars():
        if b.id != keep_id:
            b.is_main = False


def update_branch(db: Session, user: User, branch_id: int, data: BranchIn) -> Branch:
    b = get_branch(db, branch_id, user.school_id)
    _check_head(db, user.school_id, data.head_user_id)
    if _branch_code_taken(db, user.school_id, data.code, except_id=b.id):
        raise _400("A branch with that code already exists")
    for k, v in data.model_dump().items():
        setattr(b, k, v)
    if data.is_main:
        _clear_main(db, user.school_id, b.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _400("A branch with that code already exists")
    db.refresh(b)
    return b


def delete_branch(db: Session, user: User, branch_id: int) -> None:
    b = get_branch(db, branch_id, user.school_id)
    used = db.execute(select(Section.id).where(Section.branch_id == b.id).limit(1)).first() or \
        db.execute(select(Staff.id).where(Staff.branch_id == b.id).limit(1)).first()
    if used:
        raise _400("Sections or staff still belong to this branch")
    db.execute(UserRoleAssignment.__table__.update().where(UserRoleAssignment.branch_id == b.id).values(branch_id=None))
    db.delete(b)
    db.commit()


def set_sections(db: Session, user: User, branch_id: int, section_ids: list[int]) -> int:
    b = get_branch(db, branch_id, user.school_id)
    rows = list(db.execute(select(Section).where(Section.id.in_(section_ids or [-1]))).scalars())
    if len(rows) != len(set(section_ids)):
        raise _400("Some sections weren't found")
    if any(s.school_id != user.school_id for s in rows):
        raise _400("Those sections belong to another school")
    db.execute(Section.__table__.update().where(Section.branch_id == b.id).values(branch_id=None))
    for s in rows:
        s.branch_id = b.id
    db.commit()
    return len(rows)


def set_staff(db: Session, user: User, branch_id: int, staff_ids: list[int]) -> int:
    b = get_branch(db, branch_id, user.school_id)
    rows = list(db.execute(select(Staff).where(Staff.id.in_(staff_ids or [-1]))).scalars())
    if len(rows) != len(set(staff_ids)) or any(s.school_id != user.school_id for s in rows):
        raise _400("Some staff weren't found")
    db.execute(Staff.__table__.update().where(Staff.branch_id == b.id).values(branch_id=None))
    for s in rows:
        s.branch_id = b.id
    db.commit()
    return len(rows)


def branch_to_read(db: Session, b: Branch) -> dict:
    sections = list(db.execute(select(Section.id).where(Section.branch_id == b.id)).scalars())
    staff_n = db.execute(select(func.count()).select_from(Staff).where(Staff.branch_id == b.id)).scalar_one()
    students = db.execute(
        select(func.count()).select_from(Student)
        .where(Student.section_id.in_(sections or [-1]), Student.is_active.is_(True))
    ).scalar_one()
    head = db.get(User, b.head_user_id) if b.head_user_id else None
    return dict(id=b.id, name=b.name, code=b.code, address=b.address, phone=b.phone,
                head_user_id=b.head_user_id, head_name=head.full_name if head else None,
                is_main=b.is_main, is_active=b.is_active, sections=len(sections), staff=staff_n, students=students,
                section_ids=sections)
