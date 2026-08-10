from datetime import time

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.tenant import School
from app.schemas.school_profile import SchoolProfileUpdate


def get_school(db: Session, school_id: int, tenant_id: int) -> School:
    school = db.get(School, school_id)
    if not school or school.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="School not found"
        )
    return school


def _validate_time_ranges(
    start: time | None, end: time | None, label: str
) -> None:
    if start is not None and end is not None and start >= end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label}: start time must be earlier than end time",
        )


def update_school_profile(
    db: Session, school_id: int, tenant_id: int, data: SchoolProfileUpdate
) -> School:
    school = get_school(db, school_id, tenant_id)

    updates = data.model_dump(exclude_unset=True)

    # Combine pending updates with current values for cross-field validation
    school_start = updates.get("school_start_time", school.school_start_time)
    school_end = updates.get("school_end_time", school.school_end_time)
    break_start = updates.get("break_start_time", school.break_start_time)
    break_end = updates.get("break_end_time", school.break_end_time)

    _validate_time_ranges(school_start, school_end, "School day")
    _validate_time_ranges(break_start, break_end, "Break")
    if (
        break_start is not None
        and school_start is not None
        and break_start < school_start
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Break cannot start before the school day starts",
        )
    if break_end is not None and school_end is not None and break_end > school_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Break cannot end after the school day ends",
        )

    for field, value in updates.items():
        setattr(school, field, value)

    db.commit()
    db.refresh(school)
    return school
