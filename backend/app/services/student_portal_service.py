"""The child's own view of the school, and the accounts that let them in.

Two things live here. Provisioning — turning a student record into something
that can sign in — and the reads behind the portal itself.

The rule the whole file turns on: a student sees their own record and nothing
else. There is no student_id parameter anywhere in the portal reads, because
a parameter is something that can be changed in a URL bar by a fourteen year
old who is curious about somebody else's marks. The child is resolved from
the token, once, here.

What a student is deliberately not shown: fees, siblings, anything about
another child, and discipline or counselling notes. Those are the school's
conversation with a parent, and putting them on a screen the child can open
changes what a teacher is willing to write down.
"""
from __future__ import annotations

import secrets
import string
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import AttendanceStatus, UserRole
from app.core.security import hash_password
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.attendance import StudentAttendance
from app.models.exam import Exam, ExamSubject
from app.models.homework import Homework, HomeworkSubmission
from app.models.mark import Mark
from app.models.notice import Notice, NoticeRecipient
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.tenant import School
from app.models.timetable import Period, TimetableEntry
from app.models.user import User

# Ambiguous characters left out. A password read aloud across a counter, or
# copied off a printed slip by a nine year old, should not turn on telling
# I from l or O from 0.
ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _400(why: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, why)


def new_password(length: int = 10) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


# ---------- who is asking ----------


def me(db: Session, user: User) -> Student:
    """The student behind the signed-in account.

    Every portal read starts here. If the account has been unlinked from its
    record the answer is a 404 rather than an empty page, because an empty
    page looks like a school with nothing in it rather than an account that
    needs fixing at the office.
    """
    student = db.execute(
        select(Student).where(
            Student.user_id == user.id, Student.school_id == user.school_id
        )
    ).scalar_one_or_none()
    if not student:
        raise _404("Your student record")
    if not student.is_active:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "This account is no longer active. Please speak to the school office.",
        )
    return student


# ---------- provisioning ----------


def create_login(db: Session, school_id: int, student_id: int) -> dict:
    """Give one student a way in, and hand back the password once.

    The password is returned here and never again — it is stored hashed like
    anybody else's. An office that loses the slip resets it; an office that
    can look it up later is an office where a password is not a secret.
    """
    student = db.get(Student, student_id)
    if not student or student.school_id != school_id:
        raise _404("Student")
    if not student.is_active:
        raise _400("This student has left. Reactivate the record before giving them a login.")

    password = new_password()

    if student.user_id:
        user = db.get(User, student.user_id)
        if user:
            user.password_hash = hash_password(password)
            user.is_active = True
            db.commit()
            return {
                "student_id": student.id,
                "admission_no": student.admission_no,
                "student_name": student.full_name,
                "user_id": user.id,
                "password": password,
                "created": False,
            }

    user = User(
        tenant_id=student.tenant_id,
        school_id=student.school_id,
        full_name=student.full_name,
        role=UserRole.student,
        password_hash=hash_password(password),
        is_active=True,
    )
    db.add(user)
    db.flush()
    student.user_id = user.id
    db.commit()
    return {
        "student_id": student.id,
        "admission_no": student.admission_no,
        "student_name": student.full_name,
        "user_id": user.id,
        "password": password,
        "created": True,
    }


def create_logins_for_class(db: Session, school_id: int, class_id: int) -> dict:
    """A whole class at once, because doing five hundred one at a time is not
    a workflow anybody follows — they give up and nobody gets a login."""
    students = list(db.execute(
        select(Student)
        .join(Section, Student.section_id == Section.id)
        .where(
            Section.class_id == class_id,
            Student.school_id == school_id,
            Student.is_active.is_(True),
        )
        .order_by(Section.name, Student.roll_no, Student.id)
    ).scalars())
    if not students:
        raise _400("No active children in that class.")

    made, reset = [], []
    for s in students:
        had = s.user_id is not None
        row = create_login(db, school_id, s.id)
        (reset if had else made).append(row)
    return {
        "class_id": class_id,
        "created": made,
        "reset": reset,
        "total": len(made) + len(reset),
    }


def login_status(db: Session, school_id: int, class_id: Optional[int] = None) -> list[dict]:
    """Who has an account and who does not — so the office can see the gap
    rather than discover it when a child cannot sign in."""
    stmt = (
        select(Student, Section.name, SchoolClass.name, User)
        .join(Section, Student.section_id == Section.id, isouter=True)
        .join(SchoolClass, Section.class_id == SchoolClass.id, isouter=True)
        .join(User, User.id == Student.user_id, isouter=True)
        .where(Student.school_id == school_id, Student.is_active.is_(True))
    )
    if class_id:
        stmt = stmt.where(Section.class_id == class_id)
    rows = db.execute(stmt.order_by(SchoolClass.name, Section.name, Student.roll_no)).all()
    return [
        {
            "student_id": s.id,
            "admission_no": s.admission_no,
            "student_name": s.full_name,
            "roll_no": s.roll_no,
            "class_name": class_name,
            "section_name": section_name,
            "has_login": user is not None,
            "is_active": bool(user.is_active) if user else False,
            "last_login_at": user.last_login_at if user else None,
        }
        for s, section_name, class_name, user in rows
    ]


def revoke_login(db: Session, school_id: int, student_id: int) -> dict:
    """Switch an account off without deleting it.

    Deleting the user would take the child's homework submissions with it,
    and a child who has left should still have handed in what they handed in.
    """
    student = db.get(Student, student_id)
    if not student or student.school_id != school_id:
        raise _404("Student")
    if not student.user_id:
        raise _400("This student has no login.")
    user = db.get(User, student.user_id)
    if user:
        user.is_active = False
        db.commit()
    return {"student_id": student.id, "has_login": True, "is_active": False}


def change_own_password(db: Session, user: User, current: str, new: str) -> None:
    """A student changing the password the office gave them."""
    from app.core.security import verify_password

    if not user.password_hash or not verify_password(current, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That is not your current password.")
    if len(new) < 8:
        raise _400("A password needs at least eight characters.")
    if new == current:
        raise _400("The new password is the same as the old one.")
    user.password_hash = hash_password(new)
    db.commit()


# ---------- the portal ----------


def profile(db: Session, student: Student) -> dict:
    section = db.get(Section, student.section_id) if student.section_id else None
    cls = db.get(SchoolClass, section.class_id) if section else None
    school = db.get(School, student.school_id)
    return {
        "student_id": student.id,
        "full_name": student.full_name,
        "admission_no": student.admission_no,
        "roll_no": student.roll_no,
        "class_name": cls.name if cls else None,
        "section_name": section.name if section else None,
        "photo_url": student.photo_url,
        "school_name": school.name if school else "",
    }


def dashboard(db: Session, student: Student) -> dict:
    """What a child wants on opening the app: what is due, what is on today,
    and how their attendance is going."""
    today = date.today()
    section = db.get(Section, student.section_id) if student.section_id else None

    # homework still open, soonest due first
    homework = []
    if section:
        rows = list(db.execute(
            select(Homework, Subject.name)
            .join(ClassSubject, ClassSubject.id == Homework.class_subject_id)
            .join(Subject, Subject.id == ClassSubject.subject_id, isouter=True)
            .where(
                ClassSubject.class_id == section.class_id,
                Homework.school_id == student.school_id,
                Homework.closed_at.is_(None),
            )
            .order_by(Homework.due_date)
            .limit(10)
        ).all())
        submitted = {
            sub.homework_id for sub in db.execute(
                select(HomeworkSubmission).where(HomeworkSubmission.student_id == student.id)
            ).scalars()
        }
        for h, subject_name in rows:
            homework.append({
                "homework_id": h.id,
                "title": h.title,
                "subject_name": subject_name,
                "due_date": h.due_date,
                "overdue": h.due_date < today,
                "submitted": h.id in submitted,
            })

    # today's periods
    timetable = []
    if section:
        rows = db.execute(
            select(Period, Subject.name, User.full_name)
            .join(TimetableEntry, TimetableEntry.period_id == Period.id)
            .join(ClassSubject, ClassSubject.id == TimetableEntry.class_subject_id, isouter=True)
            .join(Subject, Subject.id == ClassSubject.subject_id, isouter=True)
            .join(User, User.id == ClassSubject.teacher_user_id, isouter=True)
            .where(
                TimetableEntry.section_id == section.id,
                Period.day_of_week == today.isoweekday(),
            )
            .order_by(Period.period_number)
        ).all()
        timetable = [
            {
                "period_number": p.period_number,
                "label": p.label,
                "start_time": p.start_time,
                "end_time": p.end_time,
                "is_break": p.is_break,
                "subject_name": subject_name,
                "teacher_name": teacher_name,
            }
            for p, subject_name, teacher_name in rows
        ]

    # attendance this term, counting late as present and a half-day as half
    since = today - timedelta(days=120)
    counts = dict(db.execute(
        select(StudentAttendance.status, func.count(StudentAttendance.id))
        .where(
            StudentAttendance.student_id == student.id,
            StudentAttendance.date >= since,
        )
        .group_by(StudentAttendance.status)
    ).all())
    marked = sum(counts.values())
    present = counts.get(AttendanceStatus.present, 0) + counts.get(AttendanceStatus.late, 0)
    half = counts.get(AttendanceStatus.half_day, 0)

    published = list(db.execute(
        select(Exam)
        .where(
            Exam.school_id == student.school_id,
            Exam.is_published.is_(True),
        )
        .order_by(Exam.end_date.desc())
        .limit(3)
    ).scalars())

    return {
        **profile(db, student),
        "homework": homework,
        "homework_due": sum(1 for h in homework if not h["submitted"]),
        "homework_overdue": sum(1 for h in homework if h["overdue"] and not h["submitted"]),
        "timetable": timetable,
        "attendance": {
            "marked_days": marked,
            "present": present,
            "absent": counts.get(AttendanceStatus.absent, 0),
            "half_day": half,
            "percent": round((present + 0.5 * half) / marked * 100, 1) if marked else 0.0,
        },
        "recent_exams": [
            {"exam_id": e.id, "name": e.name, "end_date": e.end_date} for e in published
        ],
        "notices": _notices(db, student),
    }


def _notices(db: Session, student: Student, limit: int = 5) -> list[dict]:
    """Anything addressed to this child's account."""
    if not student.user_id:
        return []
    rows = db.execute(
        select(Notice)
        .join(NoticeRecipient, NoticeRecipient.notice_id == Notice.id)
        .where(NoticeRecipient.user_id == student.user_id)
        .order_by(Notice.created_at.desc())
        .limit(limit)
    ).scalars()
    return [
        {"notice_id": n.id, "title": n.title, "body": n.body, "created_at": n.created_at}
        for n in rows
    ]


def exams(db: Session, student: Student) -> list[dict]:
    """Published results only, as the family already sees them.

    This delegates to result_service rather than adding up marks here. A
    second implementation would not know about the school's result decisions,
    and the first thing it would get wrong is showing a child a mark that was
    deliberately withheld from their parents.
    """
    from app.services import result_service

    return result_service.list_published_for_student(db, student)


def exam_result(db: Session, student: Student, exam_id: int) -> dict:
    """One published result, subject by subject — the same figures, and the
    same withholding, the parent portal would show."""
    from app.services import result_service

    return result_service.get_published_result_for_student(db, student, exam_id)
