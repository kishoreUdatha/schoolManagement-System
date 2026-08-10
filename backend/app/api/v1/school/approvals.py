from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, SchoolAdminOrPrincipal
from app.core.enums import ApprovalKind, ApprovalStatus
from app.database import get_db
from app.schemas.approval import ApprovalCreate, ApprovalRead
from app.services import approval_service


router = APIRouter()


@router.post(
    "",
    response_model=ApprovalRead,
    status_code=status.HTTP_201_CREATED,
    summary="File an approval request (school admin or teacher only)",
)
def create(
    payload: ApprovalCreate,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    if not approval_service.can_request(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only school admin or teacher can file approval requests",
        )
    if current_user.tenant_id is None or current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be linked to a tenant and school",
        )
    a = approval_service.create_request(
        db,
        current_user.tenant_id,
        current_user.school_id,
        current_user.id,
        payload,
    )
    return ApprovalRead.model_validate(approval_service.to_read_dict(db, a))


@router.get(
    "",
    response_model=list[ApprovalRead],
    summary="List approval requests (school admin or principal)",
)
def list_(
    current_user: SchoolAdminOrPrincipal,
    db: Annotated[Session, Depends(get_db)],
    status_filter: Optional[ApprovalStatus] = Query(None, alias="status"),
    kind: Optional[ApprovalKind] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    items = approval_service.list_(
        db,
        current_user.school_id,
        status_filter=status_filter,
        kind=kind,
        limit=limit,
    )
    return [
        ApprovalRead.model_validate(approval_service.to_read_dict(db, a))
        for a in items
    ]
