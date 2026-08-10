from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.timetable import SectionTimetableRead
from app.services import timetable_service


router = APIRouter()


@router.get(
    "/{student_id}/timetable",
    response_model=SectionTimetableRead,
    summary="Read the published timetable for a linked child",
)
def child_timetable(
    student_id: int,
    current_user: ParentUser,
    db: Annotated[Session, Depends(get_db)],
):
    data = timetable_service.get_child_timetable_for_parent(
        db, current_user.id, student_id
    )
    return SectionTimetableRead.model_validate(data)
