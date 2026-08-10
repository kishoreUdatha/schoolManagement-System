from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.learning_video import (
    CompletionRosterRead,
    LearningVideoCreate,
    LearningVideoRead,
    LearningVideoUpdate,
)
from app.services import learning_video_service as svc


router = APIRouter()


@router.post(
    "",
    response_model=LearningVideoRead,
    status_code=status.HTTP_201_CREATED,
)
def create(
    payload: LearningVideoCreate,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    v = svc.create_for_teacher(
        db, current_user.tenant_id, current_user.school_id, current_user.id, payload
    )
    return LearningVideoRead.model_validate(svc._to_read_dict(db, v))


@router.get("", response_model=list[LearningVideoRead])
def list_(
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
    class_subject_id: Optional[int] = Query(None),
):
    items = svc.list_for_teacher(
        db, current_user.id, current_user.school_id, class_subject_id=class_subject_id
    )
    return [LearningVideoRead.model_validate(svc._to_read_dict(db, v)) for v in items]


@router.patch("/{video_id}", response_model=LearningVideoRead)
def update(
    video_id: int,
    payload: LearningVideoUpdate,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    v = svc.update_for_teacher(
        db, video_id, current_user.school_id, current_user.id, payload
    )
    return LearningVideoRead.model_validate(svc._to_read_dict(db, v))


@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    video_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    svc.delete_for_teacher(db, video_id, current_user.school_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Story 15.2 — completion roster

@router.get(
    "/{video_id}/completions",
    response_model=CompletionRosterRead,
    summary="Per-class watched/not-watched roster for this video",
)
def completions(
    video_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    data = svc.teacher_completion_roster(
        db, video_id, current_user.id, current_user.school_id
    )
    return CompletionRosterRead.model_validate(data)
