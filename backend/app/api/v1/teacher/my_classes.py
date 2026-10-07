from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import TeacherUser
from app.database import get_db
from app.schemas.my_classes import MyClassesRead, RosterStudent
from app.services import teacher_service


router = APIRouter()


@router.get(
    "/my-classes",
    response_model=MyClassesRead,
    summary="Sections + class-subjects this teacher is assigned to",
)
def my_classes(
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    data = teacher_service.list_my_classes(
        db, current_user.id, current_user.school_id
    )
    return MyClassesRead.model_validate(data)


@router.get(
    "/sections/{section_id}/students",
    response_model=list[RosterStudent],
    summary="Active student roster for a section (teacher must have access)",
)
def section_roster(
    section_id: int,
    current_user: TeacherUser,
    db: Annotated[Session, Depends(get_db)],
):
    rows = teacher_service.list_section_students(
        db, current_user.id, section_id, current_user.school_id
    )
    return [RosterStudent.model_validate(r) for r in rows]



@router.get("/sections/{section_id}/medical-alerts", summary="Students in the section with an allergy, condition or medication")
def section_medical_alerts(section_id: int, current_user: TeacherUser, db: Annotated[Session, Depends(get_db)]):
    from app.services import health_service

    teacher_service.teacher_can_access_section(db, current_user.id, section_id, current_user.school_id)
    return [{k: a[k] for k in ("student_id", "student_name", "allergies", "chronic_conditions", "current_medications", "blood_group")}
            for a in health_service.alerts(db, current_user.school_id, section_id=section_id)]
