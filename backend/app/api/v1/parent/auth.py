from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.core.enums import TenantStatus, UserRole
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.database import get_db
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UserPublic


router = APIRouter()


def _build_token_response(user: User) -> TokenResponse:
    access = create_access_token(
        user.id, user.role.value, user.tenant_id, user.school_id
    )
    refresh = create_refresh_token(
        user.id, user.role.value, user.tenant_id, user.school_id
    )
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=UserPublic.model_validate(user),
    )


def _check_tenant_active(db: Session, tenant_id: int) -> None:
    tenant = db.get(Tenant, tenant_id)
    if not tenant or tenant.status != TenantStatus.active or not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your school account is not active. Please contact the school office.",
        )


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Annotated[Session, Depends(get_db)]):
    user = db.execute(
        select(User).where(
            User.email == req.email,
            User.role == UserRole.parent,
            User.is_active.is_(True),
        )
    ).scalar_one_or_none()

    if (
        not user
        or not user.password_hash
        or not verify_password(req.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    _check_tenant_active(db, user.tenant_id)

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    return _build_token_response(user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(req: RefreshRequest, db: Annotated[Session, Depends(get_db)]):
    try:
        payload = decode_token(req.refresh_token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong token type"
        )

    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active or user.role != UserRole.parent:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    _check_tenant_active(db, user.tenant_id)

    return _build_token_response(user)


@router.get("/me", response_model=UserPublic)
def me(current_user: ParentUser):
    return current_user
