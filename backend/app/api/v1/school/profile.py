from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.schemas.school_profile import SchoolProfileRead, SchoolProfileUpdate
from app.services import school_service


router = APIRouter()


@router.get("", response_model=SchoolProfileRead, summary="Get my school's profile")
def get_profile(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    school = school_service.get_school(
        db, school_id=current_user.school_id, tenant_id=current_user.tenant_id
    )
    return SchoolProfileRead.model_validate(school)


@router.patch("", response_model=SchoolProfileRead, summary="Update my school's profile")
def update_profile(
    payload: SchoolProfileUpdate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    school = school_service.update_school_profile(
        db,
        school_id=current_user.school_id,
        tenant_id=current_user.tenant_id,
        data=payload,
    )
    return SchoolProfileRead.model_validate(school)
