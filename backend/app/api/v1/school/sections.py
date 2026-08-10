from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.schemas.class_section import SectionRead, SectionUpdate
from app.services import class_service


router = APIRouter()


@router.patch("/{section_id}", response_model=SectionRead)
def update_section(
    section_id: int,
    payload: SectionUpdate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    sec = class_service.update_section(
        db, section_id, current_user.school_id, payload
    )
    return SectionRead.model_validate(sec)


@router.delete("/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_section(
    section_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    class_service.delete_section(db, section_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
