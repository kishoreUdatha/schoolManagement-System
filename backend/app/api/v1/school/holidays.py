from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser, SchoolStructureReader
from app.database import get_db
from app.schemas.holiday import HolidayCreate, HolidayRead, HolidayUpdate
from app.services import holiday_service


router = APIRouter()


@router.post(
    "",
    response_model=HolidayRead,
    status_code=status.HTTP_201_CREATED,
)
def create(
    payload: HolidayCreate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    h = holiday_service.create(
        db, current_user.tenant_id, current_user.school_id, payload
    )
    return HolidayRead.model_validate(holiday_service.to_read_dict(h))


@router.get(
    "",
    response_model=list[HolidayRead],
    summary="List holidays, optionally filtered by year/month or upcoming-only",
)
def list_(
    current_user: SchoolStructureReader,
    db: Annotated[Session, Depends(get_db)],
    year: Optional[int] = Query(None, ge=2000, le=3000),
    month: Optional[int] = Query(None, ge=1, le=12),
    upcoming: bool = Query(False),
    limit: Optional[int] = Query(None, ge=1, le=200),
):
    items = holiday_service.list_(
        db,
        current_user.school_id,
        year=year,
        month=month,
        upcoming=upcoming,
        limit=limit,
    )
    return [HolidayRead.model_validate(holiday_service.to_read_dict(h)) for h in items]


@router.patch("/{holiday_id}", response_model=HolidayRead)
def update(
    holiday_id: int,
    payload: HolidayUpdate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    h = holiday_service.update(db, holiday_id, current_user.school_id, payload)
    return HolidayRead.model_validate(holiday_service.to_read_dict(h))


@router.delete("/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    holiday_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    holiday_service.delete(db, holiday_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
