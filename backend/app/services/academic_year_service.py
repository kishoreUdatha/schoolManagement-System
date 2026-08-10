from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.academic import AcademicYear
from app.schemas.academic_year import AcademicYearCreate, AcademicYearUpdate


def _get_year(db: Session, year_id: int, school_id: int) -> AcademicYear:
    year = db.get(AcademicYear, year_id)
    if not year or year.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Academic year not found"
        )
    return year


def create_year(
    db: Session, tenant_id: int, school_id: int, data: AcademicYearCreate
) -> AcademicYear:
    year = AcademicYear(
        tenant_id=tenant_id,
        school_id=school_id,
        name=data.name.strip(),
        start_date=data.start_date,
        end_date=data.end_date,
        is_current=False,  # set later via _set_current to handle the only-one invariant
        is_archived=False,
    )
    db.add(year)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Academic year '{data.name}' already exists for this school",
        )

    if data.is_current:
        _set_current(db, year)

    db.commit()
    db.refresh(year)
    return year


def list_years(
    db: Session, school_id: int, *, include_archived: bool = False
) -> list[AcademicYear]:
    stmt = select(AcademicYear).where(AcademicYear.school_id == school_id)
    if not include_archived:
        stmt = stmt.where(AcademicYear.is_archived.is_(False))
    stmt = stmt.order_by(
        AcademicYear.is_current.desc(),
        AcademicYear.start_date.desc(),
    )
    return list(db.execute(stmt).scalars().all())


def get_year(db: Session, year_id: int, school_id: int) -> AcademicYear:
    return _get_year(db, year_id, school_id)


def update_year(
    db: Session, year_id: int, school_id: int, data: AcademicYearUpdate
) -> AcademicYear:
    year = _get_year(db, year_id, school_id)
    if year.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit an archived academic year. Unarchive it first.",
        )

    updates = data.model_dump(exclude_unset=True)
    # Cross-field date check using merged values
    start = updates.get("start_date", year.start_date)
    end = updates.get("end_date", year.end_date)
    if end <= start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be after start_date",
        )

    for field, value in updates.items():
        setattr(year, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another academic year with this name already exists",
        )

    db.refresh(year)
    return year


def _set_current(db: Session, year: AcademicYear) -> None:
    """Mark this year as current and clear is_current on all siblings."""
    db.execute(
        update(AcademicYear)
        .where(
            AcademicYear.school_id == year.school_id,
            AcademicYear.id != year.id,
        )
        .values(is_current=False)
    )
    year.is_current = True
    db.flush()


def set_current(db: Session, year_id: int, school_id: int) -> AcademicYear:
    year = _get_year(db, year_id, school_id)
    if year.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot mark an archived year as current. Unarchive it first.",
        )
    _set_current(db, year)
    db.commit()
    db.refresh(year)
    return year


def archive_year(db: Session, year_id: int, school_id: int) -> AcademicYear:
    year = _get_year(db, year_id, school_id)
    if year.is_current:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot archive the current academic year. Mark another year as current first.",
        )
    year.is_archived = True
    db.commit()
    db.refresh(year)
    return year


def unarchive_year(db: Session, year_id: int, school_id: int) -> AcademicYear:
    year = _get_year(db, year_id, school_id)
    year.is_archived = False
    db.commit()
    db.refresh(year)
    return year


def delete_year(db: Session, year_id: int, school_id: int) -> None:
    from app.services import student_service  # local import to avoid cycle

    year = _get_year(db, year_id, school_id)
    if year.is_current:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the current academic year. Archive it instead.",
        )
    enrolled = student_service.year_has_students(db, year.id)
    if enrolled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot delete academic year '{year.name}': "
                f"{enrolled} student record(s) reference it. Archive instead."
            ),
        )
    db.delete(year)
    db.commit()
