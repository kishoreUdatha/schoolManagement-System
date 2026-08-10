"""Story 8.2 — School-side list + approve/reject for staff leaves."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminOrPrincipal
from app.core.enums import StaffLeaveStatus
from app.database import get_db
from app.schemas.staff_leave import StaffLeaveDecide, StaffLeaveRead
from app.services import staff_leave_service


router = APIRouter()


@router.get(
    "",
    response_model=list[StaffLeaveRead],
    summary="All staff leaves (pending first by default)",
)
def list_(
    current_user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    status_filter: Optional[StaffLeaveStatus] = Query(None, alias="status"),
):
    items = staff_leave_service.list_for_school(
        db, current_user.school_id, status_filter=status_filter
    )
    return [
        StaffLeaveRead.model_validate(staff_leave_service.to_read_dict(db, l))
        for l in items
    ]


@router.post(
    "/{leave_id}/decide",
    response_model=StaffLeaveRead,
    summary="Approve or reject a pending leave; on approve, marks attendance",
)
def decide(
    leave_id: int,
    payload: StaffLeaveDecide,
    current_user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
):
    l = staff_leave_service.decide(
        db, leave_id, current_user.school_id, current_user.id, payload
    )
    return StaffLeaveRead.model_validate(staff_leave_service.to_read_dict(db, l))
