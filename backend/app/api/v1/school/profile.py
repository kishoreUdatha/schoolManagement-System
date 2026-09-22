from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.api.v1 import branding
from app.core import storage
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


LOGO_MAX_MB = 2


@router.post("/logo", response_model=SchoolProfileRead,
             summary="Upload the school logo (PNG, JPG or WEBP, 2 MB max); sets logo_url")
def upload_logo(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
):
    school = school_service.get_school(db, school_id=current_user.school_id, tenant_id=current_user.tenant_id)
    info = storage.save_upload(school.id, branding.LOGO_AREA, file, allowed=storage.LOGO_TYPES, max_mb=LOGO_MAX_MB)
    old = branding.logo_key_from_url(school.id, school.logo_url)
    school.logo_url = branding.logo_url_for(school.id, info["key"])
    db.commit()
    db.refresh(school)
    if old:
        storage.delete(old)
    return SchoolProfileRead.model_validate(school)
