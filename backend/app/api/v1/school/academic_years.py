from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser, allow
from app.core.enums import UserRole
from app.database import get_db
from app.models.user import User
from app.schemas.academic_year import (
    AcademicYearCreate,
    AcademicYearRead,
    AcademicYearUpdate,
)
from app.services import academic_year_service


router = APIRouter()

# Reading which years the school has is not an administrative act: a teacher
# picking last year's register needs the list, and it names nothing a person
# who works in the building does not already know. Creating, archiving and
# setting the current year stay with the school admin, below.
AnyStaff = Annotated[
    User,
    Depends(
        allow(
            UserRole.school_admin,
            UserRole.principal,
            UserRole.teacher,
            UserRole.accountant,
            UserRole.staff,
        )
    ),
]


@router.post(
    "",
    response_model=AcademicYearRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create an academic year for this school",
)
def create(
    payload: AcademicYearCreate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    year = academic_year_service.create_year(
        db,
        tenant_id=current_user.tenant_id,
        school_id=current_user.school_id,
        data=payload,
    )
    return AcademicYearRead.model_validate(year)


@router.get(
    "",
    response_model=list[AcademicYearRead],
    summary="List academic years for this school",
)
def list_(
    current_user: AnyStaff,
    db: Annotated[Session, Depends(get_db)],
    include_archived: bool = Query(False),
):
    years = academic_year_service.list_years(
        db, current_user.school_id, include_archived=include_archived
    )
    return [AcademicYearRead.model_validate(y) for y in years]


@router.get("/{year_id}", response_model=AcademicYearRead)
def get(
    year_id: int,
    current_user: AnyStaff,
    db: Annotated[Session, Depends(get_db)],
):
    year = academic_year_service.get_year(db, year_id, current_user.school_id)
    return AcademicYearRead.model_validate(year)


@router.patch("/{year_id}", response_model=AcademicYearRead)
def update(
    year_id: int,
    payload: AcademicYearUpdate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    year = academic_year_service.update_year(
        db, year_id, current_user.school_id, payload
    )
    return AcademicYearRead.model_validate(year)


@router.post(
    "/{year_id}/set-current",
    response_model=AcademicYearRead,
    summary="Mark this year as the current academic year",
)
def set_current(
    year_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    year = academic_year_service.set_current(db, year_id, current_user.school_id)
    return AcademicYearRead.model_validate(year)


@router.post("/{year_id}/archive", response_model=AcademicYearRead)
def archive(
    year_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    year = academic_year_service.archive_year(db, year_id, current_user.school_id)
    return AcademicYearRead.model_validate(year)


@router.post("/{year_id}/unarchive", response_model=AcademicYearRead)
def unarchive(
    year_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    year = academic_year_service.unarchive_year(db, year_id, current_user.school_id)
    return AcademicYearRead.model_validate(year)


@router.delete(
    "/{year_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete (only allowed when no dependent data exists)",
)
def delete(
    year_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    academic_year_service.delete_year(db, year_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
