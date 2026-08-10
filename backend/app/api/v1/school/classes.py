from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.schemas.class_section import (
    ClassCreate,
    ClassRead,
    ClassReorderRequest,
    ClassUpdate,
    SectionCreate,
    SectionRead,
    SectionUpdate,
)
from app.services import class_service


router = APIRouter()


# --- Classes ---

@router.post(
    "",
    response_model=ClassRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a class within an academic year",
)
def create_class(
    payload: ClassCreate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    cls = class_service.create_class(
        db, current_user.tenant_id, current_user.school_id, payload
    )
    return ClassRead.model_validate(cls)


@router.get(
    "",
    response_model=list[ClassRead],
    summary="List classes for a given academic year (with sections)",
)
def list_classes(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    academic_year_id: int = Query(..., description="Required — which year to list"),
):
    items = class_service.list_classes(db, current_user.school_id, academic_year_id)
    return [ClassRead.model_validate(c) for c in items]


@router.get("/{class_id}", response_model=ClassRead)
def get_class(
    class_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    return ClassRead.model_validate(
        class_service.get_class(db, class_id, current_user.school_id)
    )


@router.patch("/{class_id}", response_model=ClassRead)
def update_class(
    class_id: int,
    payload: ClassUpdate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    cls = class_service.update_class(db, class_id, current_user.school_id, payload)
    return ClassRead.model_validate(cls)


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_class(
    class_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    class_service.delete_class(db, class_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/reorder",
    response_model=list[ClassRead],
    summary="Reorder classes within an academic year",
)
def reorder(
    payload: ClassReorderRequest,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    academic_year_id: int = Query(...),
):
    items = class_service.reorder_classes(
        db, current_user.school_id, academic_year_id, payload
    )
    return [ClassRead.model_validate(c) for c in items]


# --- Sections (nested under classes) ---

@router.post(
    "/{class_id}/sections",
    response_model=SectionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a section to a class",
)
def create_section(
    class_id: int,
    payload: SectionCreate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    sec = class_service.create_section(
        db,
        current_user.tenant_id,
        current_user.school_id,
        class_id,
        payload,
    )
    return SectionRead.model_validate(sec)
