from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.schemas.subject import (
    ClassSubjectAssign,
    ClassSubjectRead,
    ClassSubjectUpdate,
)
from app.services import subject_service


# Two routers — one nested under classes, one flat for the assignment itself.
classes_subjects_router = APIRouter()
class_subjects_router = APIRouter()


@classes_subjects_router.post(
    "/{class_id}/subjects",
    response_model=ClassSubjectRead,
    status_code=status.HTTP_201_CREATED,
    summary="Assign a subject to a class",
)
def assign(
    class_id: int,
    payload: ClassSubjectAssign,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    cs = subject_service.assign_subject_to_class(
        db,
        current_user.tenant_id,
        current_user.school_id,
        class_id,
        payload,
    )
    return ClassSubjectRead.model_validate(cs)


@classes_subjects_router.get(
    "/{class_id}/subjects",
    response_model=list[ClassSubjectRead],
    summary="List subjects assigned to a class",
)
def list_for_class(
    class_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = subject_service.list_class_subjects(
        db, class_id, current_user.school_id
    )
    return [ClassSubjectRead.model_validate(cs) for cs in items]


@class_subjects_router.patch(
    "/{cs_id}", response_model=ClassSubjectRead, summary="Update an assignment"
)
def update(
    cs_id: int,
    payload: ClassSubjectUpdate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    cs = subject_service.update_class_subject(
        db, cs_id, current_user.school_id, payload
    )
    return ClassSubjectRead.model_validate(cs)


@class_subjects_router.delete(
    "/{cs_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unassign a subject from a class",
)
def remove(
    cs_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    subject_service.remove_class_subject(db, cs_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
