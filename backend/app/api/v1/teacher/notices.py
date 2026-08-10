from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.notice import NoticeCreate, NoticeRead
from app.services import notice_service, teacher_notice_service


router = APIRouter()


@router.post(
    "",
    response_model=NoticeRead,
    status_code=status.HTTP_201_CREATED,
    summary="Send an in-app notice to parents of classes/sections/students you teach",
)
def create(
    payload: NoticeCreate,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    n = teacher_notice_service.create_and_send(
        db, current_user.tenant_id, current_user.school_id, current_user.id, payload
    )
    return NoticeRead.model_validate(notice_service.to_read_dict(db, n))


@router.get(
    "",
    response_model=list[NoticeRead],
    summary="Notices this teacher has sent",
)
def list_(
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = teacher_notice_service.list_for_teacher(
        db, current_user.id, current_user.school_id
    )
    return [NoticeRead.model_validate(notice_service.to_read_dict(db, n)) for n in items]
