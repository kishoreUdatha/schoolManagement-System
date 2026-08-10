from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.academic import AcademicYear, SchoolClass
from app.models.exam import Exam, ExamSubject
from app.models.subject import ClassSubject, Subject
from app.schemas.exam import (
    ExamCreate,
    ExamPaperCreate,
    ExamPaperUpdate,
    ExamUpdate,
)


def _get_exam(db: Session, exam_id: int, school_id: int) -> Exam:
    e = db.get(Exam, exam_id)
    if not e or e.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found"
        )
    return e


def _get_paper(db: Session, paper_id: int, school_id: int) -> ExamSubject:
    p = db.get(ExamSubject, paper_id)
    if not p or p.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exam paper not found"
        )
    return p


def _marks_entered_for_paper(db: Session, paper_id: int) -> int:
    """Count of marks rows for this paper."""
    from app.models.mark import Mark

    return db.execute(
        select(func.count(Mark.id)).where(Mark.exam_subject_id == paper_id)
    ).scalar_one()


def _paper_to_read_dict(db: Session, p: ExamSubject) -> dict:
    cs = db.get(ClassSubject, p.class_subject_id)
    subject = db.get(Subject, cs.subject_id) if cs else None
    cls = db.get(SchoolClass, cs.class_id) if cs else None
    return {
        "id": p.id,
        "exam_id": p.exam_id,
        "class_subject_id": p.class_subject_id,
        "subject_name": subject.name if subject else None,
        "subject_code": subject.code if subject else None,
        "class_name": cls.name if cls else None,
        "max_marks": p.max_marks,
        "pass_marks": p.pass_marks,
        "exam_date": p.exam_date,
        "duration_minutes": p.duration_minutes,
        "marks_entered_count": _marks_entered_for_paper(db, p.id),
    }


def _exam_to_read_dict(db: Session, e: Exam) -> dict:
    year = db.get(AcademicYear, e.academic_year_id)
    papers = sorted(e.papers, key=lambda p: (p.exam_date, p.id))
    paper_dicts = [_paper_to_read_dict(db, p) for p in papers]
    total = sum(d["marks_entered_count"] for d in paper_dicts)
    return {
        "id": e.id,
        "academic_year_id": e.academic_year_id,
        "academic_year_name": year.name if year else None,
        "name": e.name,
        "kind": e.kind,
        "start_date": e.start_date,
        "end_date": e.end_date,
        "is_published": e.is_published,
        "published_at": e.published_at,
        "created_at": e.created_at,
        "papers": paper_dicts,
        "papers_count": len(papers),
        "total_marks_entered": total,
    }


# ----- Exam CRUD -----

def create_exam(
    db: Session,
    tenant_id: int,
    school_id: int,
    actor_user_id: int,
    data: ExamCreate,
) -> Exam:
    year = db.get(AcademicYear, data.academic_year_id)
    if not year or year.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Academic year not found",
        )
    if year.is_archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create exam in an archived academic year",
        )

    e = Exam(
        tenant_id=tenant_id,
        school_id=school_id,
        academic_year_id=year.id,
        name=data.name.strip(),
        kind=data.kind,
        start_date=data.start_date,
        end_date=data.end_date,
        is_published=False,
        created_by_user_id=actor_user_id,
    )
    db.add(e)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An exam named '{data.name}' already exists for this academic year",
        )
    db.refresh(e)
    return e


def list_exams(
    db: Session, school_id: int, *, academic_year_id: Optional[int] = None
) -> list[Exam]:
    stmt = (
        select(Exam)
        .where(Exam.school_id == school_id)
        .options(selectinload(Exam.papers))
        .order_by(Exam.start_date.desc())
    )
    if academic_year_id:
        stmt = stmt.where(Exam.academic_year_id == academic_year_id)
    return list(db.execute(stmt).scalars().all())


def get_exam(db: Session, exam_id: int, school_id: int) -> Exam:
    e = db.execute(
        select(Exam)
        .where(Exam.id == exam_id, Exam.school_id == school_id)
        .options(selectinload(Exam.papers))
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found"
        )
    return e


def update_exam(
    db: Session, exam_id: int, school_id: int, data: ExamUpdate
) -> Exam:
    e = _get_exam(db, exam_id, school_id)
    if e.is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unpublish the exam before editing it",
        )
    updates = data.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"]:
        updates["name"] = updates["name"].strip()
    # Cross-field date check using merged values
    new_start = updates.get("start_date", e.start_date)
    new_end = updates.get("end_date", e.end_date)
    if new_end < new_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be on or after start_date",
        )
    for field, value in updates.items():
        setattr(e, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another exam with this name already exists for this year",
        )
    db.refresh(e)
    return e


def delete_exam(db: Session, exam_id: int, school_id: int) -> None:
    e = _get_exam(db, exam_id, school_id)
    if e.is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unpublish the exam before deleting it",
        )
    # Block delete if any marks have been entered for any paper
    for paper in e.papers:
        if _marks_entered_for_paper(db, paper.id) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Cannot delete exam — marks have already been entered "
                    "for at least one paper. Delete those marks first."
                ),
            )
    db.delete(e)
    db.commit()


def publish(db: Session, exam_id: int, school_id: int) -> Exam:
    e = _get_exam(db, exam_id, school_id)
    if not e.papers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add at least one subject paper before publishing",
        )
    e.is_published = True
    e.published_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(e)
    return e


def unpublish(db: Session, exam_id: int, school_id: int) -> Exam:
    e = _get_exam(db, exam_id, school_id)
    e.is_published = False
    e.published_at = None
    db.commit()
    db.refresh(e)
    return e


# ----- Exam paper CRUD -----

def create_paper(
    db: Session,
    tenant_id: int,
    school_id: int,
    exam_id: int,
    data: ExamPaperCreate,
) -> ExamSubject:
    e = _get_exam(db, exam_id, school_id)
    if e.is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unpublish the exam before changing its papers",
        )
    cs = db.get(ClassSubject, data.class_subject_id)
    if not cs or cs.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class-subject not found for this school",
        )
    # Optionally: ensure cs.class.academic_year_id == e.academic_year_id
    cls = db.get(SchoolClass, cs.class_id)
    if cls and cls.academic_year_id != e.academic_year_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Class-subject belongs to a different academic year than this exam",
        )

    p = ExamSubject(
        tenant_id=tenant_id,
        school_id=school_id,
        exam_id=exam_id,
        class_subject_id=cs.id,
        max_marks=data.max_marks,
        pass_marks=data.pass_marks,
        exam_date=data.exam_date,
        duration_minutes=data.duration_minutes,
    )
    db.add(p)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This subject is already a paper in this exam",
        )
    db.refresh(p)
    return p


def update_paper(
    db: Session, paper_id: int, school_id: int, data: ExamPaperUpdate
) -> ExamSubject:
    p = _get_paper(db, paper_id, school_id)
    e = _get_exam(db, p.exam_id, school_id)
    if e.is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unpublish the exam before editing its papers",
        )
    if _marks_entered_for_paper(db, p.id) > 0:
        # Allow date/duration tweaks, but block marks/pass changes once grades exist.
        updates = data.model_dump(exclude_unset=True)
        for f in ("max_marks", "pass_marks"):
            if f in updates and updates[f] != getattr(p, f):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Marks have already been entered — max_marks and "
                        "pass_marks are locked. You can still edit date/duration."
                    ),
                )

    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(p, field, value)
    if p.pass_marks > p.max_marks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="pass_marks cannot exceed max_marks",
        )
    db.commit()
    db.refresh(p)
    return p


def delete_paper(db: Session, paper_id: int, school_id: int) -> None:
    p = _get_paper(db, paper_id, school_id)
    e = _get_exam(db, p.exam_id, school_id)
    if e.is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unpublish the exam before removing its papers",
        )
    if _marks_entered_for_paper(db, p.id) > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Marks have been entered for this paper — delete those first",
        )
    db.delete(p)
    db.commit()


# ----- Upcoming exams (used by school dashboard widget) -----

def list_upcoming(
    db: Session, school_id: int, *, days: int = 7, limit: int = 5
) -> list[Exam]:
    today = date.today()
    horizon = today + timedelta(days=days)
    stmt = (
        select(Exam)
        .where(
            Exam.school_id == school_id,
            Exam.end_date >= today,
            Exam.start_date <= horizon,
        )
        .options(selectinload(Exam.papers))
        .order_by(Exam.start_date)
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())
