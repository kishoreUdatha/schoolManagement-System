"""Student 360: everything a teacher needs about one child, in one answer.

A teacher opening a child's record was making the office's rounds — marks in
one screen, attendance in another, fees and documents behind doors they don't
have keys to. This assembles the same records, read-only, for a teacher who
already teaches that child (the caller checks that first).

Each section here answers one panel of the screen, so a panel that has nothing
to show comes back empty rather than missing.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import (
    AttendanceStatus,
    DocumentOwner,
    FeeStatus,
    SubmissionStatus,
)
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.attendance import StudentAttendance
from app.models.document import Document
from app.models.events import PtmSession, PtmSlot
from app.models.exam import Exam, ExamSubject
from app.models.fee import FeeHead, StudentFee
from app.models.foundation import Guardian, StudentEnrollment, StudentGuardian
from app.models.health import MedicalProfile
from app.models.homework import Homework, HomeworkSubmission
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.transport import TransportAssignment, TransportRoute, TransportStop
from app.models.user import User
from app.services import student_detail_service
from app.services.homework_service import visible_now
from app.services.student_profile_service import (
    _attendance_summary,
    _parents,
    _recent_behaviour,
)

# How far back the panels look. A term's worth of school days is enough to
# show a pattern without turning one child's record into a report run.
TREND_DAYS = 5
RECENT_DAYS = 30
WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _joined_on(db: Session, student: Student) -> Optional[date]:
    """The day the child joined: their first enrolment, else the day the
    record was created."""
    first = db.execute(
        select(func.min(StudentEnrollment.start_date)).where(
            StudentEnrollment.student_id == student.id
        )
    ).scalar()
    if first:
        return first
    return student.created_at.date() if student.created_at else None


# ---------- academics ----------


def _academic_summary(db: Session, student: Student) -> dict:
    """The mark sheet the other way round: a row per subject, a column per
    published exam, and the child's average across them."""
    history = student_detail_service.exam_history(
        db, student.school_id, student.id
    )
    # exam_history is newest first; a mark sheet reads oldest to newest.
    exams = list(reversed(history.get("exams", [])))
    columns = [e["exam_name"] for e in exams]
    rows: dict[str, dict] = {}
    for col, exam in enumerate(exams):
        for sub in exam["subjects"]:
            name = sub["subject_name"]
            row = rows.setdefault(
                name, {"subject_name": name, "marks": [None] * len(exams)}
            )
            got, out_of = sub["marks_obtained"], sub["max_marks"]
            if got is not None and out_of:
                row["marks"][col] = round(got / out_of * 100, 1)
    out = []
    for row in rows.values():
        seen = [m for m in row["marks"] if m is not None]
        row["average"] = round(sum(seen) / len(seen), 1) if seen else None
        out.append(row)
    out.sort(key=lambda r: r["subject_name"])
    overall = [r["average"] for r in out if r["average"] is not None]
    return {
        "columns": columns,
        "rows": out,
        "average": round(sum(overall) / len(overall), 1) if overall else None,
        "exams": [
            {
                "exam_id": e["exam_id"],
                "exam_name": e["exam_name"],
                "kind": e["kind"],
                "start_date": e["start_date"],
                "percent": e["percent"],
                "obtained": e["obtained"],
                "out_of": e["out_of"],
                "marked": e["marked"],
            }
            for e in reversed(exams)
        ],
    }


# ---------- attendance ----------

# What one day is worth on the trend chart. A child who came in late was still
# there; a half day counts for half, as the summary already counts it.
DAY_VALUE = {
    AttendanceStatus.present: 100,
    AttendanceStatus.late: 75,
    AttendanceStatus.half_day: 50,
    AttendanceStatus.absent: 0,
}


def _attendance(db: Session, student: Student) -> dict:
    days = list(
        db.execute(
            select(StudentAttendance)
            .where(StudentAttendance.student_id == student.id)
            .order_by(StudentAttendance.date.desc())
            .limit(RECENT_DAYS)
        ).scalars()
    )
    recent = [
        {
            "date": d.date,
            "status": d.status.value,
            "arrived_at": d.arrived_at,
            "left_at": d.left_at,
            "remark": d.remark,
        }
        for d in days
    ]
    # The chart reads left to right, oldest first.
    trend = [
        {
            "label": WEEKDAY[d.date.weekday()],
            "date": d.date,
            "status": d.status.value,
            "value": DAY_VALUE.get(d.status, 0),
        }
        for d in reversed(days[:TREND_DAYS])
    ]
    return {**_attendance_summary(db, student.id), "trend": trend, "recent": recent}


def _today(db: Session, student: Student) -> dict:
    row = db.execute(
        select(StudentAttendance).where(
            StudentAttendance.student_id == student.id,
            StudentAttendance.date == date.today(),
        )
    ).scalar_one_or_none()
    return {
        "status": row.status.value if row else None,
        "arrived_at": row.arrived_at if row else None,
        "left_at": row.left_at if row else None,
        "remark": row.remark if row else None,
    }


# ---------- homework ----------


def _homework(db: Session, student: Student, limit: int = 20) -> list[dict]:
    """Homework set for this child's class, with what they handed in."""
    section = db.get(Section, student.section_id)
    if not section:
        return []
    rows = db.execute(
        select(Homework, Subject.name, HomeworkSubmission)
        .join(ClassSubject, ClassSubject.id == Homework.class_subject_id, isouter=True)
        .join(Subject, Subject.id == ClassSubject.subject_id, isouter=True)
        .join(
            HomeworkSubmission,
            (HomeworkSubmission.homework_id == Homework.id)
            & (HomeworkSubmission.student_id == student.id),
            isouter=True,
        )
        .where(ClassSubject.class_id == section.class_id, visible_now())
        .order_by(Homework.due_date.desc())
        .limit(limit)
    ).all()
    today = date.today()
    out = []
    for hw, subject_name, sub in rows:
        if sub is None:
            state = "not_submitted" if hw.due_date < today else "pending"
        else:
            state = sub.status.value
        out.append(
            {
                "id": hw.id,
                "title": hw.title,
                "subject_name": subject_name,
                "due_date": hw.due_date,
                "is_past_due": hw.due_date < today,
                "status": state,
                "submitted_at": sub.submitted_at if sub else None,
                "marks": float(sub.marks) if sub and sub.marks is not None else None,
                "max_marks": float(hw.max_marks) if hw.max_marks is not None else None,
                "teacher_remark": sub.teacher_remark if sub else None,
            }
        )
    return out


def _homework_done(rows: list[dict]) -> tuple[int, int]:
    """How much of the homework set for this child they have handed in —
    whether or not the teacher has got round to marking it."""
    done = sum(
        1
        for r in rows
        if r["status"] in (SubmissionStatus.submitted.value, SubmissionStatus.approved.value)
    )
    return done, len(rows)


# ---------- family, health, transport ----------


def _guardians(db: Session, student: Student) -> list[dict]:
    rows = db.execute(
        select(StudentGuardian, Guardian)
        .join(Guardian, Guardian.id == StudentGuardian.guardian_id)
        .where(StudentGuardian.student_id == student.id)
        .order_by(StudentGuardian.is_primary.desc(), Guardian.full_name)
    ).all()
    return [
        {
            "guardian_id": g.id,
            "user_id": g.user_id,
            "full_name": g.full_name,
            "relation": link.relation.value,
            "phone": g.phone,
            "email": g.email,
            "occupation": g.occupation,
            "address": g.address,
            "is_primary": link.is_primary,
            "can_pickup": link.can_pickup,
            "is_emergency_contact": link.is_emergency_contact,
            "lives_with_student": link.lives_with_student,
        }
        for link, g in rows
    ]


def _health(db: Session, student: Student) -> dict:
    p = db.execute(
        select(MedicalProfile).where(MedicalProfile.student_id == student.id)
    ).scalar_one_or_none()
    return {
        "blood_group": student.blood_group,
        "allergies": p.allergies if p else None,
        "chronic_conditions": p.chronic_conditions if p else None,
        "current_medications": p.current_medications if p else None,
        "dietary_restrictions": p.dietary_restrictions if p else None,
        "disabilities": p.disabilities if p else None,
        "doctor_name": p.doctor_name if p else None,
        "doctor_phone": p.doctor_phone if p else None,
        "emergency_contact_name": p.emergency_contact_name if p else None,
        "emergency_contact_phone": p.emergency_contact_phone if p else None,
        "emergency_contact_relation": p.emergency_contact_relation if p else None,
        "notes": p.notes if p else None,
        "on_file": p is not None,
    }


def _transport(db: Session, student: Student) -> dict:
    today = date.today()
    row = db.execute(
        select(TransportAssignment, TransportRoute.name, TransportStop.name)
        .join(TransportRoute, TransportRoute.id == TransportAssignment.route_id, isouter=True)
        .join(TransportStop, TransportStop.id == TransportAssignment.stop_id, isouter=True)
        .where(TransportAssignment.student_id == student.id)
        .order_by(TransportAssignment.start_date.desc())
        .limit(1)
    ).first()
    if not row:
        return {"active": False, "route_name": None, "stop_name": None}
    a, route_name, stop_name = row
    active = a.start_date <= today and (a.end_date is None or a.end_date >= today)
    return {
        "active": active,
        "route_name": route_name,
        "stop_name": stop_name,
        "direction": a.direction.value if a.direction else None,
        "start_date": a.start_date,
        "end_date": a.end_date,
    }


# ---------- fees ----------


def _fees(db: Session, student: Student) -> dict:
    rows = db.execute(
        select(StudentFee, FeeHead.name)
        .join(FeeHead, FeeHead.id == StudentFee.fee_head_id, isouter=True)
        .where(StudentFee.student_id == student.id)
        .order_by(StudentFee.due_date.desc())
    ).all()
    items, due, paid = [], Decimal(0), Decimal(0)
    for f, head in rows:
        due += f.amount_due
        paid += f.amount_paid
        items.append(
            {
                "id": f.id,
                "head": head,
                "period": f.period,
                "due_date": f.due_date,
                "amount_due": float(f.amount_due),
                "amount_paid": float(f.amount_paid),
                "status": f.status.value,
                "paid_at": f.paid_at,
            }
        )
    pending = sum(
        (f.amount_due - f.amount_paid)
        for f, _ in rows
        if f.status == FeeStatus.pending
    )
    return {
        "total_due": float(due),
        "total_paid": float(paid),
        "pending": float(pending or 0),
        "rows": items,
    }


# ---------- documents ----------


def _documents(db: Session, student: Student) -> list[dict]:
    rows = db.execute(
        select(Document)
        .where(
            Document.school_id == student.school_id,
            Document.owner_type == DocumentOwner.student,
            Document.owner_id == student.id,
        )
        .order_by(Document.created_at.desc())
    ).scalars()
    return [
        {
            "id": d.id,
            "title": d.title,
            "original_name": d.original_name,
            "category": d.category.value,
            "size_bytes": d.size_bytes,
            "content_type": d.content_type,
            "uploaded_on": d.created_at,
        }
        for d in rows
    ]


# ---------- what is coming ----------


def _upcoming(db: Session, student: Student, fees: dict) -> list[dict]:
    """The next few things this child's family should expect: a meeting, a
    paper, a fee falling due."""
    today = date.today()
    out: list[dict] = []

    slots = db.execute(
        select(PtmSlot, PtmSession)
        .join(PtmSession, PtmSession.id == PtmSlot.session_id)
        .where(
            PtmSlot.student_id == student.id,
            PtmSession.meeting_date >= today,
        )
        .order_by(PtmSession.meeting_date)
        .limit(3)
    ).all()
    for slot, sess in slots:
        out.append(
            {
                "kind": "meeting",
                "title": sess.title,
                "on": datetime.combine(sess.meeting_date, slot.start_time),
                "note": sess.venue,
            }
        )

    section = db.get(Section, student.section_id)
    if section:
        papers = db.execute(
            select(ExamSubject, Exam.name, Subject.name)
            .join(Exam, Exam.id == ExamSubject.exam_id)
            .join(ClassSubject, ClassSubject.id == ExamSubject.class_subject_id)
            .join(Subject, Subject.id == ClassSubject.subject_id, isouter=True)
            .where(
                ClassSubject.class_id == section.class_id,
                ExamSubject.exam_date >= today,
            )
            .order_by(ExamSubject.exam_date)
            .limit(3)
        ).all()
        for paper, exam_name, subject_name in papers:
            out.append(
                {
                    "kind": "exam",
                    "title": f"{subject_name or 'Exam'} · {exam_name}",
                    "on": datetime.combine(
                        paper.exam_date, paper.start_time or datetime.min.time()
                    ),
                    "note": f"Out of {paper.max_marks}",
                }
            )

    nxt = [
        r
        for r in fees["rows"]
        if r["status"] == FeeStatus.pending.value and r["due_date"] >= today
    ]
    for r in sorted(nxt, key=lambda r: r["due_date"])[:2]:
        out.append(
            {
                "kind": "fee",
                "title": f"{r['head'] or 'Fee'} due",
                "on": datetime.combine(r["due_date"], datetime.min.time()),
                "note": f"₹{r['amount_due'] - r['amount_paid']:,.0f}",
            }
        )

    return sorted(out, key=lambda x: x["on"])[:6]


# ---------- what has happened ----------


def _activity(
    db: Session, homework: list[dict], notes: list[dict], fees: dict
) -> list[dict]:
    """One thread of what the school recorded about this child lately."""
    out: list[dict] = []
    for h in homework:
        if h["submitted_at"]:
            out.append(
                {
                    "kind": "homework",
                    "on": h["submitted_at"],
                    "title": h["title"],
                    "note": f"Handed in · {h['status'].replace('_', ' ')}",
                }
            )
    for n in notes:
        out.append(
            {
                "kind": "note",
                "on": n["created_at"],
                "title": n.get("teacher_note") or "Behaviour rated",
                "note": f"{n['period_key']} · average {n['average']}",
            }
        )
    for f in fees["rows"]:
        if f["paid_at"]:
            out.append(
                {
                    "kind": "fee",
                    "on": f["paid_at"],
                    "title": f"{f['head'] or 'Fee'} paid",
                    "note": f"₹{f['amount_paid']:,.0f}",
                }
            )
    out.sort(key=lambda x: x["on"], reverse=True)
    return out[:12]


# ---------- the whole record ----------


def _behaviour_label(notes: list[dict]) -> Optional[str]:
    """The four ratings, said the way a teacher would say them."""
    if not notes:
        return None
    avg = sum(n["average"] for n in notes) / len(notes)
    if avg >= 4.5:
        return "Excellent"
    if avg >= 3.5:
        return "Good"
    if avg >= 2.5:
        return "Fair"
    return "Needs work"


def build_360(db: Session, student: Student) -> dict:
    section = db.get(Section, student.section_id)
    cls = db.get(SchoolClass, section.class_id) if section else None
    year = db.get(AcademicYear, student.academic_year_id)
    class_teacher = (
        db.get(User, section.class_teacher_user_id)
        if section and section.class_teacher_user_id
        else None
    )

    academic = _academic_summary(db, student)
    attendance = _attendance(db, student)
    homework = _homework(db, student)
    done, total = _homework_done(homework)
    notes = _recent_behaviour(db, student.id)
    fees = _fees(db, student)
    transport = _transport(db, student)

    return {
        "id": student.id,
        "admission_no": student.admission_no,
        "full_name": student.full_name,
        "dob": student.dob,
        "gender": student.gender.value if student.gender else None,
        "photo_url": student.photo_url,
        "address": student.address,
        "is_active": student.is_active,
        "roll_no": student.roll_no,
        "joined_on": _joined_on(db, student),
        "section_id": student.section_id,
        "section_name": section.name if section else None,
        "class_name": cls.name if cls else None,
        "class_label": " ".join(
            x for x in [cls.name if cls else None, section.name if section else None] if x
        )
        or None,
        "academic_year_name": year.name if year else None,
        "class_teacher_name": class_teacher.full_name if class_teacher else None,
        "kpis": {
            "attendance_percent": attendance["attendance_percent"],
            "average_percent": academic["average"],
            "homework_done": done,
            "homework_total": total,
            "behaviour": _behaviour_label(notes),
            "transport": "Active" if transport["active"] else "Not using",
            "fees_pending": fees["pending"],
        },
        "today": _today(db, student),
        "academic": academic,
        "attendance": attendance,
        "homework": homework,
        "notes": notes,
        "parents": _parents(db, student.id),
        "guardians": _guardians(db, student),
        "health": _health(db, student),
        "transport": transport,
        "fees": fees,
        "documents": _documents(db, student),
        "upcoming": _upcoming(db, student, fees),
        "activity": _activity(db, homework, notes, fees),
    }
