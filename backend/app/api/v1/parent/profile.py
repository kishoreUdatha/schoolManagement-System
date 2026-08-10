from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.student_profile import StudentProfileRead
from app.services import student_profile_service as svc


router = APIRouter()


@router.get(
    "/{student_id}/profile",
    response_model=StudentProfileRead,
    summary="Full profile of a linked child (cross-module summary)",
)
def get_profile(
    student_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    student = svc.get_student_for_parent(db, student_id, current_user.id)
    return StudentProfileRead.model_validate(svc.build_profile(db, student))
