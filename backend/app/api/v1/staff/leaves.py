"""Story 8.2 — Employee-side leave application + my-leaves list."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.database import get_db
from app.schemas.staff_leave import StaffLeaveCreate, StaffLeaveRead
from app.services import staff_leave_service


router = APIRouter()


@router.post(
    "",
    response_model=StaffLeaveRead,
    status_code=status.HTTP_201_CREATED,
    summary="Apply for leave (any school-side employee)",
)
def apply(
    payload: StaffLeaveCreate,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    if not staff_leave_service.can_apply(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only school employees can apply for leave",
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be linked to a tenant and school",
        )
    l = staff_leave_service.apply_leave(
        db, current_user.tenant_id, current_user.school_id, current_user.id, payload
    )
    return StaffLeaveRead.model_validate(staff_leave_service.to_read_dict(db, l))


@router.get(
    "",
    response_model=list[StaffLeaveRead],
    summary="My leaves (most recent first)",
)
def list_mine(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = staff_leave_service.list_for_user(db, current_user.id)
    return [
        StaffLeaveRead.model_validate(staff_leave_service.to_read_dict(db, l))
        for l in items
    ]


@router.post(
    "/{leave_id}/cancel",
    response_model=StaffLeaveRead,
    summary="Cancel my own pending leave",
)
def cancel(
    leave_id: int,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be linked to a school",
        )
    l = staff_leave_service.cancel_own(
        db, leave_id, current_user.id, current_user.school_id
    )
    return StaffLeaveRead.model_validate(staff_leave_service.to_read_dict(db, l))
