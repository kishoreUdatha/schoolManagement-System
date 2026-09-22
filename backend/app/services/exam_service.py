from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.academic import AcademicYear, SchoolClass
from app.models.exam import Exam, ExamSubject
from app.models.grading import ExamType, GradeScale
from app.models.subject import ClassSubject, Subject
from app.models.user import User
from app.schemas.exam import (
    ExamCreate,
    ExamPaperCreate,
    ExamPaperUpdate,
    ExamUpdate,
)
from app.services import foundation_service


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
        "start_time": p.start_time,
        "duration_minutes": p.duration_minutes,
        "marks_entered_count": _marks_entered_for_paper(db, p.id),
        "marks_verified_at": p.marks_verified_at,
        "marks_verified_by_name": (
            db.get(User, p.marks_verified_by_user_id).full_name if p.marks_verified_by_user_id else None
        ),
        "marks_verified_count": p.marks_verified_count,
    }


def _class_names(db: Session, ids: list[int]) -> list[str]:
    if not ids:
        return []
    rows = db.execute(select(SchoolClass.id, SchoolClass.name).where(SchoolClass.id.in_(ids))).all()
    by_id = dict(rows)
    return [by_id[i] for i in ids if i in by_id]


def _check_classes(db: Session, school_id: int, ids: Optional[list[int]]) -> Optional[list[int]]:
    """Keep the order given, drop repeats, and refuse another school's class."""
    if ids is None:
        return None
    clean = list(dict.fromkeys(ids))
    if not clean:
        return None
    found = set(db.execute(
        select(SchoolClass.id).where(SchoolClass.id.in_(clean), SchoolClass.school_id == school_id)
    ).scalars())
    if len(found) != len(clean):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown class")
    return clean


def _check_result_date(start: date, end: date, result_date: Optional[date]) -> None:
    if result_date and result_date < end:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="The result date is before the exam ends")


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
        "term_id": e.term_id,
        "exam_type_id": e.exam_type_id,
        "exam_type_name": db.get(ExamType, e.exam_type_id).name if e.exam_type_id else None,
        "grade_scale_id": e.grade_scale_id,
        "results_approved_at": e.results_approved_at,
        "marks_open": e.marks_open,
        "marks_closed_at": e.marks_closed_at,
        "revision_no": e.revision_no,
        "revised_at": e.revised_at,
        "revision_reason": e.revision_reason,
        "class_ids": list(e.class_ids or []),
        "class_names": _class_names(db, e.class_ids or []),
        "result_date": e.result_date,
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

    foundation_service.check_term(db, school_id, year.id, data.term_id)
    _check_result_date(data.start_date, data.end_date, data.result_date)
    e = Exam(
        class_ids=_check_classes(db, school_id, data.class_ids),
        result_date=data.result_date,
        tenant_id=tenant_id,
        school_id=school_id,
        academic_year_id=year.id,
        term_id=data.term_id,
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
    if updates.get("exam_type_id") is not None:
        t = db.get(ExamType, updates["exam_type_id"])
        if not t or t.school_id != school_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown exam type")
    if updates.get("grade_scale_id") is not None:
        sc = db.get(GradeScale, updates["grade_scale_id"])
        if not sc or sc.school_id != school_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown grade scale")
    if updates.get("term_id") is not None:
        foundation_service.check_term(db, school_id, e.academic_year_id, updates["term_id"])
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
    _check_result_date(new_start, new_end, updates.get("result_date", e.result_date))
    if "class_ids" in updates:
        updates["class_ids"] = _check_classes(db, school_id, updates["class_ids"])
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
    from app.services import grading_service

    grading_service.check_publishable(db, e)
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


# ----- Marks window, verification and revisions -----


def set_marks_window(db: Session, exam_id: int, school_id: int, user_id: int, open_: bool) -> Exam:
    """Open or close marks entry for a whole exam.

    Closing is how the office says "that's everything in" — teachers stop being
    able to change marks without asking, and the school knows what it is
    publishing. It can be opened again; that is a decision someone makes, not a
    side effect of the calendar.
    """
    e = _get_exam(db, exam_id, school_id)
    if e.is_published and open_:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Results are published — unpublish or revise the exam before reopening marks",
        )
    e.marks_open = open_
    e.marks_closed_at = None if open_ else datetime.now(timezone.utc)
    db.commit()
    db.refresh(e)
    return e


def paper_marks(db: Session, paper_id: int, school_id: int) -> dict:
    """Every child who sits one paper (the active students of its class, all
    sections) with the mark entered for them, for checking before sign-off."""
    from app.models.academic import Section
    from app.models.mark import Mark
    from app.models.student import Student

    paper = _get_paper(db, paper_id, school_id)
    cs = db.get(ClassSubject, paper.class_subject_id)
    sections = dict(db.execute(select(Section.id, Section.name).where(Section.class_id == cs.class_id)).all()) if cs else {}
    students = list(db.execute(
        select(Student).where(Student.section_id.in_(list(sections)), Student.is_active.is_(True))
        .order_by(Student.section_id, Student.roll_no, Student.full_name)
    ).scalars()) if sections else []
    marks = {m.student_id: m for m in db.execute(
        select(Mark).where(Mark.exam_subject_id == paper.id)
    ).scalars()}
    names = dict(db.execute(select(User.id, User.full_name).where(
        User.id.in_({m.marked_by_user_id for m in marks.values() if m.marked_by_user_id})
    )).all()) if marks else {}
    rows = []
    for s in students:
        m = marks.get(s.id)
        rows.append({
            "student_id": s.id, "admission_no": s.admission_no, "roll_no": s.roll_no,
            "full_name": s.full_name, "section_name": sections.get(s.section_id),
            "status": m.status.value if m else None,
            "marks_obtained": m.marks_obtained if m else None,
            "grade": m.grade if m else None, "is_pass": m.is_pass if m else None,
            "remark": m.remark if m else None,
            "marked_by_name": names.get(m.marked_by_user_id) if m else None,
        })
    return {"paper_id": paper.id, "max_marks": paper.max_marks, "pass_marks": paper.pass_marks, "rows": rows}


def verify_paper(db: Session, paper_id: int, school_id: int, user_id: int, verified: bool) -> ExamSubject:
    """A second pair of eyes signing off one paper's marks.

    Whoever entered the marks can't verify them — that would make the check
    ceremonial. Verification is cleared whenever the marks change, so a
    signed-off paper always reflects the marks that were actually checked.
    """
    paper = db.get(ExamSubject, paper_id)
    if not paper or paper.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paper not found")
    if not verified:
        paper.marks_verified_at = None
        paper.marks_verified_by_user_id = None
        paper.marks_verified_count = None
        db.commit()
        db.refresh(paper)
        return paper

    from app.models.mark import Mark

    rows = list(db.execute(select(Mark).where(Mark.exam_subject_id == paper.id)).scalars())
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No marks have been entered for this paper yet"
        )
    entered_by = {m.marked_by_user_id for m in rows if m.marked_by_user_id}
    if entered_by == {user_id}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Marks are verified by someone other than whoever entered them",
        )
    paper.marks_verified_at = datetime.now(timezone.utc)
    paper.marks_verified_by_user_id = user_id
    paper.marks_verified_count = len(rows)
    db.commit()
    db.refresh(paper)
    return paper


def clear_verification(db: Session, paper_id: int) -> None:
    """Called when marks change: a checked paper that moves is unchecked."""
    paper = db.get(ExamSubject, paper_id)
    if paper and paper.marks_verified_at is not None:
        paper.marks_verified_at = None
        paper.marks_verified_by_user_id = None
        paper.marks_verified_count = None


def revise(db: Session, exam_id: int, school_id: int, user_id: int, reason: str) -> Exam:
    """Take a published result set back for correction, on the record.

    Parents have already seen these results, so this isn't a quiet unpublish:
    the reason is kept, the revision number goes up, and report cards issued
    afterwards say which revision they are. Marks entry reopens so the
    correction can actually be made.
    """
    e = _get_exam(db, exam_id, school_id)
    if not e.is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This exam isn't published — correct the marks and publish when ready",
        )
    e.is_published = False
    e.published_at = None
    e.marks_open = True
    e.marks_closed_at = None
    e.revision_no = (e.revision_no or 1) + 1
    e.revised_at = datetime.now(timezone.utc)
    e.revised_by_user_id = user_id
    e.revision_reason = reason.strip()[:500]
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
        start_time=data.start_time,
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
