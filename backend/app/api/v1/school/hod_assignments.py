from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.schemas.timetable import HodAssignmentRead, HodAssignmentSet
from app.services import timetable_service


router = APIRouter()


@router.get(
    "",
    response_model=list[HodAssignmentRead],
    summary="List HODs and the sections they manage",
)
def list_(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    items = timetable_service.list_hod_assignments(db, current_user.school_id)
    return [HodAssignmentRead.model_validate(i) for i in items]


@router.put(
    "/{teacher_user_id}",
    response_model=list[HodAssignmentRead],
    summary="Replace a teacher's HOD sections (empty list removes HOD role)",
)
def set_sections(
    teacher_user_id: int,
    payload: HodAssignmentSet,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    timetable_service.set_hod_sections(
        db,
        current_user.tenant_id,
        current_user.school_id,
        teacher_user_id,
        payload.section_ids,
    )
    items = timetable_service.list_hod_assignments(db, current_user.school_id)
    return [HodAssignmentRead.model_validate(i) for i in items]
