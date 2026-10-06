"""Lesson attendance, corrections to the register, and chasing the children
who keep not being here.

The daily register already works and is not touched by any of this. What is
added is the three things a school does around it: mark a lesson, dispute a
mark, and record that somebody rang home.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import AttendanceStatus, ContactMethod, CorrectionStatus, UserRole
from app.models.academic import SchoolClass, Section
from app.models.attendance import StudentAttendance
from app.models.attendance_ops import AbsenceContact, AttendanceCorrection, PeriodAttendance
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.timetable import Period, TimetableEntry
from app.models.user import User


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _400(why: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, why)


def _roster(db: Session, section_id: int) -> list[Student]:
    return list(db.execute(
        select(Student)
        .where(Student.section_id == section_id, Student.is_active.is_(True))
        .order_by(Student.roll_no, Student.id)
    ).scalars())


# ---------- one lesson ----------


def period_grid(db: Session, school_id: int, section_id: int, on: date,
                period_id: int) -> dict:
    """The roster for one lesson, with whatever was already marked.

    Seeded from the day's register rather than starting blank: a child marked
    absent this morning is almost certainly absent this afternoon, and making
    somebody retype thirty marks they have already given is how period
    attendance stops being used by the end of the first week.
    """
    section = db.get(Section, section_id)
    if not section or section.school_id != school_id:
        raise _404("Section")
    period = db.get(Period, period_id)
    if not period or period.school_id != school_id:
        raise _404("Period")
    if period.is_break:
        raise _400("That is a break, not a lesson.")

    entry = db.execute(
        select(TimetableEntry).where(
            TimetableEntry.section_id == section_id,
            TimetableEntry.period_id == period_id,
        )
    ).scalar_one_or_none()
    cs = db.get(ClassSubject, entry.class_subject_id) if entry else None
    subject = db.get(Subject, cs.subject_id) if cs else None

    marked = {
        m.student_id: m for m in db.execute(
            select(PeriodAttendance).where(
                PeriodAttendance.section_id == section_id,
                PeriodAttendance.date == on,
                PeriodAttendance.period_id == period_id,
            )
        ).scalars()
    }
    day = {
        d.student_id: d for d in db.execute(
            select(StudentAttendance).where(
                StudentAttendance.section_id == section_id, StudentAttendance.date == on
            )
        ).scalars()
    }

    rows = []
    for s in _roster(db, section_id):
        here = marked.get(s.id)
        today = day.get(s.id)
        rows.append({
            "student_id": s.id,
            "admission_no": s.admission_no,
            "student_name": s.full_name,
            "roll_no": s.roll_no,
            "status": (here.status.value if here else
                       today.status.value if today else AttendanceStatus.present.value),
            "remark": here.remark if here else None,
            "already_marked": here is not None,
            "day_status": today.status.value if today else None,
        })

    return {
        "section_id": section_id,
        "date": on,
        "period_id": period_id,
        "period_number": period.period_number,
        "period_label": period.label,
        "start_time": period.start_time,
        "end_time": period.end_time,
        "class_subject_id": cs.id if cs else None,
        "subject_name": subject.name if subject else None,
        "rows": rows,
        "marked": sum(1 for r in rows if r["already_marked"]),
    }


def save_period(db: Session, school_id: int, tenant_id: int, user_id: int,
                section_id: int, on: date, period_id: int,
                entries: list[dict]) -> dict:
    grid = period_grid(db, school_id, section_id, on, period_id)
    valid = {s.id for s in _roster(db, section_id)}

    for e in entries:
        sid = int(e["student_id"])
        if sid not in valid:
            raise _400("That child is not in this section.")
        st = AttendanceStatus(e["status"])
        row = db.execute(
            select(PeriodAttendance).where(
                PeriodAttendance.student_id == sid,
                PeriodAttendance.date == on,
                PeriodAttendance.period_id == period_id,
            )
        ).scalar_one_or_none()
        if row is None:
            row = PeriodAttendance(
                tenant_id=tenant_id, school_id=school_id, student_id=sid,
                section_id=section_id, period_id=period_id, date=on,
                class_subject_id=grid["class_subject_id"], status=st,
            )
            db.add(row)
        row.status = st
        row.remark = (e.get("remark") or None)
        row.marked_by_user_id = user_id
    db.commit()
    return period_grid(db, school_id, section_id, on, period_id)


def period_gaps(db: Session, school_id: int, section_id: int, on: date) -> dict:
    """Children present this morning who are missing from a lesson.

    This is the only reason to mark attendance twice a day: it finds the child
    who came through the gate and never reached the classroom.
    """
    day = {
        d.student_id: d for d in db.execute(
            select(StudentAttendance).where(
                StudentAttendance.section_id == section_id, StudentAttendance.date == on
            )
        ).scalars()
    }
    present_today = {
        sid for sid, d in day.items()
        if d.status in (AttendanceStatus.present, AttendanceStatus.late)
    }

    rows = db.execute(
        select(PeriodAttendance, Period)
        .join(Period, Period.id == PeriodAttendance.period_id)
        .where(
            PeriodAttendance.section_id == section_id,
            PeriodAttendance.date == on,
            PeriodAttendance.status == AttendanceStatus.absent,
        )
        .order_by(Period.period_number)
    ).all()

    out = []
    for pa, period in rows:
        if pa.student_id not in present_today:
            continue  # absent all day; not a gap, just absent
        s = db.get(Student, pa.student_id)
        out.append({
            "student_id": pa.student_id,
            "student_name": s.full_name if s else None,
            "admission_no": s.admission_no if s else None,
            "period_number": period.period_number,
            "period_label": period.label,
            "remark": pa.remark,
        })
    return {"date": on, "section_id": section_id, "gaps": out, "count": len(out)}


# ---------- late in, early out ----------


def set_times(db: Session, school_id: int, student_id: int, on: date, *,
              arrived_at: Optional[time], left_at: Optional[time],
              remark: Optional[str] = None, authorised_by: Optional[str] = None,
              recorded_by: Optional[int] = None) -> dict:
    """Record a late arrival or an early departure on the day's own row."""
    row = db.execute(
        select(StudentAttendance).where(
            StudentAttendance.student_id == student_id,
            StudentAttendance.date == on,
            StudentAttendance.school_id == school_id,
        )
    ).scalar_one_or_none()
    if row is None:
        raise _400("That child has no attendance marked for that day yet.")
    if arrived_at and left_at and left_at <= arrived_at:
        raise _400("They cannot have left before they arrived.")
    row.arrived_at = arrived_at
    row.left_at = left_at
    if remark:
        row.remark = remark
    row.times_authorised_by = (authorised_by or "").strip() or None
    row.times_recorded_by_user_id = recorded_by
    db.commit()
    return {
        "student_id": student_id, "date": on,
        "arrived_at": row.arrived_at, "left_at": row.left_at,
        "status": row.status.value, "remark": row.remark,
        "authorised_by": row.times_authorised_by,
    }


def late_and_early(db: Session, school_id: int, *, frm: date, to: date) -> dict:
    """Everybody who came in late or went home early, over a window."""
    rows = db.execute(
        select(StudentAttendance, Student, Section.name, SchoolClass.name)
        .join(Student, Student.id == StudentAttendance.student_id)
        .join(Section, Section.id == StudentAttendance.section_id, isouter=True)
        .join(SchoolClass, SchoolClass.id == Section.class_id, isouter=True)
        .where(
            StudentAttendance.school_id == school_id,
            StudentAttendance.date >= frm,
            StudentAttendance.date <= to,
            # A check-in time on its own (the teacher's register notes one for
            # everybody) is not a late entry: it must be marked late, or have
            # been logged at the late/early desk.
            ((StudentAttendance.arrived_at.is_not(None))
             & ((StudentAttendance.status == AttendanceStatus.late)
                | StudentAttendance.times_recorded_by_user_id.is_not(None)))
            | (StudentAttendance.left_at.is_not(None)),
        )
        .order_by(StudentAttendance.date.desc())
    ).all()
    uids = {a.times_recorded_by_user_id for a, *_ in rows if a.times_recorded_by_user_id}
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_(uids))).all()) if uids else {}
    out = [
        {
            "student_id": s.id, "student_name": s.full_name,
            "admission_no": s.admission_no,
            "section_label": f"{cls} {sec}" if cls and sec else None,
            "date": a.date, "status": a.status.value,
            "arrived_at": a.arrived_at, "left_at": a.left_at, "remark": a.remark,
            "authorised_by": a.times_authorised_by,
            "recorded_by_name": names.get(a.times_recorded_by_user_id),
        }
        for a, s, sec, cls in rows
    ]
    # Repeat offenders are the point: one late morning is weather, ten is a
    # conversation with a parent.
    counts: dict[int, int] = {}
    for r in out:
        counts[r["student_id"]] = counts.get(r["student_id"], 0) + 1
    for r in out:
        r["times_in_window"] = counts[r["student_id"]]
    return {"from_date": frm, "to_date": to, "rows": out, "count": len(out)}


# ---------- disputing a mark ----------


def request_correction(db: Session, school_id: int, tenant_id: int, user_id: int,
                       student_id: int, on: date, to_status: AttendanceStatus,
                       reason: str) -> dict:
    student = db.get(Student, student_id)
    if not student or student.school_id != school_id:
        raise _404("Student")
    if not reason or len(reason.strip()) < 3:
        raise _400("Say why the register is wrong.")

    existing = db.execute(
        select(StudentAttendance).where(
            StudentAttendance.student_id == student_id, StudentAttendance.date == on
        )
    ).scalar_one_or_none()
    if existing and existing.status == to_status:
        raise _400("The register already says that.")

    open_already = db.execute(
        select(AttendanceCorrection).where(
            AttendanceCorrection.student_id == student_id,
            AttendanceCorrection.date == on,
            AttendanceCorrection.status == CorrectionStatus.pending,
        )
    ).scalar_one_or_none()
    if open_already:
        raise _400("A correction for that child and day is already waiting.")

    row = AttendanceCorrection(
        tenant_id=tenant_id, school_id=school_id, student_id=student_id,
        section_id=student.section_id, date=on,
        from_status=existing.status if existing else None,
        to_status=to_status, reason=reason.strip(),
        status=CorrectionStatus.pending, requested_by_user_id=user_id,
    )
    db.add(row)
    db.commit()
    return correction_to_dict(db, row)


def decide_correction(db: Session, school_id: int, user_id: int,
                      correction_id: int, approve: bool,
                      note: Optional[str] = None) -> dict:
    row = db.get(AttendanceCorrection, correction_id)
    if not row or row.school_id != school_id:
        raise _404("Correction")
    if row.status != CorrectionStatus.pending:
        raise _400("That has already been decided.")
    if row.requested_by_user_id == user_id:
        raise _400("Somebody else has to agree to a change you asked for.")

    row.status = CorrectionStatus.approved if approve else CorrectionStatus.rejected
    row.decided_by_user_id = user_id
    row.decided_at = datetime.now(timezone.utc)
    row.decision_note = note

    if approve:
        # Approving is what changes the register. Nothing else here writes to
        # it, so an attendance mark can only move with a reason attached.
        mark = db.execute(
            select(StudentAttendance).where(
                StudentAttendance.student_id == row.student_id,
                StudentAttendance.date == row.date,
            )
        ).scalar_one_or_none()
        if mark is None:
            mark = StudentAttendance(
                tenant_id=row.tenant_id, school_id=row.school_id,
                student_id=row.student_id, section_id=row.section_id,
                date=row.date, status=row.to_status,
            )
            db.add(mark)
        mark.status = row.to_status
        mark.marked_by_user_id = user_id
    db.commit()
    return correction_to_dict(db, row)


def correction_to_dict(db: Session, row: AttendanceCorrection) -> dict:
    s = db.get(Student, row.student_id)
    asked = db.get(User, row.requested_by_user_id) if row.requested_by_user_id else None
    decided = db.get(User, row.decided_by_user_id) if row.decided_by_user_id else None
    section = db.get(Section, row.section_id) if row.section_id else None
    cls = db.get(SchoolClass, section.class_id) if section else None
    return {
        "id": row.id,
        "student_id": row.student_id,
        "student_name": s.full_name if s else None,
        "admission_no": s.admission_no if s else None,
        "section_label": f"{cls.name} {section.name}" if cls and section else None,
        "date": row.date,
        "from_status": row.from_status.value if row.from_status else None,
        "to_status": row.to_status.value,
        "reason": row.reason,
        "status": row.status.value,
        "requested_by": asked.full_name if asked else None,
        "requested_by_user_id": row.requested_by_user_id,
        "decided_by": decided.full_name if decided else None,
        "decided_at": row.decided_at,
        "decision_note": row.decision_note,
        "created_at": row.created_at,
    }


def list_corrections(db: Session, school_id: int, *,
                     state: Optional[CorrectionStatus] = None,
                     requested_by: Optional[int] = None) -> list[dict]:
    stmt = select(AttendanceCorrection).where(AttendanceCorrection.school_id == school_id)
    if requested_by is not None:
        stmt = stmt.where(AttendanceCorrection.requested_by_user_id == requested_by)
    if state:
        stmt = stmt.where(AttendanceCorrection.status == state)
    rows = db.execute(stmt.order_by(AttendanceCorrection.created_at.desc()).limit(200)).scalars()
    return [correction_to_dict(db, r) for r in rows]


# ---------- chasing the children who are not here ----------


def log_contact(db: Session, school_id: int, tenant_id: int, user_id: int,
                student_id: int, *, method: ContactMethod, note: str,
                spoke_to: Optional[str] = None, agreed_action: Optional[str] = None,
                follow_up_on: Optional[date] = None,
                contacted_on: Optional[date] = None) -> dict:
    student = db.get(Student, student_id)
    if not student or student.school_id != school_id:
        raise _404("Student")
    if not note or len(note.strip()) < 3:
        raise _400("Write down what was said.")
    row = AbsenceContact(
        tenant_id=tenant_id, school_id=school_id, student_id=student_id,
        contacted_on=contacted_on or date.today(), method=method,
        spoke_to=spoke_to, note=note.strip(), agreed_action=agreed_action,
        follow_up_on=follow_up_on, recorded_by_user_id=user_id,
    )
    db.add(row)
    db.commit()
    return contact_to_dict(db, row)


def contact_to_dict(db: Session, row: AbsenceContact) -> dict:
    s = db.get(Student, row.student_id)
    by = db.get(User, row.recorded_by_user_id) if row.recorded_by_user_id else None
    return {
        "id": row.id,
        "student_id": row.student_id,
        "student_name": s.full_name if s else None,
        "admission_no": s.admission_no if s else None,
        "contacted_on": row.contacted_on,
        "method": row.method.value,
        "spoke_to": row.spoke_to,
        "note": row.note,
        "agreed_action": row.agreed_action,
        "follow_up_on": row.follow_up_on,
        "recorded_by": by.full_name if by else None,
    }


def at_risk(db: Session, school_id: int, *, below: float = 75.0,
            days: int = 120, min_days: int = 10) -> dict:
    """The chronic-absence list, with what has been done about each child.

    The report on its own re-discovers the same children every month. Pairing
    it with the contact log turns it into a worklist: who is slipping, when
    anybody last spoke to the family, and who is due a follow-up today.
    """
    from app.services import analytics_service

    today = date.today()
    found = analytics_service.chronic_absence(
        db, school_id, below=below, frm=today - timedelta(days=days), to=today,
        min_days=min_days,
    )

    ids = [s["student_id"] for s in found["students"]]
    last: dict[int, AbsenceContact] = {}
    if ids:
        for row in db.execute(
            select(AbsenceContact)
            .where(AbsenceContact.student_id.in_(ids))
            .order_by(AbsenceContact.contacted_on.desc())
        ).scalars():
            last.setdefault(row.student_id, row)

    rows = []
    for s in found["students"]:
        c = last.get(s["student_id"])
        rows.append({
            **s,
            "last_contact_on": c.contacted_on if c else None,
            "last_contact_method": c.method.value if c else None,
            "last_contact_note": c.note if c else None,
            "follow_up_on": c.follow_up_on if c else None,
            "follow_up_due": bool(c and c.follow_up_on and c.follow_up_on <= today),
            "never_contacted": c is None,
        })

    return {
        "below": below,
        "from_date": found["from_date"],
        "to_date": found["to_date"],
        "students": rows,
        "count": len(rows),
        "never_contacted": sum(1 for r in rows if r["never_contacted"]),
        "follow_ups_due": sum(1 for r in rows if r["follow_up_due"]),
    }


def contact_history(db: Session, school_id: int, student_id: int) -> list[dict]:
    rows = db.execute(
        select(AbsenceContact)
        .where(AbsenceContact.school_id == school_id, AbsenceContact.student_id == student_id)
        .order_by(AbsenceContact.contacted_on.desc())
    ).scalars()
    return [contact_to_dict(db, r) for r in rows]
