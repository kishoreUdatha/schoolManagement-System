from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.teacher_dashboard import TeacherDashboardRead
from app.services import teacher_duties_service, teacher_service


router = APIRouter()


@router.get(
    "",
    response_model=TeacherDashboardRead,
    summary="Teacher home — today's classes, class-teacher cards, unread notices",
)
def get_dashboard(
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    data = teacher_service.build_dashboard(
        db, current_user.id, current_user.school_id
    )
    return TeacherDashboardRead.model_validate(data)


@router.get("/duties", summary="Lessons this teacher covers for others in the next week, and exam rooms they watch")
def get_duties(
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    return teacher_duties_service.duties(db, current_user.id, current_user.school_id)
