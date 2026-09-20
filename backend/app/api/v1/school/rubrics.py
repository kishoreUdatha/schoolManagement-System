"""Marking rubrics, shared by the school admin, principal and teacher portals."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.core.enums import UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.rubric import CriterionIn, CriterionRead, RubricIn, RubricRead, RubricUpdate
from app.services import rubric_service as svc


def _academic_staff(current_user: CurrentUser) -> User:
    if current_user.role not in (UserRole.school_admin, UserRole.principal, UserRole.teacher) or current_user.school_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teaching staff access required")
    return current_user


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Academic = Annotated[User, Depends(_academic_staff)]


@router.get("", response_model=list[RubricRead])
def list_rubrics(current_user: Academic, db: Db, subject_id: Optional[int] = None, include_inactive: bool = False):
    return svc.list_rubrics(db, current_user.school_id, subject_id, include_inactive)


@router.post("", response_model=RubricRead, status_code=status.HTTP_201_CREATED)
def create(payload: RubricIn, current_user: Academic, db: Db):
    return svc.to_read(db, [svc.create(db, current_user, payload)])[0]


@router.get("/{rubric_id}", response_model=RubricRead)
def get(rubric_id: int, current_user: Academic, db: Db):
    return svc.to_read(db, [svc.get(db, rubric_id, current_user.school_id)])[0]


@router.patch("/{rubric_id}", response_model=RubricRead)
def update(rubric_id: int, payload: RubricUpdate, current_user: Academic, db: Db):
    return svc.to_read(db, [svc.update(db, current_user, rubric_id, payload)])[0]


@router.delete("/{rubric_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(rubric_id: int, current_user: Academic, db: Db):
    svc.delete(db, current_user, rubric_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{rubric_id}/criteria", response_model=CriterionRead, status_code=status.HTTP_201_CREATED)
def add_criterion(rubric_id: int, payload: CriterionIn, current_user: Academic, db: Db):
    return svc.add_criterion(db, current_user, rubric_id, payload)


@router.put("/criteria/{criterion_id}", response_model=CriterionRead)
def update_criterion(criterion_id: int, payload: CriterionIn, current_user: Academic, db: Db):
    return svc.update_criterion(db, current_user, criterion_id, payload)


@router.delete("/criteria/{criterion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_criterion(criterion_id: int, current_user: Academic, db: Db):
    svc.delete_criterion(db, current_user, criterion_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
