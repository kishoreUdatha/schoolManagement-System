from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.teacher_dashboard import TeacherDashboardRead
from app.services import teacher_service


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
