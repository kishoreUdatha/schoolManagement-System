from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.schemas.learning_video import LearningVideoRead
from app.services import learning_video_service as svc


router = APIRouter()


@router.get("", response_model=list[LearningVideoRead])
def list_(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    class_subject_id: Optional[int] = Query(None),
    include_removed: bool = Query(False),
):
    items = svc.list_for_admin(
        db,
        current_user.school_id,
        class_subject_id=class_subject_id,
        include_removed=include_removed,
    )
    return [LearningVideoRead.model_validate(svc._to_read_dict(db, v)) for v in items]


@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete(
    video_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    svc.admin_delete(db, video_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
