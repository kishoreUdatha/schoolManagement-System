"""Story 17.2 — Parent-side messaging endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.messaging import (
    ConversationRead,
    ConversationStartRequest,
    MessageRead,
    MessageSend,
    TeacherContactCard,
)
from app.services import attachment_service, messaging_service


router = APIRouter()


@router.get(
    "/children/{student_id}/teacher-contacts",
    response_model=list[TeacherContactCard],
    summary="Teachers the parent can message about this child",
)
def teacher_contacts(
    student_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = messaging_service.teachers_for_child(db, current_user.id, student_id)
    return [TeacherContactCard.model_validate(it) for it in items]


@router.get(
    "/conversations",
    response_model=list[ConversationRead],
    summary="All my conversations (latest activity first)",
)
def list_conversations(
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = messaging_service.list_for_parent(db, current_user.id)
    return [
        ConversationRead.model_validate(
            messaging_service._conversation_read_dict(
                db, c, viewer_role="parent", last_message=lm
            )
        )
        for c, lm in items
    ]


@router.post(
    "/conversations",
    response_model=ConversationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Start (or continue) a conversation with a teacher about a child",
)
def start_conversation(
    payload: ConversationStartRequest,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    c, _ = messaging_service.parent_start_or_send(
        db,
        current_user,
        payload.teacher_user_id,
        payload.student_id,
        payload.body,
        payload.attachment_url,
    )
    return ConversationRead.model_validate(
        messaging_service._conversation_read_dict(db, c, viewer_role="parent")
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageRead],
)
def messages(
    conversation_id: int,
    current_user: ParentUser,
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
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    m = messaging_service.send_in_conversation(
        db, conversation_id, current_user, payload.body, payload.attachment_url
    )
    return MessageRead.model_validate(messaging_service._message_dict(db, m))


@router.post(
    "/conversations/{conversation_id}/files",
    response_model=MessageRead,
    status_code=status.HTTP_201_CREATED,
    summary="Attach files (PDF, image or Word; up to 5) to the last message you sent here",
)
def attach(
    conversation_id: int,
    current_user: ParentUser,
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
    current_user: ParentUser,
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
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    c = messaging_service.mark_read(db, conversation_id, current_user.id)
    return ConversationRead.model_validate(
        messaging_service._conversation_read_dict(db, c, viewer_role="parent")
    )
