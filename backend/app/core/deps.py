from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.enums import UserRole
from app.core.security import decode_token
from app.database import get_db
from app.models.user import User


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/super-admin/auth/login", auto_error=True
)


def get_current_user(
    request: Request,
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    try:
        payload = decode_token(token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong token type"
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload"
        )

    user = db.get(User, int(user_id))
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Story 22.1 — stash the active actor directly on the SQLAlchemy session.
    # More reliable than ContextVar across FastAPI's threadpool boundaries.
    db.info["audit_actor"] = {
        "user_id": user.id,
        "tenant_id": user.tenant_id,
        "school_id": user.school_id,
        "request_path": request.url.path if request else None,
    }
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_super_admin(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required"
        )
    return current_user


SuperAdminUser = Annotated[User, Depends(require_super_admin)]


def require_school_admin(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.school_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="School admin access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School admin must be linked to a tenant and school",
        )
    return current_user


SchoolAdminUser = Annotated[User, Depends(require_school_admin)]


def require_parent(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.parent:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Parent access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parent must be linked to a tenant and school",
        )
    return current_user


ParentUser = Annotated[User, Depends(require_parent)]


def require_student(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.student:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Student access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student must be linked to a tenant and school",
        )
    return current_user


StudentUser = Annotated[User, Depends(require_student)]

def require_teacher(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Teacher access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher must be linked to a tenant and school",
        )
    return current_user


TeacherUser = Annotated[User, Depends(require_teacher)]


def require_school_staff(current_user: CurrentUser) -> User:
    """Any employee that performs check-in/check-out: teacher, non-teaching
    staff, principal, or accountant."""
    if current_user.role not in (
        UserRole.teacher,
        UserRole.staff,
        UserRole.principal,
        UserRole.accountant,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff must be linked to a tenant and school",
        )
    return current_user


StaffUser = Annotated[User, Depends(require_school_staff)]


def require_principal(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.principal:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Principal access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Principal must be linked to a tenant and school",
        )
    return current_user


PrincipalUser = Annotated[User, Depends(require_principal)]


def require_accountant(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.accountant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Accountant access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accountant must be linked to a tenant and school",
        )
    return current_user


AccountantUser = Annotated[User, Depends(require_accountant)]


def require_school_admin_or_principal(current_user: CurrentUser) -> User:
    """Spec 3.2: principal can access reports. School admin can do everything
    a principal can, so reuse the same endpoints."""
    if current_user.role not in (UserRole.school_admin, UserRole.principal):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School admin or principal access required",
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be linked to a tenant and school",
        )
    return current_user


SchoolAdminOrPrincipal = Annotated[
    User, Depends(require_school_admin_or_principal)
]


def require_school_admin_or_accountant(current_user: CurrentUser) -> User:
    """Spec 3.2: accountant can access only the fee module."""
    if current_user.role not in (UserRole.school_admin, UserRole.accountant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School admin or accountant access required",
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be linked to a tenant and school",
        )
    return current_user


SchoolAdminOrAccountant = Annotated[
    User, Depends(require_school_admin_or_accountant)
]


def require_school_structure_reader(current_user: CurrentUser) -> User:
    """Read-only access to the school's classes and subjects. Principals,
    teachers and accountants need them to pick a class or subject on their
    own screens; changing them stays with the school admin."""
    if current_user.role not in (
        UserRole.school_admin,
        UserRole.principal,
        UserRole.teacher,
        UserRole.accountant,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="School staff access required",
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be linked to a tenant and school",
        )
    return current_user


SchoolStructureReader = Annotated[
    User, Depends(require_school_structure_reader)
]


def require_front_desk(current_user: CurrentUser) -> User:
    """Gate / reception work: school admin, principal, or non-teaching staff
    (security guard, receptionist)."""
    if current_user.role not in (UserRole.school_admin, UserRole.principal, UserRole.staff):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Front desk access required"
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be linked to a tenant and school",
        )
    return current_user


FrontDeskUser = Annotated[User, Depends(require_front_desk)]


def allow(*roles: UserRole, permission: Optional[str] = None):
    """Dependency for 'one of these roles, or anyone granted this permission'.

    Permissions are additive, so existing role checks keep working and a school
    can delegate a job by giving someone a custom role.
    """

    def _check(
        current_user: CurrentUser,
        db: Annotated[Session, Depends(get_db)],
    ) -> User:
        if current_user.school_id is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="School access required")
        if current_user.role in roles:
            return current_user
        if permission:
            from app.services import rbac_service

            if rbac_service.has_permission(db, current_user, permission):
                return current_user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have access to this")

    return _check
