from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.academic import SchoolClass
from app.models.subject import ClassSubject, Subject
from app.schemas.subject import (
    ClassSubjectAssign,
    ClassSubjectUpdate,
    SubjectBulkCreate,
    SubjectCreate,
    SubjectUpdate,
)
from app.services import foundation_service


# --- Subject CRUD ---

def _get_subject(db: Session, subject_id: int, school_id: int) -> Subject:
    s = db.get(Subject, subject_id)
    if not s or s.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found"
        )
    return s


def _normalize_code(code: str) -> str:
    return code.strip().upper()


def create_subject(
    db: Session, tenant_id: int, school_id: int, data: SubjectCreate
) -> Subject:
    foundation_service.check_department(db, school_id, data.department_id)
    s = Subject(
        tenant_id=tenant_id,
        school_id=school_id,
        name=data.name.strip(),
        code=_normalize_code(data.code),
        kind=data.kind,
        display_order=data.display_order,
        department_id=data.department_id,
        is_active=True,
    )
    db.add(s)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"A subject with name '{data.name}' or code '{data.code}' "
                "already exists for this school"
            ),
        )
    db.refresh(s)
    return s


def list_subjects(
    db: Session, school_id: int, *, active_only: bool = True
) -> list[Subject]:
    stmt = select(Subject).where(Subject.school_id == school_id)
    if active_only:
        stmt = stmt.where(Subject.is_active.is_(True))
    stmt = stmt.order_by(Subject.display_order, Subject.name)
    return list(db.execute(stmt).scalars().all())


def get_subject(db: Session, subject_id: int, school_id: int) -> Subject:
    return _get_subject(db, subject_id, school_id)


def update_subject(
    db: Session, subject_id: int, school_id: int, data: SubjectUpdate
) -> Subject:
    s = _get_subject(db, subject_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    if updates.get("department_id") is not None:
        foundation_service.check_department(db, school_id, updates["department_id"])
    if "code" in updates and updates["code"]:
        updates["code"] = _normalize_code(updates["code"])
    if "name" in updates and updates["name"]:
        updates["name"] = updates["name"].strip()
    for field, value in updates.items():
        setattr(s, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another subject already uses this name or code",
        )
    db.refresh(s)
    return s


def delete_subject(db: Session, subject_id: int, school_id: int) -> None:
    s = _get_subject(db, subject_id, school_id)
    in_use = db.execute(
        select(func.count(ClassSubject.id)).where(ClassSubject.subject_id == s.id)
    ).scalar_one()
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Subject '{s.name}' is assigned to {in_use} class(es). "
                "Unassign it from those classes first."
            ),
        )
    db.delete(s)
    db.commit()


def bulk_create(
    db: Session, tenant_id: int, school_id: int, data: SubjectBulkCreate
) -> tuple[list[Subject], list[dict]]:
    created: list[Subject] = []
    errors: list[dict] = []
    for idx, row in enumerate(data.subjects):
        s = Subject(
            tenant_id=tenant_id,
            school_id=school_id,
            name=row.name.strip(),
            code=_normalize_code(row.code),
            kind=row.kind,
            display_order=row.display_order,
            is_active=True,
        )
        # Use a SAVEPOINT so a duplicate row doesn't roll back successfully
        # inserted rows earlier in the loop.
        try:
            with db.begin_nested():
                db.add(s)
                db.flush()
            created.append(s)
        except IntegrityError:
            errors.append(
                {
                    "row": idx,
                    "name": row.name,
                    "code": row.code,
                    "error": "Duplicate name or code for this school",
                }
            )
    db.commit()
    for s in created:
        db.refresh(s)
    return created, errors


# --- Class-Subject assignments ---

def _get_class(db: Session, class_id: int, school_id: int) -> SchoolClass:
    cls = db.get(SchoolClass, class_id)
    if not cls or cls.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Class not found"
        )
    return cls


def _get_class_subject(
    db: Session, cs_id: int, school_id: int
) -> ClassSubject:
    cs = db.get(ClassSubject, cs_id)
    if not cs or cs.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class-subject assignment not found",
        )
    return cs


def assign_subject_to_class(
    db: Session,
    tenant_id: int,
    school_id: int,
    class_id: int,
    data: ClassSubjectAssign,
) -> ClassSubject:
    cls = _get_class(db, class_id, school_id)
    subject = _get_subject(db, data.subject_id, school_id)
    if not subject.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject is inactive",
        )

    if data.display_order is None:
        max_order = db.execute(
            select(func.coalesce(func.max(ClassSubject.display_order), -1)).where(
                ClassSubject.class_id == cls.id
            )
        ).scalar_one()
        order = int(max_order) + 1
    else:
        order = data.display_order

    cs = ClassSubject(
        tenant_id=tenant_id,
        school_id=school_id,
        class_id=cls.id,
        subject_id=subject.id,
        is_optional=data.is_optional,
        display_order=order,
    )
    db.add(cs)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Subject '{subject.name}' is already assigned to this class",
        )
    db.refresh(cs)
    # Ensure subject relationship is loaded for response
    db.refresh(cs.subject)
    return cs


def list_class_subjects(
    db: Session, class_id: int, school_id: int
) -> list[ClassSubject]:
    _get_class(db, class_id, school_id)
    stmt = (
        select(ClassSubject)
        .where(ClassSubject.class_id == class_id)
        .options(selectinload(ClassSubject.subject))
        .order_by(ClassSubject.display_order, ClassSubject.id)
    )
    return list(db.execute(stmt).scalars().all())


def update_class_subject(
    db: Session, cs_id: int, school_id: int, data: ClassSubjectUpdate
) -> ClassSubject:
    from app.services import staff_service  # local import to avoid cycle

    cs = _get_class_subject(db, cs_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    if "teacher_user_id" in updates and updates["teacher_user_id"] is not None:
        staff_service.validate_teacher_for_school(
            db, updates["teacher_user_id"], school_id
        )
    if updates.get("room_id") is not None:
        from app.models.facility import Room

        room = db.get(Room, updates["room_id"])
        if not room or room.school_id != school_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    if "periods_per_week" in updates and updates["periods_per_week"] is None:
        updates.pop("periods_per_week")  # the column is not nullable; 0 means unset
    for field, value in updates.items():
        setattr(cs, field, value)
    db.commit()
    db.refresh(cs)
    return cs


def remove_class_subject(db: Session, cs_id: int, school_id: int) -> None:
    from app.models.exam import ExamSubject

    cs = _get_class_subject(db, cs_id, school_id)
    papers = db.execute(
        select(func.count(ExamSubject.id)).where(ExamSubject.class_subject_id == cs.id)
    ).scalar_one()
    if papers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{papers} exam paper(s) use this subject in this class. Remove those papers first.",
        )
    db.delete(cs)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Records still depend on this subject in this class, so it can't be removed.",
        )
