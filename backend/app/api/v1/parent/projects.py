"""Story 10.1 + 10.2 — Parent-side project endpoints."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.project import (
    ProgressRead,
    ProgressUpdate,
    ProjectRead,
)
from app.services import project_service


router = APIRouter()


@router.get(
    "/{student_id}/projects",
    response_model=list[ProjectRead],
    summary="Projects for a linked child's class",
)
def list_for_child(
    student_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = project_service.list_for_child(db, current_user.id, student_id)
    return [ProjectRead.model_validate(project_service._to_read_dict(db, p)) for p in items]


@router.get(
    "/{student_id}/projects/{project_id}/progress",
    response_model=Optional[ProgressRead],
    summary="Current progress for this project (null if none yet)",
)
def get_progress(
    student_id: int,
    project_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    pp = project_service.get_progress_for_child(
        db, current_user.id, student_id, project_id
    )
    if not pp:
        return None
    return ProgressRead.model_validate(project_service._progress_dict(db, pp))


@router.post(
    "/{student_id}/projects/{project_id}/progress",
    response_model=ProgressRead,
    summary="Upsert progress (in_progress / submitted, with optional attachment)",
)
def upsert_progress(
    student_id: int,
    project_id: int,
    payload: ProgressUpdate,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    pp = project_service.upsert_progress(
        db, current_user.id, student_id, project_id, payload
    )
    return ProgressRead.model_validate(project_service._progress_dict(db, pp))
