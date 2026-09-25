from datetime import datetime, timezone
from typing import Annotated, Union

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
from app.services.login_lookup import find_login_user
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UserPublic
from app.services import account_access_service, comms_settings_service
from pydantic import BaseModel, Field


router = APIRouter()


class LoginStep(BaseModel):
    """A sign-in that is not finished. Carries no token, deliberately."""

    otp_required: bool = True
    challenge: str
    sent_via: str


class VerifyOtpRequest(BaseModel):
    challenge: str = Field(..., min_length=8, max_length=64)
    code: str = Field(..., min_length=4, max_length=12)


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


@router.post("/login", response_model=Union[TokenResponse, LoginStep],
             summary="Sign in, or start a second factor when the school requires one")
def login(req: LoginRequest, db: Annotated[Session, Depends(get_db)]):
    user = find_login_user(db, req.email, UserRole.parent, req.password)

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

    # Fail closed. When the school requires a second factor this returns a
    # challenge and nothing else — no access token, no refresh token, and no
    # session. A correct password is half of a sign-in, not a sign-in.
    if comms_settings_service.needs_second_factor(db, user):
        challenge, code = account_access_service.issue_login_code(db, user)
        where = account_access_service.deliver(
            db, user,
            "Your sign-in code",
            f"Your code is {code}. It stops working in ten minutes. "
            "If you did not just try to sign in, ignore this and change your password.",
            code=code,
        )
        if where == "none":
            # Still fail closed, but say why instead of waiting for a code
            # that cannot arrive.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Your school asks for a sign-in code, but it can't be sent: the school "
                    "hasn't connected WhatsApp for codes, or your account has no mobile "
                    "number. Please contact the school office."
                ),
            )
        return LoginStep(otp_required=True, challenge=challenge, sent_via=where)

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    return _build_token_response(user)


@router.post("/verify-otp", response_model=TokenResponse,
             summary="Finish a sign-in with the code that was sent")
def verify_otp(req: VerifyOtpRequest, db: Annotated[Session, Depends(get_db)]):
    user = account_access_service.user_for_challenge(db, req.challenge)
    if user is None or user.role != UserRole.parent or not user.is_active:
        # An expired, spent and invented challenge all read the same, so this
        # cannot be used to ask whether a handle was ever real.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That code is wrong or has expired. Sign in again.",
        )

    # Raises on a wrong or stale code, and counts the guess. Nothing below
    # this line runs unless the code was right.
    account_access_service.check_login_code(db, user, req.code)

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
