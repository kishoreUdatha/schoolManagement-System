"""Story 17.2 — Teacher-side messaging endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.messaging import ConversationRead, MessageRead, MessageSend
from app.services import messaging_service


router = APIRouter()


@router.get(
    "/conversations",
    response_model=list[ConversationRead],
    summary="All my conversations with parents (latest first)",
)
def list_conversations(
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = messaging_service.list_for_teacher(db, current_user.id)
    return [
        ConversationRead.model_validate(
            messaging_service._conversation_read_dict(
                db, c, viewer_role="teacher", last_message=lm
            )
        )
        for c, lm in items
    ]


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageRead],
)
def messages(
    conversation_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    rows = messaging_service.list_messages(db, conversation_id, current_user.id)
    return [
        MessageRead.model_validate(messaging_service._message_dict(db, m))
        for m in rows
    ]


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageRead,
    status_code=status.HTTP_201_CREATED,
)
def send(
    conversation_id: int,
    payload: MessageSend,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    m = messaging_service.send_in_conversation(
        db, conversation_id, current_user, payload.body, payload.attachment_url
    )
    return MessageRead.model_validate(messaging_service._message_dict(db, m))


@router.post(
    "/conversations/{conversation_id}/mark-read",
    response_model=ConversationRead,
)
def mark_read(
    conversation_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    c = messaging_service.mark_read(db, conversation_id, current_user.id)
    return ConversationRead.model_validate(
        messaging_service._conversation_read_dict(db, c, viewer_role="teacher")
    )
