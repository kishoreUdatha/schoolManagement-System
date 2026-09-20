"""Signing a child in.

Everybody else in this system signs in with an email address. Children mostly
do not have one, and inventing adm0041@school.local so a nine year old can
type it is a worse answer than asking for the number already printed on their
diary. So a student signs in with their school's code, their admission
number, and a password.

The school code is needed because an admission number is only unique within a
school — two schools on the same deployment both have an ADM0001, and they
are different children.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import StudentUser
from app.core.enums import TenantStatus, UserRole
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.database import get_db
from app.models.student import Student
from app.models.tenant import School, Tenant
from app.models.user import User
from app.schemas.auth import RefreshRequest, TokenResponse, UserPublic
from app.services import student_portal_service


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class StudentLoginRequest(BaseModel):
    school_code: str = Field(..., min_length=1, max_length=40)
    admission_no: str = Field(..., min_length=1, max_length=40)
    password: str = Field(..., min_length=1)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


def _token(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id, user.role.value, user.tenant_id, user.school_id),
        refresh_token=create_refresh_token(user.id, user.role.value, user.tenant_id, user.school_id),
        user=UserPublic.model_validate(user),
    )


# One message for every way of getting it wrong. Telling an anonymous caller
# that the admission number exists but the password is wrong turns the login
# form into a way of confirming which children attend the school.
WRONG = "Invalid school code, admission number or password"


@router.post("/login", response_model=TokenResponse, summary="Sign in with an admission number")
def login(req: StudentLoginRequest, db: Db):
    school = db.execute(
        select(School).where(func.lower(School.code) == req.school_code.strip().lower())
    ).scalar_one_or_none()
    if not school:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, WRONG)

    student = db.execute(
        select(Student).where(
            Student.school_id == school.id,
            func.lower(Student.admission_no) == req.admission_no.strip().lower(),
            Student.is_active.is_(True),
        )
    ).scalar_one_or_none()
    if not student or not student.user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, WRONG)

    user = db.get(User, student.user_id)
    if (
        not user
        or user.role != UserRole.student
        or not user.is_active
        or not user.password_hash
        or not verify_password(req.password, user.password_hash)
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, WRONG)

    tenant = db.get(Tenant, user.tenant_id)
    if not tenant or tenant.status != TenantStatus.active or not tenant.is_active:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your school account is not active. Please contact the school office.",
        )

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return _token(user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(req: RefreshRequest, db: Db):
    try:
        payload = decode_token(req.refresh_token)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")

    user = db.get(User, int(payload["sub"]))
    if not user or user.role != UserRole.student or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    return _token(user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT,
             summary="Change the password the office gave you")
def change_password(req: ChangePasswordRequest, current_user: StudentUser, db: Db):
    student_portal_service.change_own_password(
        db, current_user, req.current_password, req.new_password
    )
