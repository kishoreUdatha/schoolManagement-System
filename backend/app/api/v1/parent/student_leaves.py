from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.cover import StudentLeaveIn, StudentLeaveRead
from app.services import cover_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/{student_id}/leaves", response_model=list[StudentLeaveRead])
def leaves(student_id: int, current_user: ParentUser, db: Db):
    return svc.leaves_to_read(db, None, svc.child_leaves(db, current_user.id, student_id))


@router.post("/{student_id}/leaves", response_model=StudentLeaveRead, status_code=status.HTTP_201_CREATED,
             summary="Apply for leave (the class teacher is notified)")
def apply(student_id: int, payload: StudentLeaveIn, current_user: ParentUser, db: Db):
    return svc.leaves_to_read(db, None, [svc.apply(db, current_user.id, student_id, payload)])[0]


@router.post("/{student_id}/leaves/{leave_id}/cancel", response_model=StudentLeaveRead)
def cancel(student_id: int, leave_id: int, current_user: ParentUser, db: Db):
    return svc.leaves_to_read(db, None, [svc.cancel(db, current_user.id, student_id, leave_id)])[0]
