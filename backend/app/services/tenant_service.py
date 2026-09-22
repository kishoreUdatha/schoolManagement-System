import re
import secrets
import string
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import SchoolStatus, TenantStatus, UserRole
from app.core.security import hash_password
from app.models.subscription import TenantSubscription
from app.models.tenant import School, Tenant
from app.models.user import User
from app.schemas.tenant import TenantCreate, TenantUpdate


_CODE_RE = re.compile(r"[^A-Z0-9]")


def _slugify_code(name: str) -> str:
    base = _CODE_RE.sub("", name.upper())[:8] or "TENANT"
    suffix = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
    return f"{base}-{suffix}"


def _generate_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _ensure_unique_tenant_code(db: Session, name: str, requested: Optional[str]) -> str:
    if requested:
        code = requested.upper()
        if db.execute(select(Tenant).where(Tenant.code == code)).scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Tenant code '{code}' already exists",
            )
        return code
    # auto-generate, retry on collision
    for _ in range(10):
        code = _slugify_code(name)
        if not db.execute(select(Tenant).where(Tenant.code == code)).scalar_one_or_none():
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not generate unique tenant code",
    )


def create_tenant_with_school_admin(db: Session, data: TenantCreate) -> tuple[Tenant, School, User, Optional[str]]:
    """Atomic: create tenant + first school + school_admin user.

    Returns (tenant, school, school_admin_user, temporary_password_or_None).
    """
    code = _ensure_unique_tenant_code(db, data.name, data.code)

    # Check school_admin email isn't already taken globally for this email+role combo
    # (uniqueness is tenant-scoped in DB, but we want to avoid duplicate platform users at same email)
    existing_admin = db.execute(
        select(User).where(
            User.email == data.school_admin_email,
            User.role == UserRole.school_admin,
        )
    ).scalar_one_or_none()
    if existing_admin:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A school admin with email '{data.school_admin_email}' already exists",
        )

    tenant = Tenant(
        name=data.name,
        code=code,
        logo_url=data.logo_url,
        address=data.address,
        contact_person=data.contact_person,
        contact_email=data.contact_email,
        contact_mobile=data.contact_mobile,
        status=TenantStatus.active,
        is_active=True,
    )
    db.add(tenant)
    db.flush()

    school = School(
        tenant_id=tenant.id,
        name=data.name,
        code=code,
        logo_url=data.logo_url,
        address=data.address,
        board=data.board,
        school_type=data.school_type,
        status=SchoolStatus.active,
        is_active=True,
    )
    db.add(school)
    db.flush()

    raw_password = data.school_admin_password or _generate_password()
    user = User(
        tenant_id=tenant.id,
        school_id=school.id,
        full_name=data.school_admin_name,
        email=data.school_admin_email,
        phone=data.school_admin_phone,
        password_hash=hash_password(raw_password),
        role=UserRole.school_admin,
        is_active=True,
        # a generated password is sent by WhatsApp / SMS: they choose their own at first sign-in
        must_change_password=not data.school_admin_password,
    )
    db.add(user)
    db.commit()
    db.refresh(tenant)
    db.refresh(school)
    db.refresh(user)

    temp_password = raw_password if not data.school_admin_password else None
    return tenant, school, user, temp_password


def list_tenants(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    status_filter: Optional[TenantStatus] = None,
) -> tuple[list[Tenant], int]:
    base = select(Tenant)
    count_base = select(func.count(Tenant.id))

    if search:
        like = f"%{search}%"
        cond = or_(Tenant.name.ilike(like), Tenant.code.ilike(like), Tenant.contact_email.ilike(like))
        base = base.where(cond)
        count_base = count_base.where(cond)

    if status_filter is not None:
        base = base.where(Tenant.status == status_filter)
        count_base = count_base.where(Tenant.status == status_filter)

    total = db.execute(count_base).scalar_one()
    items = (
        db.execute(
            base.order_by(Tenant.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return list(items), total


def get_tenant(db: Session, tenant_id: int) -> Tenant:
    tenant = db.execute(
        select(Tenant)
        .where(Tenant.id == tenant_id)
        .options(selectinload(Tenant.schools))
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return tenant


def branch_counts(db: Session, school_ids: list[int]) -> dict[int, int]:
    """Branches (campuses) each school has, for the platform's schools list."""
    from app.models.rbac import Branch

    if not school_ids:
        return {}
    rows = db.execute(
        select(Branch.school_id, func.count(Branch.id))
        .where(Branch.school_id.in_(school_ids))
        .group_by(Branch.school_id)
    ).all()
    return {sid: n for sid, n in rows}


def get_current_subscription(db: Session, tenant_id: int) -> Optional[TenantSubscription]:
    return db.execute(
        select(TenantSubscription)
        .where(TenantSubscription.tenant_id == tenant_id)
        .order_by(TenantSubscription.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def update_tenant(db: Session, tenant_id: int, data: TenantUpdate) -> Tenant:
    tenant = get_tenant(db, tenant_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    db.commit()
    db.refresh(tenant)
    return tenant


def set_tenant_status(db: Session, tenant_id: int, new_status: TenantStatus) -> Tenant:
    tenant = get_tenant(db, tenant_id)
    tenant.status = new_status
    tenant.is_active = new_status == TenantStatus.active
    db.commit()
    db.refresh(tenant)
    return tenant
