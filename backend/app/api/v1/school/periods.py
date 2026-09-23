from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser, SchoolStructureReader
from app.database import get_db
from app.schemas.timetable import PeriodCreate, PeriodRead, PeriodUpdate
from app.services import timetable_service


router = APIRouter()


@router.post(
    "",
    response_model=PeriodRead,
    status_code=status.HTTP_201_CREATED,
    summary="Define a period in the school's weekly schedule",
)
def create(
    payload: PeriodCreate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    p = timetable_service.create_period(
        db, current_user.tenant_id, current_user.school_id, payload
    )
    return PeriodRead.model_validate(p)


@router.get(
    "",
    response_model=list[PeriodRead],
    summary="List all periods (sorted by day, then period number)",
)
def list_(
    current_user: SchoolStructureReader,
    db: Annotated[Session, Depends(get_db)],
):
    items = timetable_service.list_periods(db, current_user.school_id)
    return [PeriodRead.model_validate(p) for p in items]


@router.patch("/{period_id}", response_model=PeriodRead)
def update(
    period_id: int,
    payload: PeriodUpdate,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    p = timetable_service.update_period(
        db, period_id, current_user.school_id, payload
    )
    return PeriodRead.model_validate(p)


@router.delete("/{period_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    period_id: int,
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
):
    timetable_service.delete_period(db, period_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
