from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.student_360 import Student360Read
from app.schemas.student_profile import StudentProfileRead
from app.services import student_360_service, student_profile_service as svc


router = APIRouter()


@router.get(
    "/{student_id}/360",
    response_model=Student360Read,
    summary="Everything about one student: marks, attendance, homework, family, fees, documents",
)
def get_360(
    student_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    student = svc.get_student_for_teacher(
        db, student_id, current_user.id, current_user.school_id
    )
    return Student360Read.model_validate(
        student_360_service.build_360(db, student)
    )


@router.get(
    "/{student_id}",
    response_model=StudentProfileRead,
    summary="Full profile for a student in a class this teacher teaches",
)
def get_profile(
    student_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    student = svc.get_student_for_teacher(
        db, student_id, current_user.id, current_user.school_id
    )
    return StudentProfileRead.model_validate(svc.build_profile(db, student))
