from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.syllabus import ChildSubject
from app.services import syllabus_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/{student_id}/syllabus", response_model=list[ChildSubject], summary="Syllabus progress in the child's section")
def child_syllabus(student_id: int, current_user: ParentUser, db: Db):
    return svc.child_syllabus(db, current_user.id, student_id)
