from datetime import date
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.holiday import Holiday
from app.schemas.holiday import HolidayCreate, HolidayUpdate


def _get(db: Session, holiday_id: int, school_id: int) -> Holiday:
    h = db.get(Holiday, holiday_id)
    if not h or h.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Holiday not found"
        )
    return h


def to_read_dict(h: Holiday) -> dict:
    return {
        "id": h.id,
        "name": h.name,
        "type": h.type,
        "start_date": h.start_date,
        "end_date": h.end_date,
        "description": h.description,
        "days": (h.end_date - h.start_date).days + 1,
        "created_at": h.created_at,
    }


def create(
    db: Session, tenant_id: int, school_id: int, data: HolidayCreate
) -> Holiday:
    h = Holiday(
        tenant_id=tenant_id,
        school_id=school_id,
        name=data.name.strip(),
        type=data.type,
        start_date=data.start_date,
        end_date=data.end_date,
        description=data.description.strip() if data.description else None,
    )
    db.add(h)
    db.commit()
    db.refresh(h)
    return h


def list_(
    db: Session,
    school_id: int,
    *,
    year: Optional[int] = None,
    month: Optional[int] = None,
    upcoming: bool = False,
    limit: Optional[int] = None,
) -> list[Holiday]:
    stmt = (
        select(Holiday)
        .where(Holiday.school_id == school_id)
        .order_by(Holiday.start_date)
    )

    if upcoming:
        today = date.today()
        stmt = stmt.where(Holiday.end_date >= today)
    elif year and month:
        # Any holiday whose range overlaps with this month
        from calendar import monthrange
        month_start = date(year, month, 1)
        month_end = date(year, month, monthrange(year, month)[1])
        stmt = stmt.where(
            Holiday.start_date <= month_end, Holiday.end_date >= month_start
        )
    elif year:
        year_start = date(year, 1, 1)
        year_end = date(year, 12, 31)
        stmt = stmt.where(
            Holiday.start_date <= year_end, Holiday.end_date >= year_start
        )

    if limit:
        stmt = stmt.limit(limit)
    return list(db.execute(stmt).scalars().all())


def update(
    db: Session, holiday_id: int, school_id: int, data: HolidayUpdate
) -> Holiday:
    h = _get(db, holiday_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"]:
        updates["name"] = updates["name"].strip()
    if "description" in updates:
        updates["description"] = (
            updates["description"].strip() if updates["description"] else None
        )
    # Cross-field date check using merged values
    new_start = updates.get("start_date", h.start_date)
    new_end = updates.get("end_date", h.end_date)
    if new_end < new_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be on or after start_date",
        )
    for field, value in updates.items():
        setattr(h, field, value)
    db.commit()
    db.refresh(h)
    return h


def delete(db: Session, holiday_id: int, school_id: int) -> None:
    h = _get(db, holiday_id, school_id)
    db.delete(h)
    db.commit()


def is_holiday(db: Session, school_id: int, on_date: date) -> bool:
    """Used later by attendance: returns True if date falls inside any holiday."""
    return (
        db.execute(
            select(Holiday.id).where(
                Holiday.school_id == school_id,
                Holiday.start_date <= on_date,
                Holiday.end_date >= on_date,
            )
        ).first()
        is not None
    )
