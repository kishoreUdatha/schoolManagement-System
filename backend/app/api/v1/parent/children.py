from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.parent import ChildOverview
from app.services import parent_service


router = APIRouter()


@router.get(
    "",
    response_model=list[ChildOverview],
    summary="Children linked to the signed-in parent",
)
def list_children(
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    rows = parent_service.list_children_for_parent_portal(db, current_user.id)
    return [ChildOverview.model_validate(r) for r in rows]


@router.get(
    "/{student_id}",
    response_model=ChildOverview,
    summary="One child detail (404 if parent is not linked to this child)",
)
def get_child(
    student_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    row = parent_service.get_child_for_parent(db, current_user.id, student_id)
    return ChildOverview.model_validate(row)
