from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.enums import MarkStatus
from app.models.academic import SchoolClass, Section
from app.models.exam import Exam, ExamSubject
from app.models.mark import Mark
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.schemas.mark import MarkEntry


def _grade_and_pass(db: Session, exam: Exam, marks: int, max_marks: int, pass_marks: int) -> tuple[str, bool]:
    from app.services import grading_service

    pct = (marks / max_marks * 100) if max_marks else 0
    grade, _points, band_pass = grading_service.grade_for(grading_service.scale_for_exam(db, exam), pct)
    # the paper's pass marks win; a scale band only decides pass/fail if it's stricter
    is_pass = marks >= pass_marks and (band_pass is not False)
    return grade, is_pass


def _check_teacher_owns_paper(
    db: Session, paper_id: int, school_id: int, teacher_user_id: int
) -> tuple[ExamSubject, ClassSubject, Exam]:
    p = db.get(ExamSubject, paper_id)
    if not p or p.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exam paper not found"
        )
    cs = db.get(ClassSubject, p.class_subject_id)
    if not cs or cs.teacher_user_id != teacher_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't teach this subject in this class",
        )
    e = db.get(Exam, p.exam_id)
    if not e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found"
        )
    return p, cs, e


def list_my_papers(
    db: Session, teacher_user_id: int, school_id: int
) -> list[dict]:
    """Every exam paper the teacher is responsible for, with per-paper progress."""
    rows = db.execute(
        select(ExamSubject, Exam, ClassSubject, Subject, SchoolClass)
        .join(Exam, ExamSubject.exam_id == Exam.id)
        .join(ClassSubject, ExamSubject.class_subject_id == ClassSubject.id)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .join(SchoolClass, ClassSubject.class_id == SchoolClass.id)
        .where(
            ExamSubject.school_id == school_id,
            ClassSubject.teacher_user_id == teacher_user_id,
        )
        .order_by(ExamSubject.exam_date.desc(), Exam.start_date.desc())
    ).all()

    out = []
    for paper, exam, cs, subj, cls in rows:
        # Section count + total students in this class
        sections = db.execute(
            select(Section).where(Section.class_id == cls.id)
        ).scalars().all()
        section_ids = [s.id for s in sections]
        student_count = (
            db.execute(
                select(func.count(Student.id)).where(
                    Student.section_id.in_(section_ids),
                    Student.is_active.is_(True),
                )
            ).scalar_one()
            if section_ids
            else 0
        )
        marks_entered = db.execute(
            select(func.count(Mark.id)).where(Mark.exam_subject_id == paper.id)
        ).scalar_one()
        out.append(
            {
                "exam_paper_id": paper.id,
                "exam_id": exam.id,
                "exam_name": exam.name,
                "exam_kind": exam.kind.value,
                "exam_is_published": exam.is_published,
                "subject_name": subj.name,
                "subject_code": subj.code,
                "class_id": cls.id,
                "class_name": cls.name,
                "exam_date": paper.exam_date,
                "max_marks": paper.max_marks,
                "pass_marks": paper.pass_marks,
                "duration_minutes": paper.duration_minutes,
                "section_count": len(sections),
                "students_in_class": int(student_count),
                "marks_entered": int(marks_entered),
            }
        )
    return out


def get_marks_view(
    db: Session,
    teacher_user_id: int,
    school_id: int,
    paper_id: int,
    section_id: int,
) -> dict:
    paper, cs, exam = _check_teacher_owns_paper(
        db, paper_id, school_id, teacher_user_id
    )
    sec = db.get(Section, section_id)
    if not sec or sec.class_id != cs.class_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Section does not belong to this paper's class",
        )
    cls = db.get(SchoolClass, cs.class_id)
    subject = db.get(Subject, cs.subject_id)

    students = db.execute(
        select(Student)
        .where(Student.section_id == section_id, Student.is_active.is_(True))
        .order_by(Student.roll_no, Student.full_name)
    ).scalars().all()

    existing = db.execute(
        select(Mark).where(
            Mark.exam_subject_id == paper.id,
            Mark.student_id.in_([s.id for s in students]),
        )
    ).scalars().all()
    by_student = {m.student_id: m for m in existing}

    summary = {
        "scored": 0,
        "absent": 0,
        "exempt": 0,
        "unmarked": 0,
        "pass": 0,
        "fail": 0,
    }
    rows = []
    for s in students:
        m = by_student.get(s.id)
        if m:
            summary[m.status.value] += 1
            if m.status == MarkStatus.scored:
                if m.is_pass:
                    summary["pass"] += 1
                else:
                    summary["fail"] += 1
        else:
            summary["unmarked"] += 1

        rows.append(
            {
                "student_id": s.id,
                "admission_no": s.admission_no,
                "roll_no": s.roll_no,
                "full_name": s.full_name,
                "status": m.status if m else None,
                "marks_obtained": m.marks_obtained if m else None,
                "grade": m.grade if m else None,
                "is_pass": m.is_pass if m else None,
                "remark": m.remark if m else None,
                "marked_by_user_id": m.marked_by_user_id if m else None,
                "marked_at": m.marked_at if m else None,
            }
        )

    return {
        "exam_id": exam.id,
        "exam_name": exam.name,
        "exam_paper_id": paper.id,
        "subject_name": subject.name if subject else None,
        "subject_code": subject.code if subject else None,
        "class_id": cls.id,
        "class_name": cls.name if cls else None,
        "section_id": sec.id,
        "section_label": f"{cls.name} {sec.name}" if cls else sec.name,
        "max_marks": paper.max_marks,
        "pass_marks": paper.pass_marks,
        "exam_date": paper.exam_date,
        "is_published": exam.is_published,
        "is_editable": not exam.is_published,
        "rows": rows,
        "summary": summary,
    }


def save_marks(
    db: Session,
    tenant_id: int,
    school_id: int,
    teacher_user_id: int,
    paper_id: int,
    section_id: int,
    entries: list[MarkEntry],
) -> dict:
    paper, cs, exam = _check_teacher_owns_paper(
        db, paper_id, school_id, teacher_user_id
    )
    if exam.is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam is published — marks are locked. Ask school admin to unpublish.",
        )

    sec = db.get(Section, section_id)
    if not sec or sec.class_id != cs.class_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Section does not belong to this paper's class",
        )

    valid_student_ids = {
        s.id
        for s in db.execute(
            select(Student).where(
                Student.section_id == section_id, Student.is_active.is_(True)
            )
        ).scalars().all()
    }

    now = datetime.now(timezone.utc)
    saved = 0
    skipped = 0
    errors: list[dict] = []

    for e in entries:
        if e.student_id not in valid_student_ids:
            errors.append({"student_id": e.student_id, "error": "Not in this section"})
            skipped += 1
            continue

        if e.status == MarkStatus.scored:
            if e.marks_obtained is None:
                errors.append(
                    {
                        "student_id": e.student_id,
                        "error": "marks_obtained required for scored",
                    }
                )
                skipped += 1
                continue
            if e.marks_obtained > paper.max_marks:
                errors.append(
                    {
                        "student_id": e.student_id,
                        "error": f"Exceeds max marks ({paper.max_marks})",
                    }
                )
                skipped += 1
                continue
            grade, is_pass = _grade_and_pass(
                db, exam, e.marks_obtained, paper.max_marks, paper.pass_marks
            )
            marks_value = e.marks_obtained
        elif e.status == MarkStatus.absent:
            marks_value = 0
            grade = None
            is_pass = False
        else:  # exempt
            marks_value = None
            grade = None
            is_pass = None

        stmt = (
            pg_insert(Mark.__table__)
            .values(
                tenant_id=tenant_id,
                school_id=school_id,
                exam_subject_id=paper.id,
                student_id=e.student_id,
                status=e.status.value,
                marks_obtained=marks_value,
                grade=grade,
                is_pass=is_pass,
                remark=e.remark,
                marked_by_user_id=teacher_user_id,
                marked_at=now,
            )
            .on_conflict_do_update(
                constraint="uq_mark_per_paper_student",
                set_={
                    "status": e.status.value,
                    "marks_obtained": marks_value,
                    "grade": grade,
                    "is_pass": is_pass,
                    "remark": e.remark,
                    "marked_by_user_id": teacher_user_id,
                    "marked_at": now,
                },
            )
        )
        db.execute(stmt)
        saved += 1

    db.commit()
    return {"saved": saved, "skipped": skipped, "errors": errors}


def mark_all_absent(
    db: Session,
    tenant_id: int,
    school_id: int,
    teacher_user_id: int,
    paper_id: int,
    section_id: int,
) -> dict:
    """Mark every unmarked student in this section+paper as absent."""
    paper, cs, exam = _check_teacher_owns_paper(
        db, paper_id, school_id, teacher_user_id
    )
    if exam.is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam is published — marks are locked.",
        )
    sec = db.get(Section, section_id)
    if not sec or sec.class_id != cs.class_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Section does not belong to this paper's class",
        )

    student_ids = [
        s.id
        for s in db.execute(
            select(Student).where(
                Student.section_id == section_id, Student.is_active.is_(True)
            )
        ).scalars().all()
    ]
    if not student_ids:
        return {"saved": 0, "skipped": 0, "errors": []}

    marked_ids = set(
        db.execute(
            select(Mark.student_id).where(
                Mark.exam_subject_id == paper.id,
                Mark.student_id.in_(student_ids),
            )
        ).scalars().all()
    )
    unmarked = [sid for sid in student_ids if sid not in marked_ids]

    now = datetime.now(timezone.utc)
    for sid in unmarked:
        db.add(
            Mark(
                tenant_id=tenant_id,
                school_id=school_id,
                exam_subject_id=paper.id,
                student_id=sid,
                status=MarkStatus.absent,
                marks_obtained=0,
                grade=None,
                is_pass=False,
                marked_by_user_id=teacher_user_id,
                marked_at=now,
            )
        )
    db.commit()
    return {"saved": len(unmarked), "skipped": 0, "errors": []}
