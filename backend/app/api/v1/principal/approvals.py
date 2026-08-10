from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import PrincipalUser
from app.core.enums import ApprovalKind, ApprovalStatus
from app.database import get_db
from app.schemas.approval import ApprovalDecide, ApprovalRead
from app.services import approval_service


router = APIRouter()


@router.get(
    "",
    response_model=list[ApprovalRead],
    summary="Principal's view of approval requests",
)
def list_(
    current_user: PrincipalUser,
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


@router.post(
    "/{approval_id}/decide",
    response_model=ApprovalRead,
    summary="Approve or reject an approval request",
)
def decide(
    approval_id: int,
    payload: ApprovalDecide,
    current_user: PrincipalUser,
    db: Annotated[Session, Depends(get_db)],
):
    a = approval_service.decide(
        db, approval_id, current_user.school_id, current_user.id, payload
    )
    return ApprovalRead.model_validate(approval_service.to_read_dict(db, a))
