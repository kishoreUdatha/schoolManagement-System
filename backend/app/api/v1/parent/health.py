from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.health import HealthRecord, ProfileIn, ProfileRead
from app.services import health_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/{student_id}/health", response_model=HealthRecord)
def child_health(student_id: int, current_user: ParentUser, db: Db):
    return HealthRecord.model_validate(svc.health_record(db, svc.parent_student(db, current_user.id, student_id)))


@router.put(
    "/{student_id}/health/profile",
    response_model=ProfileRead,
    summary="Update allergies, conditions, medication and emergency contacts",
)
def update_profile(student_id: int, payload: ProfileIn, current_user: ParentUser, db: Db):
    s = svc.parent_student(db, current_user.id, student_id)
    p = svc.save_profile(db, s, current_user.id, payload)
    return ProfileRead.model_validate(svc.profile_to_read(db, s, p))
