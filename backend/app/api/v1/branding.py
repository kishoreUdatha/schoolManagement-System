"""Story 21.1 — Public branding endpoint.

Any authenticated user (parent, teacher, school admin, principal, accountant)
can fetch their school's branding so the frontend can paint logo / colors /
app name across portals.
"""
import re
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core import storage
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
    # The campus line under the school name in every sidebar. Not sensitive
    # to somebody who works in the building, and this is the one endpoint
    # every role can already read.
    address: Optional[str] = None
    code: Optional[str] = None


LOGO_AREA = "logos"
_LOGO_FILE = re.compile(r"^[0-9a-f]{32}\.(png|jpg|jpeg|webp)$")


def logo_url_for(school_id: int, key: str) -> str:
    """The public address of an uploaded logo; stored in School.logo_url so
    every screen that shows the logo keeps working unchanged."""
    return f"/api/v1/branding/logo/{school_id}/{key.rsplit('/', 1)[-1]}"


def logo_key_from_url(school_id: int, url: Optional[str]) -> Optional[str]:
    """The storage key behind logo_url, if it points at an uploaded logo."""
    prefix = f"/api/v1/branding/logo/{school_id}/"
    if not url or not url.startswith(prefix):
        return None
    name = url[len(prefix):].split("?", 1)[0]
    return f"{school_id}/{LOGO_AREA}/{name}" if _LOGO_FILE.match(name) else None


@router.get("/logo/{school_id}/{filename}", summary="An uploaded school logo (public, like the logo itself)")
def logo(school_id: int, filename: str):
    # No sign-in: the logo shows on the public admission and careers pages
    # too. Only files under the school's logo folder can be named here.
    if not _LOGO_FILE.match(filename):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    ext = filename.rsplit(".", 1)[-1]
    return Response(
        content=storage.read(f"{school_id}/{LOGO_AREA}/{filename}"),
        media_type=storage.LOGO_TYPES[ext][0],
        headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )


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
        address=school.address,
        code=school.code,
    )
