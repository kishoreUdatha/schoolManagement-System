from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.core.enums import NoticeChannel, NotificationCategory
from app.database import get_db
from app.schemas.parent import (
    LinkChildRequest,
    ParentCreate,
    ParentCreateResponse,
    ParentNoteIn,
    ParentNoteRead,
    ParentPasswordResetResponse,
    ParentRead,
    ParentUpdate,
)
from app.services import comms_settings_service, parent_service, parent_statement_service


router = APIRouter()


@router.post(
    "",
    response_model=ParentCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a parent and link to one student (returns temp password)",
)
def create(
    payload: ParentCreate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    u, raw = parent_service.create_parent(
        db, current_user.tenant_id, current_user.school_id, payload
    )
    return ParentCreateResponse(
        parent=ParentRead.model_validate(parent_service.parent_to_read_dict(db, u)),
        temporary_password=raw,
    )


@router.get(
    "",
    response_model=list[ParentRead],
    summary="List parents (with linked children)",
)
def list_(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
):
    parents = parent_service.list_parents(
        db,
        current_user.school_id,
        status_filter=status_filter,
        search=search,
    )
    return [
        ParentRead.model_validate(parent_service.parent_to_read_dict(db, u))
        for u in parents
    ]


@router.get("/{user_id}", response_model=ParentRead)
def get(
    user_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    u = parent_service.get_parent(
        db, user_id, current_user.tenant_id, current_user.school_id
    )
    return ParentRead.model_validate(parent_service.parent_to_read_dict(db, u))


@router.patch("/{user_id}", response_model=ParentRead)
def update(
    user_id: int,
    payload: ParentUpdate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    u = parent_service.update_parent(
        db, user_id, current_user.tenant_id, current_user.school_id, payload
    )
    return ParentRead.model_validate(parent_service.parent_to_read_dict(db, u))


@router.post(
    "/{user_id}/links",
    response_model=ParentRead,
    summary="Link this parent to an additional student (sibling)",
)
def link_child(
    user_id: int,
    payload: LinkChildRequest,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    parent_service.link_child(
        db, user_id, current_user.tenant_id, current_user.school_id, payload
    )
    u = parent_service.get_parent(
        db, user_id, current_user.tenant_id, current_user.school_id
    )
    return ParentRead.model_validate(parent_service.parent_to_read_dict(db, u))


@router.delete(
    "/{user_id}/links/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unlink this parent from a student",
)
def unlink_child(
    user_id: int,
    student_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    parent_service.unlink_child(
        db, user_id, current_user.tenant_id, current_user.school_id, student_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{user_id}/activate", response_model=ParentRead)
def activate(
    user_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    u = parent_service.set_active(
        db,
        user_id,
        current_user.tenant_id,
        current_user.school_id,
        active=True,
    )
    return ParentRead.model_validate(parent_service.parent_to_read_dict(db, u))


@router.post("/{user_id}/deactivate", response_model=ParentRead)
def deactivate(
    user_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    u = parent_service.set_active(
        db,
        user_id,
        current_user.tenant_id,
        current_user.school_id,
        active=False,
    )
    return ParentRead.model_validate(parent_service.parent_to_read_dict(db, u))


@router.post(
    "/{user_id}/reset-password",
    response_model=ParentPasswordResetResponse,
)
def reset_password(
    user_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    u, raw = parent_service.reset_password(
        db, user_id, current_user.tenant_id, current_user.school_id
    )
    return ParentPasswordResetResponse(user_id=u.id, temporary_password=raw)


# --- School-side notes ---

@router.get("/{user_id}/notes", response_model=list[ParentNoteRead], summary="Office notes on this parent")
def list_notes(user_id: int, current_user: SchoolAdminUser, db: Annotated[Session, Depends(get_db)]):
    return parent_service.list_notes(db, user_id, current_user.tenant_id, current_user.school_id)


@router.post("/{user_id}/notes", response_model=ParentNoteRead, status_code=status.HTTP_201_CREATED,
             summary="Add an office note (the parent never sees it)")
def add_note(user_id: int, payload: ParentNoteIn, current_user: SchoolAdminUser,
             db: Annotated[Session, Depends(get_db)]):
    return parent_service.add_note(db, user_id, current_user, payload)


@router.delete("/{user_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(user_id: int, note_id: int, current_user: SchoolAdminUser,
                db: Annotated[Session, Depends(get_db)]):
    parent_service.delete_note(db, user_id, note_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Their communication preferences, as the office sees them ---

class PreferenceIn(BaseModel):
    channel: NoticeChannel
    category: NotificationCategory
    is_enabled: bool


@router.get("/{user_id}/preferences", summary="What this parent has chosen to be sent")
def get_preferences(user_id: int, current_user: SchoolAdminUser, db: Annotated[Session, Depends(get_db)]):
    u = parent_service.get_parent(db, user_id, current_user.tenant_id, current_user.school_id)
    return comms_settings_service.preferences(db, u)


@router.put("/{user_id}/preferences", summary="Change one on the parent's behalf; locked ones stay on")
def put_preference(user_id: int, payload: PreferenceIn, current_user: SchoolAdminUser,
                   db: Annotated[Session, Depends(get_db)]):
    u = parent_service.get_parent(db, user_id, current_user.tenant_id, current_user.school_id)
    return comms_settings_service.set_preference(db, u, payload.channel, payload.category, payload.is_enabled)


# --- Printable receipts and ledger ---

@router.get("/{user_id}/receipts/{collection_id}/pdf", summary="A fee receipt for one of this parent's children")
def receipt_pdf(user_id: int, collection_id: int, current_user: SchoolAdminUser,
                db: Annotated[Session, Depends(get_db)]):
    parent = parent_service.get_parent(db, user_id, current_user.tenant_id, current_user.school_id)
    pdf, filename = parent_statement_service.receipt_pdf(db, parent, collection_id)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.get("/{user_id}/ledger.pdf", summary="Charges and payments across this parent's children")
def ledger_pdf(
    user_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    student_id: Optional[int] = Query(None),
    frm: Optional[date] = Query(None, alias="from"),
    to: Optional[date] = Query(None),
):
    parent = parent_service.get_parent(db, user_id, current_user.tenant_id, current_user.school_id)
    pdf, filename = parent_statement_service.ledger_pdf(db, parent, student_id=student_id, frm=frm, to=to)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{filename}"'})
