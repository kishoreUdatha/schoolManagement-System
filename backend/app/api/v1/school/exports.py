"""Story 20.1 — Cross-module CSV exports for school admin.

One file with all exports keeps them discoverable in a single place.
Each endpoint accepts the same filter shapes as the parent JSON endpoints
(where applicable) and streams a CSV download.
"""
import csv
import io
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminOrAccountant, SchoolAdminUser
from app.core.enums import FeeStatus
from app.database import get_db
from app.models.academic import SchoolClass, Section
from app.models.behaviour import BehaviourRating
from app.models.exam import Exam, ExamSubject
from app.models.fee import FeeHead, StudentFee
from app.models.homework import Homework, HomeworkSubmission
from app.models.mark import Mark
from app.models.staff import Staff
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.user import User


router = APIRouter()


def _csv_response(filename: str, header: list[str], rows: list[list]) -> PlainTextResponse:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    return PlainTextResponse(
        buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ----- Students roster -----

@router.get(
    "/students.csv",
    response_class=PlainTextResponse,
    summary="Students roster (with filters)",
)
def students_csv(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    academic_year_id: Optional[int] = Query(None),
    class_id: Optional[int] = Query(None),
    section_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    stmt = (
        select(Student, Section, SchoolClass)
        .join(Section, Student.section_id == Section.id)
        .join(SchoolClass, Section.class_id == SchoolClass.id)
        .where(Student.school_id == current_user.school_id)
        .order_by(SchoolClass.name, Section.name, Student.roll_no)
    )
    if academic_year_id:
        stmt = stmt.where(Student.academic_year_id == academic_year_id)
    if section_id:
        stmt = stmt.where(Student.section_id == section_id)
    elif class_id:
        stmt = stmt.where(Section.class_id == class_id)
    if status_filter == "active":
        stmt = stmt.where(Student.is_active.is_(True))
    elif status_filter == "inactive":
        stmt = stmt.where(Student.is_active.is_(False))

    rows = [
        [
            s.admission_no,
            cls.name,
            sec.name,
            s.roll_no,
            s.full_name,
            (s.gender.value if s.gender else ""),
            (s.dob.isoformat() if s.dob else ""),
            s.blood_group or "",
            "active" if s.is_active else "inactive",
        ]
        for (s, sec, cls) in db.execute(stmt).all()
    ]
    return _csv_response(
        "students.csv",
        [
            "Admission #",
            "Class",
            "Section",
            "Roll #",
            "Name",
            "Gender",
            "DOB",
            "Blood",
            "Status",
        ],
        rows,
    )


# ----- Staff roster -----

@router.get(
    "/staff.csv",
    response_class=PlainTextResponse,
    summary="Staff roster",
)
def staff_csv(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    role: Optional[str] = Query(None),
):
    stmt = (
        select(Staff, User)
        .join(User, Staff.user_id == User.id)
        .where(Staff.school_id == current_user.school_id)
        .order_by(User.full_name)
    )
    if role:
        stmt = stmt.where(User.role == role)
    rows = [
        [
            s.employee_no,
            u.full_name,
            u.email or "",
            u.phone or "",
            u.role.value,
            s.designation or "",
            s.joining_date.isoformat() if s.joining_date else "",
            "active" if u.is_active else "inactive",
        ]
        for (s, u) in db.execute(stmt).all()
    ]
    return _csv_response(
        "staff.csv",
        [
            "Employee #",
            "Name",
            "Email",
            "Phone",
            "Role",
            "Designation",
            "Joined",
            "Status",
        ],
        rows,
    )


# ----- Fees collection -----

@router.get(
    "/fees.csv",
    response_class=PlainTextResponse,
    summary="Fee records with collection state",
)
def fees_csv(
    current_user: SchoolAdminOrAccountant,
    db: Annotated[Session, Depends(get_db)],
    status_filter: Optional[str] = Query(None, alias="status"),
    period: Optional[str] = Query(None),
):
    stmt = (
        select(StudentFee, Student, FeeHead)
        .join(Student, StudentFee.student_id == Student.id)
        .join(FeeHead, StudentFee.fee_head_id == FeeHead.id)
        .where(StudentFee.school_id == current_user.school_id)
        .order_by(StudentFee.due_date.desc())
    )
    if status_filter:
        try:
            stmt = stmt.where(StudentFee.status == FeeStatus(status_filter))
        except ValueError:
            pass
    if period:
        stmt = stmt.where(StudentFee.period == period)
    rows = []
    for (f, s, head) in db.execute(stmt).all():
        outstanding = (f.amount_due or 0) - (f.amount_paid or 0)
        rows.append(
            [
                s.admission_no,
                s.full_name,
                head.name,
                f.period,
                f.due_date.isoformat() if f.due_date else "",
                f.amount_due,
                f.amount_paid,
                outstanding,
                f.status.value,
                f.paid_at.isoformat() if f.paid_at else "",
                f.payment_mode or "",
                f.payment_ref or "",
            ]
        )
    return _csv_response(
        "fees.csv",
        [
            "Admission #",
            "Student",
            "Head",
            "Period",
            "Due date",
            "Amount due",
            "Amount paid",
            "Outstanding",
            "Status",
            "Paid at",
            "Mode",
            "Ref",
        ],
        rows,
    )


# ----- Marks per exam -----

@router.get(
    "/marks.csv",
    response_class=PlainTextResponse,
    summary="Marks roster for one exam (per paper, per student)",
)
def marks_csv(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    exam_id: int = Query(...),
):
    exam = db.get(Exam, exam_id)
    if not exam or exam.school_id != current_user.school_id:
        return _csv_response("marks.csv", ["error"], [["Exam not found"]])
    stmt = (
        select(Mark, Student, ExamSubject, Subject)
        .join(Student, Mark.student_id == Student.id)
        .join(ExamSubject, Mark.exam_subject_id == ExamSubject.id)
        .join(ClassSubject, ExamSubject.class_subject_id == ClassSubject.id)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .where(ExamSubject.exam_id == exam_id)
        .order_by(Subject.name, Student.full_name)
    )
    rows = [
        [
            s.admission_no,
            s.full_name,
            subj.name,
            es.max_marks,
            es.pass_marks,
            m.marks_obtained if m.marks_obtained is not None else "",
            m.grade or "",
            "pass" if m.is_pass else "fail" if m.is_pass is False else "",
            m.status.value,
            m.remark or "",
        ]
        for (m, s, es, subj) in db.execute(stmt).all()
    ]
    return _csv_response(
        f"marks_{exam.name}.csv".replace(" ", "_"),
        [
            "Admission #",
            "Student",
            "Subject",
            "Max",
            "Pass",
            "Obtained",
            "Grade",
            "Pass/Fail",
            "Status",
            "Remark",
        ],
        rows,
    )


# ----- Homework submission summary -----

@router.get(
    "/homework.csv",
    response_class=PlainTextResponse,
    summary="Homework with submission counts",
)
def homework_csv(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
):
    stmt = (
        select(Homework, Subject, SchoolClass)
        .join(ClassSubject, Homework.class_subject_id == ClassSubject.id)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .join(SchoolClass, ClassSubject.class_id == SchoolClass.id)
        .where(Homework.school_id == current_user.school_id)
        .order_by(Homework.due_date.desc())
    )
    if from_date:
        stmt = stmt.where(Homework.due_date >= from_date)
    if to_date:
        stmt = stmt.where(Homework.due_date <= to_date)

    from sqlalchemy import func
    rows = []
    for (h, subj, cls) in db.execute(stmt).all():
        sub_count = db.execute(
            select(func.count(HomeworkSubmission.id)).where(
                HomeworkSubmission.homework_id == h.id
            )
        ).scalar_one()
        rows.append(
            [
                cls.name,
                subj.name,
                subj.code,
                h.title,
                h.due_date.isoformat(),
                int(sub_count),
            ]
        )
    return _csv_response(
        "homework.csv",
        ["Class", "Subject", "Code", "Title", "Due date", "Submissions"],
        rows,
    )


# ----- Behaviour ratings -----

@router.get(
    "/behaviour.csv",
    response_class=PlainTextResponse,
    summary="Behaviour ratings export",
)
def behaviour_csv(
    current_user: SchoolAdminUser,
    db: Annotated[Session, Depends(get_db)],
    period_key: Optional[str] = Query(None),
):
    stmt = (
        select(BehaviourRating, Student)
        .join(Student, BehaviourRating.student_id == Student.id)
        .where(BehaviourRating.school_id == current_user.school_id)
        .order_by(BehaviourRating.period_kind, BehaviourRating.period_key.desc())
    )
    if period_key:
        stmt = stmt.where(BehaviourRating.period_key == period_key)
    rows = []
    for (b, s) in db.execute(stmt).all():
        avg = round(
            ((b.punctuality or 0) + (b.participation or 0) + (b.discipline or 0) + (b.respect or 0)) / 4.0,
            2,
        )
        rows.append(
            [
                s.admission_no,
                s.full_name,
                b.period_kind.value,
                b.period_key,
                b.punctuality,
                b.participation,
                b.discipline,
                b.respect,
                avg,
                b.teacher_note or "",
            ]
        )
    return _csv_response(
        "behaviour.csv",
        [
            "Admission #",
            "Student",
            "Kind",
            "Period",
            "Punctuality",
            "Participation",
            "Discipline",
            "Respect",
            "Average",
            "Note",
        ],
        rows,
    )
