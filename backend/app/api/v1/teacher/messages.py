"""Story 17.2 — Teacher-side messaging endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.messaging import ConversationClose, ConversationRead, MessageRead, MessageSend
from app.services import attachment_service, messaging_service


router = APIRouter()


@router.get(
    "/conversations",
    response_model=list[ConversationRead],
    summary="All my conversations with parents (latest first)",
)
def list_conversations(
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
    include_closed: bool = False,
):
    items = messaging_service.list_for_teacher(db, current_user.id, include_closed=include_closed)
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


@router.patch(
    "/conversations/{conversation_id}",
    response_model=ConversationRead,
    summary="Close a settled conversation, or bring it back",
)
def set_closed(
    conversation_id: int,
    payload: ConversationClose,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    c = messaging_service.set_closed(db, conversation_id, current_user, payload.closed)
    return ConversationRead.model_validate(
        messaging_service._conversation_read_dict(db, c, viewer_role="teacher")
    )


@router.post(
    "/conversations/{conversation_id}/files",
    response_model=MessageRead,
    status_code=status.HTTP_201_CREATED,
    summary="Attach files (PDF, image or Word; up to 5) to the last message you sent here",
)
def attach(
    conversation_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
    files: list[UploadFile] = File(...),
):
    m = messaging_service.attach_to_my_last_message(db, conversation_id, current_user, files)
    return MessageRead.model_validate(messaging_service._message_dict(db, m))


@router.get(
    "/conversations/{conversation_id}/messages/{message_id}/files/{attachment_id}",
    summary="Open a file sent with a message",
)
def message_file(
    conversation_id: int,
    message_id: int,
    attachment_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    return attachment_service.file_response(
        messaging_service.message_file(db, conversation_id, message_id, current_user.id, attachment_id)
    )


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
