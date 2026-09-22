"""Forgotten passwords and one-time codes, for everybody.

These are the only authenticated-adjacent routes that anyone can call without
a token, which is exactly why they say so little. Every response below is the
same whether the account exists or not.
"""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.core.enums import UserRole
from app.database import get_db
from app.services import account_access_service


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class ForgotIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    role: Optional[UserRole] = None


class ForgotOut(BaseModel):
    """Deliberately uninformative.

    `sent` is always true. It describes what we did with the request, not
    whether there was an account to act on — the difference is the whole
    point.
    """
    sent: bool = True
    message: str


class ResetIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    token: str = Field(..., min_length=8, max_length=200)
    new_password: str = Field(..., min_length=8, max_length=128)


class ChangeIn(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


SAME_ANSWER = (
    "If that address belongs to an account and the school sends email, a reset "
    "code is on its way. If nothing arrives, ask the school office to reset "
    "your password."
)


@router.post("/forgot-password", response_model=ForgotOut,
             summary="Ask for a reset link")
def forgot_password(payload: ForgotIn, db: Db):
    found = account_access_service.request_reset(db, payload.email, payload.role)
    if found:
        user, token = found
        account_access_service.deliver(
            db, user,
            "Reset your password",
            f"Use this code to set a new password: {token}\n"
            "It stops working in 30 minutes. If you did not ask for it, ignore this.",
        )
    # The same body, and no branch that takes materially longer, whether or
    # not there was an account.
    return ForgotOut(message=SAME_ANSWER)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT,
             summary="Set a new password using the code from the link")
def reset_password(payload: ResetIn, db: Db):
    account_access_service.complete_reset(
        db, payload.email, payload.token, payload.new_password
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT,
             summary="Change your own password, whoever you are")
def change_password(payload: ChangeIn, current_user: CurrentUser, db: Db):
    account_access_service.change_password(
        db, current_user, payload.current_password, payload.new_password
    )
