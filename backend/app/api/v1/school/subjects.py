from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser, SchoolStructureReader
from app.database import get_db
from app.schemas.subject import (
    SubjectBulkCreate,
    SubjectBulkResult,
    SubjectCreate,
    SubjectRead,
    SubjectUpdate,
)
from app.services import subject_service


router = APIRouter()


@router.post(
    "",
    response_model=SubjectRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a subject (school-wide master list)",
)
def create(
    payload: SubjectCreate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    s = subject_service.create_subject(
        db, current_user.tenant_id, current_user.school_id, payload
    )
    return SubjectRead.model_validate(s)


@router.get("", response_model=list[SubjectRead], summary="List subjects")
def list_(
    current_user: SchoolStructureReader,
    db: Annotated[Session, Depends(get_db)],
    active_only: bool = Query(True),
):
    items = subject_service.list_subjects(
        db, current_user.school_id, active_only=active_only
    )
    return [SubjectRead.model_validate(s) for s in items]


@router.get("/{subject_id}", response_model=SubjectRead)
def get(
    subject_id: int,
    current_user: SchoolStructureReader,
    db: Annotated[Session, Depends(get_db)],
):
    return SubjectRead.model_validate(
        subject_service.get_subject(db, subject_id, current_user.school_id)
    )


@router.patch("/{subject_id}", response_model=SubjectRead)
def update(
    subject_id: int,
    payload: SubjectUpdate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    s = subject_service.update_subject(
        db, subject_id, current_user.school_id, payload
    )
    return SubjectRead.model_validate(s)


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    subject_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    subject_service.delete_subject(db, subject_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/bulk",
    response_model=SubjectBulkResult,
    summary="Bulk-create subjects (used for CSV import)",
)
def bulk(
    payload: SubjectBulkCreate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    created, errors = subject_service.bulk_create(
        db, current_user.tenant_id, current_user.school_id, payload
    )
    return SubjectBulkResult(
        created=[SubjectRead.model_validate(s) for s in created],
        errors=errors,
    )
