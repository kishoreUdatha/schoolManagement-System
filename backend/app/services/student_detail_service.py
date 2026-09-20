"""The rest of a child's file: what they study, how they have done, who they
are related to, and what happened when they left.

None of this needs a new table. Siblings are children who share a parent,
which the parent links already say; a leaver is a child whose enrolment ended
and whose record went inactive. Inventing an Alumni row would mean two places
that disagree about who has left the moment somebody edits one of them.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.enums import EnrollmentOutcome, MarkStatus
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.exam import Exam, ExamSubject
from app.models.foundation import StudentEnrollment
from app.models.mark import Mark
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.user import User


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _student(db: Session, school_id: int, student_id: int) -> Student:
    s = db.get(Student, student_id)
    if not s or s.school_id != school_id:
        raise _404("Student")
    return s


def _label(db: Session, s: Student) -> dict:
    section = db.get(Section, s.section_id) if s.section_id else None
    cls = db.get(SchoolClass, section.class_id) if section else None
    return {
        "student_id": s.id,
        "admission_no": s.admission_no,
        "full_name": s.full_name,
        "roll_no": s.roll_no,
        "class_name": cls.name if cls else None,
        "section_name": section.name if section else None,
        "is_active": s.is_active,
        "photo_url": s.photo_url,
    }


# ---------- what they study ----------


def academic(db: Session, school_id: int, student_id: int) -> dict:
    """Subjects this year, and the years behind them.

    The enrolment history already existed but only ever said which class. What
    a parent actually asks is which subjects, and who teaches them.
    """
    s = _student(db, school_id, student_id)
    section = db.get(Section, s.section_id) if s.section_id else None

    subjects = []
    if section:
        rows = db.execute(
            select(ClassSubject, Subject, User.full_name)
            .join(Subject, Subject.id == ClassSubject.subject_id)
            .join(User, User.id == ClassSubject.teacher_user_id, isouter=True)
            .where(ClassSubject.class_id == section.class_id)
            .order_by(Subject.name)
        ).all()
        subjects = [
            {
                "class_subject_id": cs.id,
                "subject_name": subj.name,
                "subject_code": subj.code,
                "kind": subj.kind.value if subj.kind else None,
                "teacher_name": teacher,
            }
            for cs, subj, teacher in rows
        ]

    history = []
    for e in db.execute(
        select(StudentEnrollment)
        .where(StudentEnrollment.student_id == student_id)
        .order_by(StudentEnrollment.academic_year_id.desc())
    ).scalars():
        year = db.get(AcademicYear, e.academic_year_id)
        sec = db.get(Section, e.section_id) if e.section_id else None
        cls = db.get(SchoolClass, sec.class_id) if sec else None
        history.append({
            "enrollment_id": e.id,
            "academic_year_name": year.name if year else None,
            "class_name": cls.name if cls else None,
            "section_name": sec.name if sec else None,
            "roll_no": e.roll_no,
            "outcome": e.outcome.value if e.outcome else None,
        })

    return {**_label(db, s), "subjects": subjects, "history": history}


# ---------- how they have done ----------


def exam_history(db: Session, school_id: int, student_id: int) -> dict:
    """Every published exam this child sat, paper by paper.

    The admin already had a per-section view; asking it about one child meant
    finding them in a list of thirty. This is the same numbers, the other way
    round.
    """
    s = _student(db, school_id, student_id)
    section = db.get(Section, s.section_id) if s.section_id else None
    if not section:
        return {**_label(db, s), "exams": []}

    exams = list(db.execute(
        select(Exam)
        .where(Exam.school_id == school_id, Exam.is_published.is_(True))
        .order_by(Exam.start_date.desc())
    ).scalars())

    out = []
    for exam in exams:
        papers = db.execute(
            select(ExamSubject, Subject.name, Subject.code)
            .join(ClassSubject, ClassSubject.id == ExamSubject.class_subject_id)
            .join(Subject, Subject.id == ClassSubject.subject_id, isouter=True)
            .where(ExamSubject.exam_id == exam.id, ClassSubject.class_id == section.class_id)
            .order_by(ExamSubject.exam_date)
        ).all()
        if not papers:
            continue
        marks = {
            m.exam_subject_id: m for m in db.execute(
                select(Mark).where(
                    Mark.student_id == student_id,
                    Mark.exam_subject_id.in_([p.id for p, _, _ in papers]),
                )
            ).scalars()
        }
        subjects, obtained, out_of = [], 0, 0
        for p, name, code in papers:
            m = marks.get(p.id)
            subjects.append({
                "subject_name": name or "Unknown subject",
                "subject_code": code,
                "max_marks": p.max_marks,
                "pass_marks": p.pass_marks,
                "marks_obtained": m.marks_obtained if m else None,
                "grade": m.grade if m else None,
                "status": m.status.value if m else None,
                "is_pass": m.is_pass if m else None,
            })
            if m and m.marks_obtained is not None and m.status == MarkStatus.scored:
                obtained += m.marks_obtained
                out_of += p.max_marks
        out.append({
            "exam_id": exam.id,
            "exam_name": exam.name,
            "kind": exam.kind.value,
            "start_date": exam.start_date,
            "subjects": subjects,
            "obtained": obtained,
            "out_of": out_of,
            "percent": round(obtained / out_of * 100, 1) if out_of else 0.0,
            "marked": sum(1 for x in subjects if x["marks_obtained"] is not None),
        })
    return {**_label(db, s), "exams": out}


# ---------- who they are related to ----------


def family(db: Session, school_id: int, student_id: int) -> dict:
    """Parents, and the other children those parents have here.

    Siblings are not recorded anywhere and should not be: they are a
    consequence of two children sharing a parent, and a stored list would go
    stale the first time somebody corrects a link.
    """
    s = _student(db, school_id, student_id)

    parent_ids = list(db.execute(
        select(ParentStudent.parent_user_id).where(ParentStudent.student_id == student_id)
    ).scalars())

    parents = []
    for pid in parent_ids:
        u = db.get(User, pid)
        link = db.execute(
            select(ParentStudent).where(
                ParentStudent.parent_user_id == pid, ParentStudent.student_id == student_id
            )
        ).scalar_one_or_none()
        if u:
            parents.append({
                "user_id": u.id,
                "full_name": u.full_name,
                "email": u.email,
                "phone": u.phone,
                "relation": link.relation.value if link and link.relation else None,
                "is_active": u.is_active,
            })

    siblings = []
    if parent_ids:
        sib_ids = set(db.execute(
            select(ParentStudent.student_id).where(
                ParentStudent.parent_user_id.in_(parent_ids),
                ParentStudent.student_id != student_id,
            )
        ).scalars())
        for sid in sorted(sib_ids):
            other = db.get(Student, sid)
            if other and other.school_id == school_id:
                shared = list(db.execute(
                    select(ParentStudent.parent_user_id).where(
                        ParentStudent.student_id == sid,
                        ParentStudent.parent_user_id.in_(parent_ids),
                    )
                ).scalars())
                row = _label(db, other)
                row["shared_parents"] = [
                    db.get(User, p).full_name for p in shared if db.get(User, p)
                ]
                siblings.append(row)

    return {**_label(db, s), "parents": parents, "siblings": siblings}


# ---------- what happened when they left ----------


def leavers(db: Session, school_id: int, *, year_id: Optional[int] = None) -> dict:
    """Children who are no longer studying here.

    Derived rather than stored: a leaver is an inactive student, and the
    enrolment history already says which year they left from and why. The
    certificate, if one was issued, is looked up by the same student id.
    """
    from app.models.document import CertificateIssue

    stmt = select(Student).where(
        Student.school_id == school_id, Student.is_active.is_(False)
    )
    rows = list(db.execute(stmt.order_by(Student.full_name)).scalars())

    out = []
    for s in rows:
        last = db.execute(
            select(StudentEnrollment)
            .where(StudentEnrollment.student_id == s.id)
            .order_by(StudentEnrollment.academic_year_id.desc())
        ).scalars().first()
        if year_id and (not last or last.academic_year_id != year_id):
            continue
        year = db.get(AcademicYear, last.academic_year_id) if last else None
        sec = db.get(Section, last.section_id) if last and last.section_id else None
        cls = db.get(SchoolClass, sec.class_id) if sec else None
        cert = db.execute(
            select(CertificateIssue)
            .where(CertificateIssue.student_id == s.id)
            .order_by(CertificateIssue.created_at.desc())
        ).scalars().first()
        out.append({
            **_label(db, s),
            "last_year_name": year.name if year else None,
            "last_class_name": cls.name if cls else None,
            "last_section_name": sec.name if sec else None,
            "outcome": last.outcome.value if last and last.outcome else None,
            "certificate_id": cert.id if cert else None,
            "certificate_no": getattr(cert, "serial_no", None) if cert else None,
            "certificate_status": cert.status.value if cert and cert.status else None,
        })

    return {
        "leavers": out,
        "total": len(out),
        "without_certificate": sum(1 for r in out if not r["certificate_id"]),
    }
