from datetime import date
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import AttendanceStatus
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.attendance import StudentAttendance
from app.models.behaviour import BehaviourRating
from app.models.exam import Exam, ExamSubject
from app.models.foundation import Guardian, StudentGuardian
from app.models.homework import Homework
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.user import User


def _attendance_summary(db: Session, student_id: int) -> dict:
    counts = dict(
        db.execute(
            select(StudentAttendance.status, func.count())
            .where(StudentAttendance.student_id == student_id)
            .group_by(StudentAttendance.status)
        ).all()
    )
    present = counts.get(AttendanceStatus.present, 0)
    absent = counts.get(AttendanceStatus.absent, 0)
    late = counts.get(AttendanceStatus.late, 0)
    half = counts.get(AttendanceStatus.half_day, 0)
    marked = present + absent + late + half
    # Present + late + half (half counts as 0.5)
    if marked > 0:
        pct = round(((present + late + 0.5 * half) / marked) * 100, 1)
    else:
        pct = None
    return {
        "days_present": present,
        "days_absent": absent,
        "days_late": late,
        "days_half_day": half,
        "days_marked": marked,
        "attendance_percent": pct,
    }


def _recent_behaviour(db: Session, student_id: int, limit: int = 5) -> list[dict]:
    rows = db.execute(
        select(BehaviourRating, User.full_name)
        .join(User, BehaviourRating.rated_by_user_id == User.id, isouter=True)
        .where(BehaviourRating.student_id == student_id)
        .order_by(BehaviourRating.created_at.desc())
        .limit(limit)
    ).all()
    out = []
    for b, rater_name in rows:
        avg = round(
            (b.punctuality + b.participation + b.discipline + b.respect) / 4.0, 2
        )
        out.append(
            {
                "id": b.id,
                "period_kind": b.period_kind.value,
                "period_key": b.period_key,
                "average": avg,
                "punctuality": b.punctuality,
                "participation": b.participation,
                "discipline": b.discipline,
                "respect": b.respect,
                "teacher_note": b.teacher_note,
                "rated_by_name": rater_name,
                "created_at": b.created_at,
            }
        )
    return out


def _exam_performances(db: Session, student: Student) -> list[dict]:
    # Find published exams that have at least one paper for the student's class
    section = db.get(Section, student.section_id)
    if not section:
        return []
    exams = list(
        db.execute(
            select(Exam)
            .join(ExamSubject, ExamSubject.exam_id == Exam.id)
            .join(ClassSubject, ExamSubject.class_subject_id == ClassSubject.id)
            .where(
                Exam.school_id == student.school_id,
                Exam.is_published.is_(True),
                ClassSubject.class_id == section.class_id,
            )
            .distinct()
            .order_by(Exam.start_date.desc())
        ).scalars().all()
    )
    if not exams:
        return []

    # Reuse result_service so we don't duplicate grade logic
    from app.services import result_service

    out = []
    for exam in exams:
        result = result_service._build_result(db, exam, student)
        summary = result["summary"]
        out.append(
            {
                "exam_id": exam.id,
                "exam_name": exam.name,
                "exam_kind": exam.kind.value,
                "published_at": exam.published_at,
                "percentage": summary["percentage"],
                "overall_grade": summary["overall_grade"],
                "is_pass": summary["is_pass"],
            }
        )
    return out


def _recent_homework(db: Session, student: Student, limit: int = 5) -> list[dict]:
    section = db.get(Section, student.section_id)
    if not section:
        return []
    cs_ids = list(
        db.execute(
            select(ClassSubject.id).where(ClassSubject.class_id == section.class_id)
        ).scalars().all()
    )
    if not cs_ids:
        return []
    rows = db.execute(
        select(Homework, Subject, ClassSubject)
        .join(ClassSubject, Homework.class_subject_id == ClassSubject.id)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .where(Homework.class_subject_id.in_(cs_ids))
        .order_by(Homework.due_date.desc())
        .limit(limit)
    ).all()
    today = date.today()
    return [
        {
            "id": h.id,
            "title": h.title,
            "subject_name": subj.name,
            "subject_code": subj.code,
            "due_date": h.due_date,
            "is_past_due": h.due_date < today,
        }
        for h, subj, _ in rows
    ]


def _parents(db: Session, student_id: int) -> list[dict]:
    """Everyone on the student's family, primary contact first.

    The guardians the office recorded are the answer — a portal login is
    something a guardian may or may not have been given, so reading the login
    table alone hides every family that was never handed one.
    """
    rows = db.execute(
        select(StudentGuardian, Guardian)
        .join(Guardian, StudentGuardian.guardian_id == Guardian.id)
        .where(StudentGuardian.student_id == student_id)
        .order_by(StudentGuardian.is_primary.desc(), Guardian.full_name)
    ).all()
    people = [
        {
            "guardian_id": g.id,
            "user_id": g.user_id,
            "full_name": g.full_name,
            "email": g.email,
            "phone": g.phone,
            "relation": link.relation,
            "is_primary": link.is_primary,
        }
        for link, g in rows
    ]
    # A parent login that no guardian record accounts for (older data, before
    # guardians were kept) would otherwise disappear from the screen.
    seen = {p["user_id"] for p in people if p["user_id"]}
    extra = db.execute(
        select(ParentStudent, User)
        .join(User, ParentStudent.parent_user_id == User.id)
        .where(ParentStudent.student_id == student_id)
        .order_by(User.full_name)
    ).all()
    for link, u in extra:
        if u.id in seen:
            continue
        people.append(
            {
                "guardian_id": None,
                "user_id": u.id,
                "full_name": u.full_name,
                "email": u.email,
                "phone": u.phone,
                "relation": link.relation,
                "is_primary": False,
            }
        )
    return people


def build_profile(db: Session, student: Student) -> dict:
    """Assemble the full cross-module profile for a single student."""
    from app.services import fee_service  # local to avoid cycle

    section = db.get(Section, student.section_id)
    cls = db.get(SchoolClass, section.class_id) if section else None
    year = db.get(AcademicYear, student.academic_year_id)
    class_teacher = (
        db.get(User, section.class_teacher_user_id)
        if section and section.class_teacher_user_id
        else None
    )

    return {
        "id": student.id,
        "admission_no": student.admission_no,
        "full_name": student.full_name,
        "dob": student.dob,
        "gender": student.gender,
        "blood_group": student.blood_group,
        "photo_url": student.photo_url,
        "address": student.address,
        "is_active": student.is_active,
        "roll_no": student.roll_no,
        "section_id": student.section_id,
        "section_name": section.name if section else None,
        "class_id": cls.id if cls else None,
        "class_name": cls.name if cls else None,
        "academic_year_id": student.academic_year_id,
        "academic_year_name": year.name if year else None,
        "class_teacher_name": class_teacher.full_name if class_teacher else None,
        "parents": _parents(db, student.id),
        "attendance": _attendance_summary(db, student.id),
        "behaviour_recent": _recent_behaviour(db, student.id),
        "exams": _exam_performances(db, student),
        "homework_recent": _recent_homework(db, student),
        "fees_pending_amount": float(fee_service.child_pending_total(db, student.id)),
    }


# ----- Access guards -----

def get_student_for_school(db: Session, student_id: int, school_id: int) -> Student:
    s = db.get(Student, student_id)
    if not s or s.school_id != school_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )
    return s


def get_student_for_teacher(
    db: Session, student_id: int, teacher_user_id: int, school_id: int
) -> Student:
    """A teacher sees a child they are responsible for: the class teacher of
    the child's section, or anyone teaching a subject to that class."""
    s = get_student_for_school(db, student_id, school_id)
    section = db.get(Section, s.section_id)
    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )
    teaches = section.class_teacher_user_id == teacher_user_id or db.execute(
        select(ClassSubject.id).where(
            ClassSubject.class_id == section.class_id,
            ClassSubject.teacher_user_id == teacher_user_id,
        )
    ).first() is not None
    if not teaches:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't teach this student's class",
        )
    return s


def get_student_for_parent(
    db: Session, student_id: int, parent_user_id: int
) -> Student:
    link = db.execute(
        select(ParentStudent).where(
            ParentStudent.parent_user_id == parent_user_id,
            ParentStudent.student_id == student_id,
        )
    ).scalar_one_or_none()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child not linked to this parent",
        )
    s = db.get(Student, student_id)
    if not s:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )
    return s
