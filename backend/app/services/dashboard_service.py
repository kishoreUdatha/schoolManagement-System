from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.enums import AttendanceStatus, FeeStatus, SubmissionStatus, UserRole
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.attendance import StudentAttendance
from app.models.exam import Exam
from app.models.fee import StudentFee
from app.models.homework import Homework, HomeworkSubmission
from app.models.mark import Mark
from app.models.notice import Notice, NoticeRecipient
from app.models.student import Student
from app.models.user import User
from app.services import exam_service, holiday_service


def _month_start_utc() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _attendance_today(db: Session, school_id: int, today: date) -> dict:
    """Story 19.1 — present/absent counts and % for today, school-wide."""
    rows = db.execute(
        select(StudentAttendance.status, func.count(StudentAttendance.id))
        .where(
            StudentAttendance.school_id == school_id,
            StudentAttendance.date == today,
        )
        .group_by(StudentAttendance.status)
    ).all()
    counts = {s.value: 0 for s in AttendanceStatus}
    for status_val, n in rows:
        counts[status_val.value if hasattr(status_val, "value") else status_val] = int(n)
    marked = sum(counts.values())
    # Weight late as full present, half_day as 0.5 (matches reports module)
    effective = (
        counts["present"]
        + counts["late"]
        + 0.5 * counts["half_day"]
    )
    pct = round((effective / marked) * 100, 1) if marked else 0.0
    return {
        "available": True,
        "as_of_date": today,
        "marked": marked,
        "present": counts["present"],
        "absent": counts["absent"],
        "late": counts["late"],
        "half_day": counts["half_day"],
        "attendance_pct": pct,
    }


def _homework_completion(
    db: Session, school_id: int, since: datetime
) -> dict:
    """Story 19.1 — % of recent homework that has at least one submission,
    and % of submissions reviewed (approved or rejected)."""
    total_hw = db.execute(
        select(func.count(Homework.id)).where(
            Homework.school_id == school_id,
            Homework.created_at >= since,
        )
    ).scalar_one()
    hw_with_submission = db.execute(
        select(func.count(func.distinct(HomeworkSubmission.homework_id)))
        .join(Homework, HomeworkSubmission.homework_id == Homework.id)
        .where(
            Homework.school_id == school_id,
            Homework.created_at >= since,
        )
    ).scalar_one()
    total_subs = db.execute(
        select(func.count(HomeworkSubmission.id))
        .join(Homework, HomeworkSubmission.homework_id == Homework.id)
        .where(
            Homework.school_id == school_id,
            Homework.created_at >= since,
        )
    ).scalar_one()
    reviewed_subs = db.execute(
        select(func.count(HomeworkSubmission.id))
        .join(Homework, HomeworkSubmission.homework_id == Homework.id)
        .where(
            Homework.school_id == school_id,
            Homework.created_at >= since,
            HomeworkSubmission.status.in_(
                [SubmissionStatus.approved, SubmissionStatus.rejected]
            ),
        )
    ).scalar_one()
    submission_rate = (
        round((hw_with_submission / total_hw) * 100, 1) if total_hw else 0.0
    )
    review_rate = (
        round((reviewed_subs / total_subs) * 100, 1) if total_subs else 0.0
    )
    return {
        "available": True,
        "since": since,
        "total_homework": int(total_hw),
        "homework_with_submission": int(hw_with_submission),
        "total_submissions": int(total_subs),
        "reviewed_submissions": int(reviewed_subs),
        "submission_rate_pct": submission_rate,
        "review_rate_pct": review_rate,
    }


def _exam_performance(db: Session, school_id: int) -> dict:
    """Story 19.1 — average score % and pass rate across most-recent
    published exam (if any)."""
    last_exam = db.execute(
        select(Exam)
        .where(Exam.school_id == school_id, Exam.is_published.is_(True))
        .order_by(Exam.end_date.desc())
        .limit(1)
    ).scalar_one_or_none()
    if not last_exam:
        return {"available": False, "note": "No published exam yet."}

    # Sum(obtained / max) * 100 weighted equally per mark row, plus pass rate
    from app.models.exam import ExamSubject

    rows = db.execute(
        select(
            Mark.marks_obtained,
            Mark.is_pass,
            ExamSubject.max_marks,
        )
        .join(ExamSubject, Mark.exam_subject_id == ExamSubject.id)
        .where(
            ExamSubject.exam_id == last_exam.id,
            Mark.marks_obtained.is_not(None),
        )
    ).all()
    if not rows:
        return {
            "available": True,
            "exam_id": last_exam.id,
            "exam_name": last_exam.name,
            "marks_count": 0,
            "average_pct": 0.0,
            "pass_rate_pct": 0.0,
        }
    total_pct = sum((m / x) * 100 for m, _p, x in rows if x)
    passed = sum(1 for _m, p, _x in rows if p)
    return {
        "available": True,
        "exam_id": last_exam.id,
        "exam_name": last_exam.name,
        "marks_count": len(rows),
        "average_pct": round(total_pct / len(rows), 1),
        "pass_rate_pct": round(passed / len(rows) * 100, 1),
    }


def _notifications_summary(
    db: Session, school_id: int, since: datetime
) -> dict:
    """Story 19.1 — notices sent since `since` (default: this month)."""
    sent_count = db.execute(
        select(func.count(Notice.id)).where(
            Notice.school_id == school_id,
            Notice.sent_at.is_not(None),
            Notice.sent_at >= since,
        )
    ).scalar_one()
    recipient_count = db.execute(
        select(func.count(NoticeRecipient.id))
        .join(Notice, NoticeRecipient.notice_id == Notice.id)
        .where(
            Notice.school_id == school_id,
            Notice.sent_at.is_not(None),
            Notice.sent_at >= since,
        )
    ).scalar_one()
    return {
        "since": since,
        "sent_count": int(sent_count),
        "total_recipients": int(recipient_count),
    }


def build_dashboard(db: Session, school_id: int) -> dict:
    today = date.today()
    month_start_dt = _month_start_utc()

    # Current academic year
    current_year = db.execute(
        select(AcademicYear).where(
            AcademicYear.school_id == school_id,
            AcademicYear.is_current.is_(True),
        )
    ).scalar_one_or_none()
    current_year_id = current_year.id if current_year else None
    current_year_name = current_year.name if current_year else None

    # Counts
    students_active = db.execute(
        select(func.count(Student.id)).where(
            Student.school_id == school_id, Student.is_active.is_(True)
        )
    ).scalar_one()
    teachers_active = db.execute(
        select(func.count(User.id)).where(
            User.school_id == school_id,
            User.role == UserRole.teacher,
            User.is_active.is_(True),
        )
    ).scalar_one()
    non_teaching_active = db.execute(
        select(func.count(User.id)).where(
            User.school_id == school_id,
            User.role == UserRole.staff,
            User.is_active.is_(True),
        )
    ).scalar_one()
    parents_active = db.execute(
        select(func.count(User.id)).where(
            User.school_id == school_id,
            User.role == UserRole.parent,
            User.is_active.is_(True),
        )
    ).scalar_one()

    if current_year_id:
        classes_count = db.execute(
            select(func.count(SchoolClass.id)).where(
                SchoolClass.school_id == school_id,
                SchoolClass.academic_year_id == current_year_id,
            )
        ).scalar_one()
        sections_count = db.execute(
            select(func.count(Section.id))
            .join(SchoolClass, Section.class_id == SchoolClass.id)
            .where(
                Section.school_id == school_id,
                SchoolClass.academic_year_id == current_year_id,
            )
        ).scalar_one()
    else:
        classes_count = 0
        sections_count = 0

    # Fees summary
    outstanding_expr = StudentFee.amount_due - StudentFee.amount_paid
    pending_count = db.execute(
        select(func.count(StudentFee.id)).where(
            StudentFee.school_id == school_id,
            StudentFee.status == FeeStatus.pending,
        )
    ).scalar_one()
    pending_outstanding = db.execute(
        select(func.coalesce(func.sum(outstanding_expr), 0)).where(
            StudentFee.school_id == school_id,
            StudentFee.status == FeeStatus.pending,
        )
    ).scalar_one()
    overdue_count = db.execute(
        select(func.count(StudentFee.id)).where(
            StudentFee.school_id == school_id,
            StudentFee.status == FeeStatus.pending,
            StudentFee.due_date < today,
        )
    ).scalar_one()
    overdue_outstanding = db.execute(
        select(func.coalesce(func.sum(outstanding_expr), 0)).where(
            StudentFee.school_id == school_id,
            StudentFee.status == FeeStatus.pending,
            StudentFee.due_date < today,
        )
    ).scalar_one()
    paid_this_month = db.execute(
        select(func.coalesce(func.sum(StudentFee.amount_paid), 0)).where(
            StudentFee.school_id == school_id,
            StudentFee.paid_at >= month_start_dt,
        )
    ).scalar_one()

    # Admissions
    this_month_count = db.execute(
        select(func.count(Student.id)).where(
            Student.school_id == school_id,
            Student.created_at >= month_start_dt,
        )
    ).scalar_one()
    last_30_days_count = db.execute(
        select(func.count(Student.id)).where(
            Student.school_id == school_id,
            Student.created_at >= datetime.now(timezone.utc) - timedelta(days=30),
        )
    ).scalar_one()

    # Upcoming holidays (next 5)
    upcoming_holidays_raw = holiday_service.list_(
        db, school_id, upcoming=True, limit=5
    )
    upcoming_holidays = [
        holiday_service.to_read_dict(h) for h in upcoming_holidays_raw
    ]

    # Upcoming exams in the next 7 days
    upcoming_exams_rows = exam_service.list_upcoming(db, school_id, days=7, limit=5)
    upcoming_exams = [
        {
            "id": e.id,
            "name": e.name,
            "kind": e.kind.value,
            "start_date": e.start_date,
            "end_date": e.end_date,
            "is_published": e.is_published,
            "papers_count": len(e.papers),
        }
        for e in upcoming_exams_rows
    ]

    # Latest 3 sent notices
    notice_rows = db.execute(
        select(Notice)
        .where(Notice.school_id == school_id, Notice.sent_at.is_not(None))
        .order_by(Notice.sent_at.desc())
        .limit(3)
    ).scalars().all()
    latest_notices = []
    for n in notice_rows:
        distinct_users = db.execute(
            select(func.count(func.distinct(NoticeRecipient.user_id))).where(
                NoticeRecipient.notice_id == n.id
            )
        ).scalar_one()
        latest_notices.append(
            {
                "id": n.id,
                "title": n.title,
                "audience": n.audience.value,
                "sent_at": n.sent_at,
                "recipient_count": int(distinct_users or 0),
            }
        )

    return {
        "current_academic_year_id": current_year_id,
        "current_academic_year_name": current_year_name,
        "counts": {
            "students_active": students_active,
            "teachers_active": teachers_active,
            "non_teaching_active": non_teaching_active,
            "parents_active": parents_active,
            "classes_current_year": classes_count,
            "sections_current_year": sections_count,
        },
        "fees": {
            "pending_count": pending_count,
            "pending_outstanding": Decimal(pending_outstanding),
            "overdue_count": overdue_count,
            "overdue_outstanding": Decimal(overdue_outstanding),
            "paid_this_month": Decimal(paid_this_month),
        },
        "admissions": {
            "this_month_count": this_month_count,
            "last_30_days_count": last_30_days_count,
        },
        "upcoming_holidays": upcoming_holidays,
        "latest_notices": latest_notices,
        "upcoming_exams": upcoming_exams,
        "attendance": _attendance_today(db, school_id, today),
        "homework": _homework_completion(db, school_id, month_start_dt),
        "exam_performance": _exam_performance(db, school_id),
        "notifications": _notifications_summary(db, school_id, month_start_dt),
        "generated_at": datetime.now(timezone.utc),
    }
