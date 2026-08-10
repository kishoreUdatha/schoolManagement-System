from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.behaviour import BehaviourRatingRead
from app.services import behaviour_service


router = APIRouter()


@router.get(
    "/{student_id}/behaviour",
    response_model=list[BehaviourRatingRead],
    summary="Behaviour rating history for a linked child",
)
def child_behaviour(
    student_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = behaviour_service.list_for_child(db, current_user.id, student_id)
    return [
        BehaviourRatingRead.model_validate(behaviour_service._to_read_dict(db, r))
        for r in items
    ]
