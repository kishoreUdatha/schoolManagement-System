from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.teacher_timetable import TeacherTimetableRead
from app.services import teacher_timetable_service


router = APIRouter()


@router.get(
    "",
    response_model=TeacherTimetableRead,
    summary="My weekly timetable with today's classes and next-class hint",
)
def my_timetable(
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    data = teacher_timetable_service.get_for_teacher(
        db, current_user.id, current_user.school_id
    )
    return TeacherTimetableRead.model_validate(data)
