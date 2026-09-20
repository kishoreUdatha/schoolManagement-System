"""Giving children a way in, from the office side.

A password is shown once, at the moment it is made, and never again. That is
the point rather than an inconvenience: an office that can look up a child's
password later is an office where the password is not the child's.
"""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.schemas.student_portal import (
    ClassLoginsCreated,
    LoginCreated,
    LoginRevoked,
    LoginStatusRow,
)
from app.services import student_portal_service


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[LoginStatusRow],
            summary="Who has an account and who does not")
def status_list(current_user: SchoolAdminUser, db: Db, class_id: Optional[int] = None):
    return student_portal_service.login_status(db, current_user.school_id, class_id)


@router.post("/class/{class_id}", response_model=ClassLoginsCreated,
             status_code=status.HTTP_201_CREATED,
             summary="Create or reset logins for a whole class")
def create_for_class(class_id: int, current_user: SchoolAdminUser, db: Db):
    return student_portal_service.create_logins_for_class(
        db, current_user.school_id, class_id
    )


@router.post("/{student_id}", response_model=LoginCreated,
             status_code=status.HTTP_201_CREATED,
             summary="Create a login, or reset the password on an existing one")
def create_one(student_id: int, current_user: SchoolAdminUser, db: Db):
    return student_portal_service.create_login(db, current_user.school_id, student_id)


@router.delete("/{student_id}", response_model=LoginRevoked,
               summary="Switch an account off without deleting what the child handed in")
def revoke(student_id: int, current_user: SchoolAdminUser, db: Db):
    return student_portal_service.revoke_login(db, current_user.school_id, student_id)
