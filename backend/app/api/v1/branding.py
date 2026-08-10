"""Story 21.1 — Public branding endpoint.

Any authenticated user (parent, teacher, school admin, principal, accountant)
can fetch their school's branding so the frontend can paint logo / colors /
app name across portals.
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.database import get_db
from app.models.tenant import School


router = APIRouter()


class BrandingRead(BaseModel):
    school_id: int
    name: str
    logo_url: Optional[str] = None
    brand_color: Optional[str] = None
    app_name: Optional[str] = None


@router.get(
    "/me",
    response_model=BrandingRead,
    summary="Branding for the caller's school (logo, color, app name)",
)
def my_branding(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not linked to a school",
        )
    school = db.get(School, current_user.school_id)
    if not school:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="School not found"
        )
    return BrandingRead(
        school_id=school.id,
        name=school.name,
        logo_url=school.logo_url,
        brand_color=school.brand_color,
        app_name=school.app_name,
    )
