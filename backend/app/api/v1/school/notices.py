from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.schemas.notice import NoticeCreate, NoticeRead, NoticeUpdate
from app.services import notice_service


router = APIRouter()


@router.post(
    "",
    response_model=NoticeRead,
    status_code=status.HTTP_201_CREATED,
)
def create(
    payload: NoticeCreate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    n = notice_service.create(
        db,
        current_user.tenant_id,
        current_user.school_id,
        current_user.id,
        payload,
    )
    return NoticeRead.model_validate(notice_service.to_read_dict(db, n))


@router.get("", response_model=list[NoticeRead])
def list_(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
):
    items = notice_service.list_(
        db, current_user.school_id, status_filter=status_filter, limit=limit
    )
    return [NoticeRead.model_validate(notice_service.to_read_dict(db, n)) for n in items]


@router.get("/{notice_id}", response_model=NoticeRead)
def get(
    notice_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    n = notice_service.get(db, notice_id, current_user.school_id)
    return NoticeRead.model_validate(notice_service.to_read_dict(db, n))


@router.patch("/{notice_id}", response_model=NoticeRead)
def update(
    notice_id: int,
    payload: NoticeUpdate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    n = notice_service.update(db, notice_id, current_user.school_id, payload)
    return NoticeRead.model_validate(notice_service.to_read_dict(db, n))


@router.delete("/{notice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    notice_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    notice_service.delete(db, notice_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{notice_id}/send",
    response_model=NoticeRead,
    summary="Resolve audience and dispatch the notice now",
)
def send(
    notice_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    n = notice_service.send(db, notice_id, current_user.school_id)
    return NoticeRead.model_validate(notice_service.to_read_dict(db, n))
