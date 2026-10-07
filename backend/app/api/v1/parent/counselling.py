"""A parent asking for their child to see the school counsellor."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.core.scoping import require_linked_child
from app.database import get_db
from app.services import pastoral_service

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


class CounsellingRequestIn(BaseModel):
    about: str = Field(..., min_length=5, max_length=2000)
    preferred_times: Optional[str] = Field(None, max_length=200)


@router.get("/{student_id}/counselling-requests", summary="Your requests to the counsellor for this child, and where they stand")
def my_requests(student_id: int, current_user: ParentUser, db: Db):
    st = require_linked_child(db, current_user.id, student_id)
    return pastoral_service.family_requests(db, current_user, st)


@router.post("/{student_id}/counselling-requests", status_code=status.HTTP_201_CREATED, summary="Ask for the child to see the counsellor")
def ask(student_id: int, payload: CounsellingRequestIn, current_user: ParentUser, db: Db):
    st = require_linked_child(db, current_user.id, student_id)
    c = pastoral_service.family_request(db, current_user, st, payload.about, payload.preferred_times)
    return {"id": c.id}
