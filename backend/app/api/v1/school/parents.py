from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.schemas.parent import (
    LinkChildRequest,
    ParentCreate,
    ParentCreateResponse,
    ParentPasswordResetResponse,
    ParentRead,
    ParentUpdate,
)
from app.services import parent_service


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
