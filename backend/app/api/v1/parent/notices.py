from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.core.enums import NotificationCategory
from app.database import get_db
from app.schemas.notice import InboxNotice
from app.services import notice_service


router = APIRouter()


@router.get(
    "",
    response_model=list[InboxNotice],
    summary="Parent inbox — in-app notices for this user",
)
def list_inbox(
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    category: Optional[NotificationCategory] = Query(None),
):
    items = notice_service.list_inbox(
        db, current_user.id, unread_only=unread_only, limit=limit, category=category
    )
    return [InboxNotice.model_validate(i) for i in items]


@router.get(
    "/unread-count",
    response_model=dict[str, int],
    summary="Quick unread count for header badge",
)
def unread(
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    return {"unread": notice_service.unread_count(db, current_user.id)}


@router.post(
    "/{recipient_id}/mark-read",
    status_code=status.HTTP_204_NO_CONTENT,
)
def mark_read(
    recipient_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    notice_service.mark_read(db, recipient_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
