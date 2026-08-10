from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.learning_video import LearningVideoRead
from app.services import learning_video_service as svc


router = APIRouter()


@router.get("/{student_id}/videos", response_model=list[LearningVideoRead])
def list_for_child(
    student_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = svc.list_for_child(db, current_user.id, student_id)
    return [
        LearningVideoRead.model_validate(
            svc._to_read_dict(db, v, student_id=student_id)
        )
        for v in items
    ]


# Story 15.2 — completion toggle

@router.post(
    "/{student_id}/videos/{video_id}/completion",
    response_model=LearningVideoRead,
    status_code=status.HTTP_201_CREATED,
    summary="Mark this video as watched for the linked child (idempotent)",
)
def mark_completed(
    student_id: int,
    video_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    svc.parent_mark_completed(db, current_user.id, student_id, video_id)
    v = svc.get(db, video_id, current_user.school_id)
    return LearningVideoRead.model_validate(
        svc._to_read_dict(db, v, student_id=student_id)
    )


@router.delete(
    "/{student_id}/videos/{video_id}/completion",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Un-mark this video as watched",
)
def unmark_completed(
    student_id: int,
    video_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    svc.parent_unmark_completed(db, current_user.id, student_id, video_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
