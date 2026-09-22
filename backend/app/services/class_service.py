from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.academic import AcademicYear, SchoolClass, Section
from app.schemas.class_section import (
    ClassCreate,
    ClassReorderRequest,
    ClassUpdate,
    SectionCreate,
    SectionUpdate,
)


def _get_year(db: Session, year_id: int, school_id: int) -> AcademicYear:
    year = db.get(AcademicYear, year_id)
    if not year or year.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Academic year not found"
        )
    if year.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify classes for an archived academic year",
        )
    return year


def _get_class(db: Session, class_id: int, school_id: int) -> SchoolClass:
    cls = db.get(SchoolClass, class_id)
    if not cls or cls.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Class not found"
        )
    return cls


def _get_section(db: Session, section_id: int, school_id: int) -> Section:
    sec = db.get(Section, section_id)
    if not sec or sec.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
        )
    return sec


# --- Classes ---

def create_class(
    db: Session, tenant_id: int, school_id: int, data: ClassCreate
) -> SchoolClass:
    _get_year(db, data.academic_year_id, school_id)

    if data.display_order is None:
        max_order = db.execute(
            select(func.coalesce(func.max(SchoolClass.display_order), -1)).where(
                SchoolClass.school_id == school_id,
                SchoolClass.academic_year_id == data.academic_year_id,
            )
        ).scalar_one()
        order = int(max_order) + 1
    else:
        order = data.display_order

    cls = SchoolClass(
        tenant_id=tenant_id,
        school_id=school_id,
        academic_year_id=data.academic_year_id,
        name=data.name.strip(),
        display_order=order,
    )
    db.add(cls)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A class named '{data.name}' already exists for this academic year",
        )
    db.refresh(cls)
    return cls


def list_classes(
    db: Session, school_id: int, academic_year_id: int
) -> list[SchoolClass]:
    stmt = (
        select(SchoolClass)
        .where(
            SchoolClass.school_id == school_id,
            SchoolClass.academic_year_id == academic_year_id,
        )
        .options(selectinload(SchoolClass.sections))
        .order_by(SchoolClass.display_order, SchoolClass.name)
    )
    return list(db.execute(stmt).scalars().all())


def get_class(db: Session, class_id: int, school_id: int) -> SchoolClass:
    cls = db.execute(
        select(SchoolClass)
        .where(SchoolClass.id == class_id, SchoolClass.school_id == school_id)
        .options(selectinload(SchoolClass.sections))
    ).scalar_one_or_none()
    if not cls:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Class not found"
        )
    return cls


def update_class(
    db: Session, class_id: int, school_id: int, data: ClassUpdate
) -> SchoolClass:
    cls = _get_class(db, class_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(cls, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another class with this name already exists in this academic year",
        )
    db.refresh(cls)
    return cls


def delete_class(db: Session, class_id: int, school_id: int) -> None:
    from app.services import student_service  # local import to avoid cycle

    cls = _get_class(db, class_id, school_id)
    enrolled = student_service.class_has_active_students(db, cls.id)
    if enrolled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot delete class '{cls.name}': {enrolled} active student(s) enrolled. "
                "Move or deactivate them first."
            ),
        )
    db.delete(cls)
    try:
        db.commit()
    except IntegrityError:
        # Former students, enrolment history or exam papers still point at it.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot delete class '{cls.name}': it has history (former students, "
                "enrolments or exam papers). Keep it, or remove that history first."
            ),
        )


def reorder_classes(
    db: Session, school_id: int, academic_year_id: int, data: ClassReorderRequest
) -> list[SchoolClass]:
    # Validate all class IDs belong to this school + year
    rows = db.execute(
        select(SchoolClass).where(
            SchoolClass.school_id == school_id,
            SchoolClass.academic_year_id == academic_year_id,
            SchoolClass.id.in_(data.class_ids),
        )
    ).scalars().all()
    found_ids = {c.id for c in rows}
    missing = [i for i in data.class_ids if i not in found_ids]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Class IDs not found for this academic year: {missing}",
        )

    for new_order, class_id in enumerate(data.class_ids):
        db.execute(
            update(SchoolClass)
            .where(SchoolClass.id == class_id)
            .values(display_order=new_order)
        )
    db.commit()
    return list_classes(db, school_id, academic_year_id)


# --- Sections ---

def create_section(
    db: Session, tenant_id: int, school_id: int, class_id: int, data: SectionCreate
) -> Section:
    cls = _get_class(db, class_id, school_id)

    section = Section(
        tenant_id=tenant_id,
        school_id=school_id,
        class_id=cls.id,
        name=data.name.strip().upper(),
        capacity=data.capacity,
    )
    db.add(section)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Section '{data.name}' already exists for this class",
        )
    db.refresh(section)
    return section


def update_section(
    db: Session, section_id: int, school_id: int, data: SectionUpdate
) -> Section:
    from app.services import staff_service  # local import to avoid cycle

    sec = _get_section(db, section_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"]:
        updates["name"] = updates["name"].strip().upper()
    if (
        "class_teacher_user_id" in updates
        and updates["class_teacher_user_id"] is not None
    ):
        staff_service.validate_teacher_for_school(
            db, updates["class_teacher_user_id"], school_id
        )
    for field, value in updates.items():
        setattr(sec, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another section with this name already exists in this class",
        )
    db.refresh(sec)
    return sec


def delete_section(db: Session, section_id: int, school_id: int) -> None:
    from app.services import student_service  # local import to avoid cycle

    sec = _get_section(db, section_id, school_id)
    enrolled = student_service.section_has_active_students(db, sec.id)
    if enrolled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot delete this section: {enrolled} active student(s) enrolled. "
                "Move or deactivate them first."
            ),
        )
    db.delete(sec)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Cannot delete this section: it has history (former students or "
                "enrolments). Keep it, or remove that history first."
            ),
        )
