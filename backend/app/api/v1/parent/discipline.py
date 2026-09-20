from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.pastoral import IncidentRead
from app.services import pastoral_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/{student_id}/discipline", response_model=list[IncidentRead],
            summary="Incidents the school has shared with parents")
def child_incidents(student_id: int, current_user: ParentUser, db: Db):
    return svc.child_incidents(db, current_user.id, student_id)
