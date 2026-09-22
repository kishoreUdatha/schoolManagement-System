"""One child's school days as the parent app shows them.

Every function starts from `_child`, which refuses a child the parent is not
linked to, so a sibling's (or a stranger's) records can never be asked for by
changing the id in the URL.
"""
from calendar import monthrange
from datetime import date, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import AttendanceStatus, StudentLeaveStatus
from app.models.academic import SchoolClass, Section
from app.models.attendance import StudentAttendance
from app.models.attendance_ops import PeriodAttendance
from app.models.cover import StudentLeave, Substitution
from app.models.exam import Exam, ExamSubject
from app.models.exam_ops import ExamRoomAllocation
from app.models.facility import Room
from app.models.holiday import Holiday
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.timetable import Period
from app.models.user import User
from app.services import student_profile_service


def _child(db: Session, parent_user_id: int, student_id: int) -> Student:
    return student_profile_service.get_student_for_parent(db, student_id, parent_user_id)


def _holidays(db: Session, school_id: int, start: date, end: date) -> dict[date, str]:
    out: dict[date, str] = {}
    rows = db.execute(
        select(Holiday).where(
            Holiday.school_id == school_id, Holiday.end_date >= start, Holiday.start_date <= end
        )
    ).scalars()
    for h in rows:
        d = max(h.start_date, start)
        while d <= min(h.end_date, end):
            out.setdefault(d, h.name)
            d += timedelta(days=1)
    return out


def _names(db: Session, ids) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all())


# ---------- attendance ----------


def attendance_month(db: Session, parent_user_id: int, student_id: int, month: str) -> dict:
    st = _child(db, parent_user_id, student_id)
    try:
        y, m = (int(x) for x in month.split("-"))
        first = date(y, m, 1)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "month must look like 2026-09")
    last = date(y, m, monthrange(y, m)[1])
    rows = list(
        db.execute(
            select(StudentAttendance)
            .where(
                StudentAttendance.student_id == st.id,
                StudentAttendance.date >= first,
                StudentAttendance.date <= last,
            )
            .order_by(StudentAttendance.date)
        ).scalars()
    )
    counts = {s: 0 for s in AttendanceStatus}
    for r in rows:
        counts[r.status] += 1
    marked = len(rows)
    attended = counts[AttendanceStatus.present] + counts[AttendanceStatus.late] + 0.5 * counts[AttendanceStatus.half_day]
    return {
        "month": f"{y:04d}-{m:02d}",
        "days": [
            {"date": r.date, "status": r.status, "remark": r.remark, "arrived_at": r.arrived_at, "left_at": r.left_at}
            for r in rows
        ],
        "holidays": [{"date": d, "name": n} for d, n in sorted(_holidays(db, st.school_id, first, last).items())],
        "totals": {
            "present": counts[AttendanceStatus.present],
            "absent": counts[AttendanceStatus.absent],
            "late": counts[AttendanceStatus.late],
            "half_day": counts[AttendanceStatus.half_day],
            "marked": marked,
            "attendance_percent": round(attended / marked * 100, 1) if marked else None,
        },
    }


def attendance_day(db: Session, parent_user_id: int, student_id: int, on: date) -> dict:
    st = _child(db, parent_user_id, student_id)
    rec = db.execute(
        select(StudentAttendance).where(StudentAttendance.student_id == st.id, StudentAttendance.date == on)
    ).scalar_one_or_none()
    periods = db.execute(
        select(PeriodAttendance, Period, Subject.name)
        .join(Period, PeriodAttendance.period_id == Period.id)
        .outerjoin(ClassSubject, PeriodAttendance.class_subject_id == ClassSubject.id)
        .outerjoin(Subject, ClassSubject.subject_id == Subject.id)
        .where(PeriodAttendance.student_id == st.id, PeriodAttendance.date == on)
        .order_by(Period.period_number)
    ).all()
    leave = db.execute(
        select(StudentLeave.id).where(
            StudentLeave.student_id == st.id,
            StudentLeave.status == StudentLeaveStatus.approved,
            StudentLeave.from_date <= on,
            StudentLeave.to_date >= on,
        )
    ).first()
    marker = _names(db, [rec.marked_by_user_id]) if rec else {}
    return {
        "date": on,
        "status": rec.status if rec else None,
        "remark": rec.remark if rec else None,
        "arrived_at": rec.arrived_at if rec else None,
        "left_at": rec.left_at if rec else None,
        "marked_by_name": marker.get(rec.marked_by_user_id) if rec else None,
        "marked_at": rec.updated_at if rec else None,
        "holiday_name": _holidays(db, st.school_id, on, on).get(on),
        "on_approved_leave": leave is not None,
        "periods": [
            {
                "period_id": p.id,
                "period_number": p.period_number,
                "label": p.label,
                "start_time": p.start_time,
                "end_time": p.end_time,
                "subject_name": subject_name,
                "status": pa.status,
                "remark": pa.remark,
            }
            for pa, p, subject_name in periods
        ],
    }


# ---------- dated timetable ----------


def timetable_day(db: Session, parent_user_id: int, student_id: int, on: date) -> dict:
    from app.services import timetable_service

    # Same gate as the weekly timetable: linked child, published timetable.
    tt = timetable_service.get_child_timetable_for_parent(db, parent_user_id, student_id)
    st = db.get(Student, student_id)
    dow = on.isoweekday()
    entries = {e["period_id"]: e for e in tt["entries"]}
    subs = {
        s.period_id: s
        for s in db.execute(
            select(Substitution).where(Substitution.section_id == tt["section_id"], Substitution.sub_date == on)
        ).scalars()
    }
    names = _names(db, [s.substitute_user_id for s in subs.values()])
    slots = []
    for p in sorted((p for p in tt["periods"] if p.day_of_week == dow), key=lambda p: (p.start_time, p.period_number)):
        e = entries.get(p.id)
        s = subs.get(p.id)
        slots.append(
            {
                "period_id": p.id,
                "period_number": p.period_number,
                "label": p.label,
                "start_time": p.start_time,
                "end_time": p.end_time,
                "is_break": p.is_break,
                "subject_name": e["subject_name"] if e else None,
                "subject_code": e["subject_code"] if e else None,
                "teacher_name": e["teacher_name"] if e else None,
                "room_name": e["room_name"] if e else None,
                "is_substituted": s is not None and e is not None,
                "substitute_teacher_name": names.get(s.substitute_user_id) if s else None,
                "cover_note": s.note if s else None,
            }
        )
    return {
        "date": on,
        "day_of_week": dow,
        "section_label": tt["section_label"],
        "holiday_name": _holidays(db, st.school_id, on, on).get(on),
        "slots": slots,
    }


# ---------- exam schedule ----------


def _schedule(db: Session, st: Student, exam: Exam) -> dict | None:
    """The child's papers in one exam, or None when the exam has none for
    the child's class (it is some other class's exam)."""
    section = db.get(Section, st.section_id)
    cls = db.get(SchoolClass, section.class_id) if section else None
    if not cls:
        return None
    rows = db.execute(
        select(ExamSubject, Subject)
        .join(ClassSubject, ExamSubject.class_subject_id == ClassSubject.id)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .where(ExamSubject.exam_id == exam.id, ClassSubject.class_id == cls.id)
    ).all()
    if not rows:
        return None
    seats = dict(
        db.execute(
            select(ExamRoomAllocation.exam_subject_id, Room.name)
            .join(Room, ExamRoomAllocation.room_id == Room.id)
            .where(
                ExamRoomAllocation.student_id == st.id,
                ExamRoomAllocation.exam_subject_id.in_([p.id for p, _ in rows]),
            )
        ).all()
    )
    papers = []
    for p, subj in sorted(rows, key=lambda r: (r[0].exam_date, r[0].start_time or datetime.min.time())):
        end = None
        if p.start_time and p.duration_minutes:
            end = (datetime.combine(p.exam_date, p.start_time) + timedelta(minutes=p.duration_minutes)).time()
        papers.append(
            {
                "paper_id": p.id,
                "subject_name": subj.name,
                "subject_code": subj.code,
                "exam_date": p.exam_date,
                "start_time": p.start_time,
                "end_time": end,
                "duration_minutes": p.duration_minutes,
                "max_marks": p.max_marks,
                "syllabus": p.syllabus,
                "room_name": seats.get(p.id),
            }
        )
    return {
        "exam_id": exam.id,
        "exam_name": exam.name,
        "exam_kind": exam.kind.value,
        "start_date": exam.start_date,
        "end_date": exam.end_date,
        "is_published": exam.is_published,
        "instructions": exam.instructions,
        "class_name": cls.name,
        "section_name": section.name if section else None,
        "papers": papers,
        "admit_card_available": True,
    }


def upcoming_exam_schedules(db: Session, parent_user_id: int, student_id: int) -> list[dict]:
    """Exams that have not finished yet and have papers for the child's class,
    soonest first."""
    st = _child(db, parent_user_id, student_id)
    exams = db.execute(
        select(Exam)
        .where(Exam.school_id == st.school_id, Exam.end_date >= date.today())
        .order_by(Exam.start_date, Exam.id)
    ).scalars()
    return [s for s in (_schedule(db, st, e) for e in exams) if s]


def exam_schedule(db: Session, parent_user_id: int, student_id: int, exam_id: int) -> dict:
    st = _child(db, parent_user_id, student_id)
    exam = db.get(Exam, exam_id)
    s = _schedule(db, st, exam) if exam and exam.school_id == st.school_id else None
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No papers for this child in that exam")
    return s


def admit_card_pdf(db: Session, parent_user_id: int, student_id: int, exam_id: int) -> tuple[bytes, str]:
    from app.services import exam_ops_service

    st = _child(db, parent_user_id, student_id)
    exam = db.get(Exam, exam_id)
    if not exam or exam.school_id != st.school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exam not found")
    if exam.end_date < date.today():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This exam is over; its admit card is no longer issued")
    return exam_ops_service.admit_card_pdf(db, st.school_id, exam_id, st.id)
