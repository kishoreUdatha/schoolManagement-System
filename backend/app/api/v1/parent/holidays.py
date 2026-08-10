from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import ParentUser
from app.database import get_db
from app.schemas.holiday import HolidayRead
from app.services import holiday_service


router = APIRouter()


@router.get(
    "",
    response_model=list[HolidayRead],
    summary="Read-only holiday list for the parent's school",
)
def list_(
    current_user: ParentUser,
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
