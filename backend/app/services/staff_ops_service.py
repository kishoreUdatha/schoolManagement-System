"""Qualifications, workload, lesson observations and leaving.

staff_service.py owns the person — their record, their login, whether they
are active. This owns the four things a school asks about them afterwards.

Workload is computed here and stored nowhere. It is the timetable counted,
and a stored copy would be a second number to keep in step the moment anybody
moves a lesson.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from statistics import median
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import ClearanceArea, ExitClearanceStatus, UserRole
from app.models.academic import SchoolClass, Section
from app.models.document import Document
from app.models.homework import Homework
from app.models.mark import Mark
from app.models.staff import Staff
from app.models.staff_ops import (
    ClassroomObservation,
    ExitClearance,
    ExitClearanceItem,
    StaffQualification,
)
from app.models.subject import ClassSubject, Subject
from app.models.timetable import Period, TimetableEntry
from app.models.user import User


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _400(why: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, why)


def _staff(db: Session, school_id: int, staff_id: int) -> Staff:
    s = db.get(Staff, staff_id)
    if not s or s.school_id != school_id:
        raise _404("Staff member")
    return s


def _label(db: Session, s: Staff) -> dict:
    u = s.user
    return {
        "staff_id": s.id,
        "user_id": s.user_id,
        "employee_no": s.employee_no,
        "full_name": u.full_name,
        "email": u.email,
        "phone": u.phone,
        "role": u.role.value,
        "designation": s.designation,
        "joining_date": s.joining_date,
        "department_name": s.department.name if s.department_id and s.department else None,
        "is_active": u.is_active,
        "last_login_at": u.last_login_at,
    }


# ---------- one person, everything on one screen ----------


def profile(db: Session, school_id: int, staff_id: int) -> dict:
    """Everything about one member of staff, gathered rather than linked.

    The list page could already open a modal with their name and phone in it.
    What it could not do is answer "who is this person, what do they teach,
    are they qualified for it, and is anything outstanding" without four
    separate trips.
    """
    s = _staff(db, school_id, staff_id)
    load = _workload_for(db, school_id, s)

    quals = list(db.execute(
        select(StaffQualification)
        .where(StaffQualification.staff_id == staff_id)
        .order_by(StaffQualification.year_awarded.desc().nullslast())
    ).scalars())

    docs = list(db.execute(
        select(Document)
        .where(
            Document.school_id == school_id,
            Document.owner_type == "staff",
            Document.owner_id == staff_id,
        )
        .order_by(Document.created_at.desc())
    ).scalars())

    observations = list(db.execute(
        select(ClassroomObservation)
        .where(ClassroomObservation.staff_id == staff_id)
        .order_by(ClassroomObservation.observed_on.desc())
        .limit(5)
    ).scalars())

    clearance = db.execute(
        select(ExitClearance)
        .where(ExitClearance.staff_id == staff_id)
        .order_by(ExitClearance.created_at.desc())
    ).scalars().first()

    return {
        **_label(db, s),
        "workload": load,
        "qualifications": [_qual_to_dict(db, q) for q in quals],
        "documents": [
            {
                "id": d.id,
                "title": d.title,
                "category": d.category.value,
                "verification_status": d.verification_status.value,
                "expires_on": d.expires_on,
                "uploaded_at": d.created_at,
            }
            for d in docs
        ],
        "recent_observations": [_obs_to_dict(db, o) for o in observations],
        "exit_clearance_id": clearance.id if clearance else None,
        "exit_status": clearance.status.value if clearance else None,
    }


# ---------- what they are qualified to do ----------


def _qual_to_dict(db: Session, q: StaffQualification) -> dict:
    verifier = db.get(User, q.verified_by_user_id) if q.verified_by_user_id else None
    doc = db.get(Document, q.document_id) if q.document_id else None
    return {
        "id": q.id,
        "staff_id": q.staff_id,
        "qualification": q.qualification,
        "institution": q.institution,
        "year_awarded": q.year_awarded,
        "subject_area": q.subject_area,
        "document_id": q.document_id,
        "document_title": doc.title if doc else None,
        "verified_at": q.verified_at,
        "verified_by": verifier.full_name if verifier else None,
    }


def list_qualifications(db: Session, school_id: int, staff_id: int) -> dict:
    s = _staff(db, school_id, staff_id)
    rows = list(db.execute(
        select(StaffQualification)
        .where(StaffQualification.staff_id == staff_id)
        .order_by(StaffQualification.year_awarded.desc().nullslast())
    ).scalars())
    docs = list(db.execute(
        select(Document)
        .where(
            Document.school_id == school_id,
            Document.owner_type == "staff",
            Document.owner_id == staff_id,
        )
        .order_by(Document.created_at.desc())
    ).scalars())
    return {
        **_label(db, s),
        "qualifications": [_qual_to_dict(db, q) for q in rows],
        "unverified": sum(1 for q in rows if q.verified_at is None),
        "documents": [
            {
                "id": d.id,
                "title": d.title,
                "category": d.category.value,
                "verification_status": d.verification_status.value,
                "expires_on": d.expires_on,
            }
            for d in docs
        ],
    }


def add_qualification(db: Session, school_id: int, tenant_id: int, staff_id: int,
                      data: dict) -> dict:
    _staff(db, school_id, staff_id)
    if not (data.get("qualification") or "").strip():
        raise _400("A qualification needs a name.")
    year = data.get("year_awarded")
    if year and (year < 1900 or year > date.today().year):
        raise _400("That year is not a year anybody was awarded anything in.")
    if data.get("document_id"):
        doc = db.get(Document, data["document_id"])
        if not doc or doc.school_id != school_id:
            raise _404("Document")

    row = StaffQualification(
        tenant_id=tenant_id, school_id=school_id, staff_id=staff_id,
        qualification=data["qualification"].strip(),
        institution=(data.get("institution") or None),
        year_awarded=year,
        subject_area=(data.get("subject_area") or None),
        document_id=data.get("document_id"),
    )
    db.add(row)
    db.commit()
    return _qual_to_dict(db, row)


def verify_qualification(db: Session, school_id: int, user_id: int,
                         qualification_id: int, verified: bool) -> dict:
    row = db.get(StaffQualification, qualification_id)
    if not row or row.school_id != school_id:
        raise _404("Qualification")
    row.verified_at = datetime.now(timezone.utc) if verified else None
    row.verified_by_user_id = user_id if verified else None
    db.commit()
    return _qual_to_dict(db, row)


def delete_qualification(db: Session, school_id: int, qualification_id: int) -> None:
    row = db.get(StaffQualification, qualification_id)
    if not row or row.school_id != school_id:
        raise _404("Qualification")
    db.delete(row)
    db.commit()


# ---------- workload ----------


def _workload_for(db: Session, school_id: int, s: Staff) -> dict:
    """One person's teaching load, counted off the timetable.

    Periods a week is the number that matters — it is what a teacher feels and
    what a timetabler has to balance. The rest is context.
    """
    user_id = s.user_id

    subject_ids = list(db.execute(
        select(ClassSubject.id).where(ClassSubject.teacher_user_id == user_id)
    ).scalars())

    periods_per_week = 0
    sections_taught: set[int] = set()
    if subject_ids:
        rows = db.execute(
            select(TimetableEntry, Period.is_break)
            .join(Period, Period.id == TimetableEntry.period_id)
            .where(TimetableEntry.class_subject_id.in_(subject_ids))
        ).all()
        for entry, is_break in rows:
            if is_break:
                continue  # a duty in a break is not a taught period
            periods_per_week += 1
            sections_taught.add(entry.section_id)

    class_teacher_of = list(db.execute(
        select(Section.id, Section.name, SchoolClass.name)
        .join(SchoolClass, SchoolClass.id == Section.class_id, isouter=True)
        .where(Section.class_teacher_user_id == user_id)
    ).all())

    subjects = []
    for cs_id in subject_ids:
        cs = db.get(ClassSubject, cs_id)
        subject = db.get(Subject, cs.subject_id) if cs else None
        cls = db.get(SchoolClass, cs.class_id) if cs else None
        if subject:
            subjects.append({
                "class_subject_id": cs_id,
                "subject_name": subject.name,
                "class_name": cls.name if cls else None,
            })

    homework_set = db.execute(
        select(func.count(Homework.id)).where(Homework.created_by_user_id == user_id)
    ).scalar_one()
    marks_entered = db.execute(
        select(func.count(Mark.id)).where(
            Mark.marked_by_user_id == user_id, Mark.marked_at.is_not(None)
        )
    ).scalar_one()

    return {
        "periods_per_week": periods_per_week,
        "subjects_taught": len(subject_ids),
        "sections_taught": len(sections_taught),
        "class_teacher_of": [
            {"section_id": sid, "label": f"{cname} {sname}" if cname else sname}
            for sid, sname, cname in class_teacher_of
        ],
        "subjects": subjects,
        "homework_set": homework_set,
        "marks_entered": marks_entered,
    }


def workload(db: Session, school_id: int) -> dict:
    """Every teacher's load side by side.

    Nobody is flagged as overloaded. A threshold would be a number this code
    invented about somebody else's school — twenty-four periods is punishing
    in one place and light in another. The median is shown instead, because
    it is a fact about this staff room rather than a target imported into it.
    """
    staff_rows = list(db.execute(
        select(Staff)
        .join(User, User.id == Staff.user_id)
        .where(
            Staff.school_id == school_id,
            User.is_active.is_(True),
            User.role.in_([UserRole.teacher, UserRole.principal]),
        )
        .order_by(User.full_name)
    ).scalars())

    rows = []
    for s in staff_rows:
        load = _workload_for(db, school_id, s)
        rows.append({**_label(db, s), **load})

    teaching = [r["periods_per_week"] for r in rows if r["periods_per_week"] > 0]
    return {
        "staff": rows,
        "count": len(rows),
        "teaching_count": len(teaching),
        # Median rather than mean: one person on a half timetable drags an
        # average somewhere nobody actually sits.
        "median_periods": round(median(teaching), 1) if teaching else 0,
        "total_periods": sum(r["periods_per_week"] for r in rows),
        "without_timetable": sum(1 for r in rows if r["periods_per_week"] == 0),
    }


# ---------- sitting in on a lesson ----------


def _obs_to_dict(db: Session, o: ClassroomObservation) -> dict:
    observer = db.get(User, o.observer_user_id) if o.observer_user_id else None
    s = db.get(Staff, o.staff_id)
    cs = db.get(ClassSubject, o.class_subject_id) if o.class_subject_id else None
    subject = db.get(Subject, cs.subject_id) if cs else None
    section = db.get(Section, o.section_id) if o.section_id else None
    cls = db.get(SchoolClass, section.class_id) if section else None
    return {
        "id": o.id,
        "staff_id": o.staff_id,
        "staff_name": s.user.full_name if s else None,
        "observed_on": o.observed_on,
        "observer_name": observer.full_name if observer else None,
        "subject_name": subject.name if subject else None,
        "section_label": f"{cls.name} {section.name}" if cls and section else None,
        "focus": o.focus,
        "strengths": o.strengths,
        "next_steps": o.next_steps,
        "follow_up_on": o.follow_up_on,
        "shared_with_staff": o.shared_with_staff,
        "created_at": o.created_at,
    }


def list_observations(db: Session, school_id: int, *,
                      staff_id: Optional[int] = None) -> dict:
    stmt = select(ClassroomObservation).where(ClassroomObservation.school_id == school_id)
    if staff_id:
        stmt = stmt.where(ClassroomObservation.staff_id == staff_id)
    rows = list(db.execute(
        stmt.order_by(ClassroomObservation.observed_on.desc()).limit(200)
    ).scalars())
    today = date.today()
    return {
        "observations": [_obs_to_dict(db, o) for o in rows],
        "count": len(rows),
        "unshared": sum(1 for o in rows if not o.shared_with_staff),
        "follow_ups_due": sum(
            1 for o in rows if o.follow_up_on and o.follow_up_on <= today
        ),
    }


def add_observation(db: Session, school_id: int, tenant_id: int, user_id: int,
                    data: dict) -> dict:
    staff_id = int(data["staff_id"])
    s = _staff(db, school_id, staff_id)
    if s.user_id == user_id:
        raise _400("Somebody else has to observe the lesson.")
    if not (data.get("strengths") or data.get("next_steps")):
        raise _400(
            "An observation with neither a strength nor a next step says nothing."
        )

    row = ClassroomObservation(
        tenant_id=tenant_id, school_id=school_id, staff_id=staff_id,
        observed_on=data.get("observed_on") or date.today(),
        observer_user_id=user_id,
        class_subject_id=data.get("class_subject_id"),
        section_id=data.get("section_id"),
        focus=(data.get("focus") or None),
        strengths=(data.get("strengths") or None),
        next_steps=(data.get("next_steps") or None),
        follow_up_on=data.get("follow_up_on"),
        shared_with_staff=bool(data.get("shared_with_staff", False)),
    )
    db.add(row)
    db.commit()
    return _obs_to_dict(db, row)


def share_observation(db: Session, school_id: int, observation_id: int,
                      shared: bool) -> dict:
    row = db.get(ClassroomObservation, observation_id)
    if not row or row.school_id != school_id:
        raise _404("Observation")
    row.shared_with_staff = shared
    db.commit()
    return _obs_to_dict(db, row)


# ---------- leaving ----------


def _clearance_to_dict(db: Session, c: ExitClearance) -> dict:
    s = db.get(Staff, c.staff_id)
    started = db.get(User, c.initiated_by_user_id) if c.initiated_by_user_id else None
    items = list(db.execute(
        select(ExitClearanceItem)
        .where(ExitClearanceItem.clearance_id == c.id)
        .order_by(ExitClearanceItem.id)
    ).scalars())
    rows = []
    for i in items:
        by = db.get(User, i.cleared_by_user_id) if i.cleared_by_user_id else None
        rows.append({
            "id": i.id,
            "area": i.area.value,
            "is_cleared": i.is_cleared,
            "cleared_by": by.full_name if by else None,
            "cleared_at": i.cleared_at,
            "note": i.note,
        })
    outstanding = [r["area"] for r in rows if not r["is_cleared"]]
    return {
        "id": c.id,
        "staff_id": c.staff_id,
        "staff_name": s.user.full_name if s else None,
        "employee_no": s.employee_no if s else None,
        "last_working_day": c.last_working_day,
        "reason": c.reason,
        "status": c.status.value,
        "initiated_by": started.full_name if started else None,
        "completed_at": c.completed_at,
        "items": rows,
        "outstanding": outstanding,
        "outstanding_count": len(outstanding),
        "can_complete": not outstanding and c.status == ExitClearanceStatus.in_progress,
        "is_active": s.user.is_active if s else None,
    }


def start_clearance(db: Session, school_id: int, tenant_id: int, user_id: int,
                    staff_id: int, *, last_working_day: Optional[date] = None,
                    reason: Optional[str] = None,
                    areas: Optional[list[ClearanceArea]] = None) -> dict:
    _staff(db, school_id, staff_id)
    open_already = db.execute(
        select(ExitClearance).where(
            ExitClearance.staff_id == staff_id,
            ExitClearance.status == ExitClearanceStatus.in_progress,
        )
    ).scalar_one_or_none()
    if open_already:
        raise _400("This person already has a clearance under way.")

    c = ExitClearance(
        tenant_id=tenant_id, school_id=school_id, staff_id=staff_id,
        last_working_day=last_working_day, reason=reason,
        status=ExitClearanceStatus.in_progress, initiated_by_user_id=user_id,
    )
    db.add(c)
    db.flush()
    # Every area by default. A school that does not lend books still has to
    # say so, because "not applicable" and "nobody checked" look identical
    # once the person has gone.
    for area in (areas or list(ClearanceArea)):
        db.add(ExitClearanceItem(clearance_id=c.id, area=area))
    db.commit()
    return _clearance_to_dict(db, c)


def clear_item(db: Session, school_id: int, user_id: int, item_id: int,
               cleared: bool, note: Optional[str] = None) -> dict:
    item = db.get(ExitClearanceItem, item_id)
    if not item:
        raise _404("Clearance item")
    c = db.get(ExitClearance, item.clearance_id)
    if not c or c.school_id != school_id:
        raise _404("Clearance item")
    if c.status != ExitClearanceStatus.in_progress:
        raise _400("That clearance is closed.")
    item.is_cleared = cleared
    item.cleared_by_user_id = user_id if cleared else None
    item.cleared_at = datetime.now(timezone.utc) if cleared else None
    item.note = note
    db.commit()
    return _clearance_to_dict(db, c)


def complete_clearance(db: Session, school_id: int, clearance_id: int,
                       *, deactivate: bool = True) -> dict:
    """Finish a departure — but only once everybody has signed off.

    This is the one rule the module enforces rather than merely displays. A
    clearance that can be completed with the laptop still out is a checklist
    nobody has to finish, which is the same as no checklist.
    """
    c = db.get(ExitClearance, clearance_id)
    if not c or c.school_id != school_id:
        raise _404("Clearance")
    if c.status != ExitClearanceStatus.in_progress:
        raise _400("That clearance is already closed.")

    outstanding = list(db.execute(
        select(ExitClearanceItem).where(
            ExitClearanceItem.clearance_id == c.id,
            ExitClearanceItem.is_cleared.is_(False),
        )
    ).scalars())
    if outstanding:
        names = ", ".join(i.area.value for i in outstanding)
        raise _400(f"Still waiting on {names}.")

    c.status = ExitClearanceStatus.complete
    c.completed_at = datetime.now(timezone.utc)
    if deactivate:
        s = db.get(Staff, c.staff_id)
        if s:
            s.user.is_active = False
    db.commit()
    return _clearance_to_dict(db, c)


def cancel_clearance(db: Session, school_id: int, clearance_id: int) -> dict:
    c = db.get(ExitClearance, clearance_id)
    if not c or c.school_id != school_id:
        raise _404("Clearance")
    if c.status == ExitClearanceStatus.complete:
        raise _400("That person has already left.")
    c.status = ExitClearanceStatus.cancelled
    db.commit()
    return _clearance_to_dict(db, c)


def get_clearance(db: Session, school_id: int, staff_id: int) -> Optional[dict]:
    c = db.execute(
        select(ExitClearance)
        .where(ExitClearance.staff_id == staff_id, ExitClearance.school_id == school_id)
        .order_by(ExitClearance.created_at.desc())
    ).scalars().first()
    return _clearance_to_dict(db, c) if c else None


def list_clearances(db: Session, school_id: int, *,
                    state: Optional[ExitClearanceStatus] = None) -> list[dict]:
    stmt = select(ExitClearance).where(ExitClearance.school_id == school_id)
    if state:
        stmt = stmt.where(ExitClearance.status == state)
    rows = db.execute(stmt.order_by(ExitClearance.created_at.desc()).limit(200)).scalars()
    return [_clearance_to_dict(db, c) for c in rows]
