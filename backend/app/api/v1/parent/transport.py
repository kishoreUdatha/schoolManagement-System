from typing import Annotated, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.transport import ChildTransport
from app.services import transport_service


router = APIRouter()


@router.get(
    "/{student_id}/transport",
    response_model=Optional[ChildTransport],
    summary="Child's route, stop, bus, driver, last bus location and today's boarding",
)
def child_transport(
    student_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    data = transport_service.child_transport(db, current_user.id, student_id)
    return ChildTransport.model_validate(data) if data else None
