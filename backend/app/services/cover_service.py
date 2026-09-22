"""Timetable cover and student leave.

Cover: on a date, every timetable slot whose teacher is away (approved or
pending staff leave, or named by the admin) needs a substitute. Candidates are
ranked: free that period and not unavailable, fewest covers this week first.

Student leave: parents apply; the section's class teacher or the school admin
decides. Approved leave is shown on the attendance register and suppresses
the automatic absence alert to parents."""
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import notify
from app.core.enums import NotificationCategory
from app.core.enums import StaffLeaveStatus, StudentLeaveStatus, UserRole
from app.core.scoping import require_linked_child, school_today, section_labels
from app.models.academic import Section
from app.models.cover import StudentLeave, Substitution, TeacherUnavailability
from app.models.holiday import Holiday
from app.models.staff_leave import StaffLeave
from app.models.student import Student
from app.models.subject import ClassSubject, Subject
from app.models.timetable import Period, TimetableEntry
from app.models.user import User
from app.schemas.cover import AssignIn, DecideIn, StudentLeaveIn, StudentLeaveUpdate, UnavailabilityIn

TEACHING_ROLES = (UserRole.teacher, UserRole.principal)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _names(db: Session, ids) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all())


# ---------- the day's timetable ----------


def _day_slots(db: Session, school_id: int, dow: int):
    """[(entry, period, class_subject)] for a weekday, teaching slots only."""
    return db.execute(
        select(TimetableEntry, Period, ClassSubject)
        .join(Period, TimetableEntry.period_id == Period.id)
        .join(ClassSubject, TimetableEntry.class_subject_id == ClassSubject.id)
        .where(TimetableEntry.school_id == school_id, Period.day_of_week == dow, Period.is_break.is_(False))
        .order_by(Period.period_number, TimetableEntry.section_id)
    ).all()


def _leaves_on(db: Session, school_id: int, d: date) -> dict[int, StaffLeave]:
    """{user_id: leave} for approved or pending staff leave covering the date."""
    rows = db.execute(
        select(StaffLeave).where(
            StaffLeave.school_id == school_id,
            StaffLeave.status.in_([StaffLeaveStatus.approved, StaffLeaveStatus.pending]),
            StaffLeave.from_date <= d, StaffLeave.to_date >= d,
        )
    ).scalars()
    out: dict[int, StaffLeave] = {}
    for lv in rows:
        # approved beats pending when both exist
        if lv.applicant_user_id not in out or lv.status == StaffLeaveStatus.approved:
            out[lv.applicant_user_id] = lv
    return out


def _holiday(db: Session, school_id: int, d: date) -> Optional[Holiday]:
    return db.execute(
        select(Holiday).where(Holiday.school_id == school_id, Holiday.start_date <= d, Holiday.end_date >= d).limit(1)
    ).scalar_one_or_none()


def cover_day(db: Session, school_id: int, d: date, extra_absent: list[int]) -> dict:
    dow = d.isoweekday()
    slots = _day_slots(db, school_id, dow)
    leaves = _leaves_on(db, school_id, d)
    subs = {s.timetable_entry_id: s for s in db.execute(
        select(Substitution).where(Substitution.school_id == school_id, Substitution.sub_date == d)
    ).scalars()}
    absent_reason: dict[int, tuple[str, Optional[int]]] = {}
    for uid, lv in leaves.items():
        absent_reason[uid] = ("leave" if lv.status == StaffLeaveStatus.approved else "pending_leave", lv.id)
    for uid in extra_absent:
        absent_reason.setdefault(uid, ("marked_absent", None))

    rows = []
    for e, p, cs in slots:
        teacher = cs.teacher_user_id
        s = subs.get(e.id)
        if teacher not in absent_reason and not s:
            continue
        reason = absent_reason.get(teacher, ("manual", None))[0]
        rows.append((e, p, cs, s, reason))
    labels = section_labels(db, {e.section_id for e, *_ in rows})
    subjects = dict(db.execute(
        select(ClassSubject.id, Subject.name).join(Subject, ClassSubject.subject_id == Subject.id)
        .where(ClassSubject.id.in_({cs.id for _, _, cs, _, _ in rows} or {-1}))
    ).all())
    names = _names(db, set(absent_reason) | {s.substitute_user_id for *_, s, _ in rows if s} | {cs.teacher_user_id for _, _, cs, _, _ in rows})
    out = []
    for e, p, cs, s, reason in rows:
        out.append(dict(
            timetable_entry_id=e.id, period_id=p.id, period_number=p.period_number, start_time=p.start_time,
            end_time=p.end_time, section_id=e.section_id, section_label=labels.get(e.section_id, ""),
            subject_name=subjects.get(cs.id, ""), absent_user_id=cs.teacher_user_id,
            absent_name=names.get(cs.teacher_user_id), reason=reason,
            substitution_id=s.id if s else None, substitute_user_id=s.substitute_user_id if s else None,
            substitute_name=names.get(s.substitute_user_id) if s else None, note=s.note if s else None,
        ))
    periods = Counter(cs.teacher_user_id for _, _, cs in slots)
    absent = [
        dict(user_id=uid, full_name=names.get(uid, ""), reason=r, leave_id=lid, periods=periods.get(uid, 0))
        for uid, (r, lid) in absent_reason.items()
    ]
    absent.sort(key=lambda a: a["full_name"])
    covered = sum(1 for r in out if r["substitute_user_id"])
    return dict(date=d, day_of_week=dow, is_holiday=_holiday(db, school_id, d) is not None, absent=absent,
                slots=out, covered=covered, uncovered=len(out) - covered)


def _week(d: date) -> tuple[date, date]:
    start = d - timedelta(days=d.weekday())
    return start, start + timedelta(days=6)


def candidates(db: Session, school_id: int, d: date, entry_id: int) -> list[dict]:
    e = db.get(TimetableEntry, entry_id)
    if not e or e.school_id != school_id:
        raise _404("Timetable slot")
    p = db.get(Period, e.period_id)
    cs = db.get(ClassSubject, e.class_subject_id)
    if p.day_of_week != d.isoweekday():
        raise _400("That slot isn't on this weekday")
    teachers = list(db.execute(
        select(User).where(User.school_id == school_id, User.role.in_(TEACHING_ROLES), User.is_active.is_(True))
        .order_by(User.full_name)
    ).scalars())
    day = _day_slots(db, school_id, p.day_of_week)
    teaching_now = {cs2.teacher_user_id: e2 for e2, p2, cs2 in day if p2.period_number == p.period_number}
    periods_today = Counter(cs2.teacher_user_id for _, _, cs2 in day)
    covering_now = set(db.execute(
        select(Substitution.substitute_user_id).join(Period, Substitution.period_id == Period.id)
        .where(Substitution.school_id == school_id, Substitution.sub_date == d, Period.period_number == p.period_number,
               Substitution.timetable_entry_id != e.id)
    ).scalars())
    covers_today = Counter(db.execute(
        select(Substitution.substitute_user_id).where(Substitution.school_id == school_id, Substitution.sub_date == d)
    ).scalars())
    wk_start, wk_end = _week(d)
    week_load = dict(db.execute(
        select(Substitution.substitute_user_id, func.count())
        .where(Substitution.school_id == school_id, Substitution.sub_date.between(wk_start, wk_end),
               Substitution.substitute_user_id.is_not(None))
        .group_by(Substitution.substitute_user_id)
    ).all())
    leaves = _leaves_on(db, school_id, d)
    blocks = db.execute(
        select(TeacherUnavailability).where(
            TeacherUnavailability.school_id == school_id, TeacherUnavailability.day_of_week == p.day_of_week,
        )
    ).scalars()
    unavailable = {
        b.user_id: b.reason or "unavailable" for b in blocks
        if b.period_number is None or b.period_number == p.period_number
    }
    teaches_class = set(db.execute(
        select(ClassSubject.teacher_user_id).where(ClassSubject.class_id == cs.class_id)
    ).scalars()) | set(db.execute(select(Section.class_teacher_user_id).where(Section.id == e.section_id)).scalars())
    labels = section_labels(db, {x.section_id for x in teaching_now.values()})

    out = []
    for t in teachers:
        if t.id == cs.teacher_user_id:
            continue
        if t.id in leaves:
            st, detail = "on_leave", "approved leave" if leaves[t.id].status == StaffLeaveStatus.approved else "leave pending"
        elif t.id in teaching_now:
            st, detail = "busy_teaching", labels.get(teaching_now[t.id].section_id)
        elif t.id in covering_now:
            st, detail = "busy_covering", "already covering this period"
        elif t.id in unavailable:
            st, detail = "unavailable", unavailable[t.id]
        else:
            st, detail = "free", None
        out.append(dict(
            user_id=t.id, full_name=t.full_name, status=st, detail=detail, teaches_this_class=t.id in teaches_class,
            covers_this_week=week_load.get(t.id, 0), periods_today=periods_today.get(t.id, 0) + covers_today.get(t.id, 0),
        ))
    order = {"free": 0, "unavailable": 1, "busy_covering": 2, "busy_teaching": 3, "on_leave": 4}
    out.sort(key=lambda c: (order[c["status"]], not c["teaches_this_class"], c["covers_this_week"], c["periods_today"], c["full_name"]))
    return out


def assign(db: Session, user: User, data: AssignIn) -> Substitution:
    e = db.get(TimetableEntry, data.timetable_entry_id)
    if not e or e.school_id != user.school_id:
        raise _404("Timetable slot")
    p = db.get(Period, e.period_id)
    if p.day_of_week != data.sub_date.isoweekday():
        raise _400("That slot isn't on this weekday")
    if data.sub_date < school_today(db, user.school_id) - timedelta(days=7):
        raise _400("Cover can only be arranged up to a week back")
    cs = db.get(ClassSubject, e.class_subject_id)
    if data.substitute_user_id is not None:
        if data.substitute_user_id == cs.teacher_user_id:
            raise _400("That's the regular teacher")
        sub = db.get(User, data.substitute_user_id)
        if not sub or sub.school_id != user.school_id or sub.role not in TEACHING_ROLES or not sub.is_active:
            raise _400("Pick an active teacher of this school")
        c = next((c for c in candidates(db, user.school_id, data.sub_date, e.id) if c["user_id"] == sub.id), None)
        if c and c["status"] != "free" and not data.force:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{sub.full_name} is {c['status'].replace('_', ' ')}{': ' + c['detail'] if c['detail'] else ''}. Assign anyway?",
            )
    s = db.execute(
        select(Substitution).where(Substitution.timetable_entry_id == e.id, Substitution.sub_date == data.sub_date)
    ).scalar_one_or_none()
    previous = s.substitute_user_id if s else None
    if not s:
        s = Substitution(tenant_id=e.tenant_id, school_id=e.school_id, sub_date=data.sub_date, timetable_entry_id=e.id,
                         section_id=e.section_id, period_id=p.id, class_subject_id=cs.id,
                         absent_user_id=cs.teacher_user_id, created_by_user_id=user.id)
        db.add(s)
    s.substitute_user_id, s.note = data.substitute_user_id, data.note
    label = section_labels(db, {e.section_id}).get(e.section_id, "")
    subj = db.get(Subject, cs.subject_id).name
    when = f"{data.sub_date:%a %d %b}, period {p.period_number} ({p.start_time:%H:%M})"
    if data.substitute_user_id and data.substitute_user_id != previous:
        notify.staff_users(db, tenant_id=e.tenant_id, school_id=e.school_id, user_ids=[data.substitute_user_id],
                           title=f"Cover: {label} {subj}", body=f"Please take {label} ({subj}) on {when}." + (f"\n{data.note}" if data.note else ""))
    if previous and previous != data.substitute_user_id:
        notify.staff_users(db, tenant_id=e.tenant_id, school_id=e.school_id, user_ids=[previous],
                           title=f"Cover cancelled: {label} {subj}", body=f"You no longer need to take {label} on {when}.")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Someone else just changed this slot; reload")
    db.refresh(s)
    return s


def remove(db: Session, user: User, sub_id: int) -> None:
    s = db.get(Substitution, sub_id)
    if not s or s.school_id != user.school_id:
        raise _404("Substitution")
    if s.substitute_user_id:
        p = db.get(Period, s.period_id)
        label = section_labels(db, {s.section_id}).get(s.section_id, "")
        notify.staff_users(db, tenant_id=s.tenant_id, school_id=s.school_id, user_ids=[s.substitute_user_id],
                           title=f"Cover cancelled: {label}", body=f"You no longer need to take {label} on {s.sub_date:%a %d %b}, period {p.period_number}.")
    db.delete(s)
    db.commit()


def auto_assign(db: Session, user: User, d: date, extra_absent: list[int]) -> int:
    """Give every uncovered slot the best free candidate."""
    day = cover_day(db, user.school_id, d, extra_absent)
    done = 0
    for slot in day["slots"]:
        if slot["substitute_user_id"]:
            continue
        best = next((c for c in candidates(db, user.school_id, d, slot["timetable_entry_id"]) if c["status"] == "free"), None)
        if best:
            assign(db, user, AssignIn(sub_date=d, timetable_entry_id=slot["timetable_entry_id"], substitute_user_id=best["user_id"]))
            done += 1
    return done


def my_substitutions(db: Session, user: User, start: date, end: date) -> list[dict]:
    rows = db.execute(
        select(Substitution, Period).join(Period, Substitution.period_id == Period.id)
        .where(Substitution.substitute_user_id == user.id, Substitution.sub_date.between(start, end))
        .order_by(Substitution.sub_date, Period.period_number)
    ).all()
    labels = section_labels(db, {s.section_id for s, _ in rows})
    subjects = dict(db.execute(
        select(ClassSubject.id, Subject.name).join(Subject, ClassSubject.subject_id == Subject.id)
        .where(ClassSubject.id.in_({s.class_subject_id for s, _ in rows} or {-1}))
    ).all())
    names = _names(db, {s.absent_user_id for s, _ in rows})
    return [
        dict(id=s.id, sub_date=s.sub_date, period_number=p.period_number, start_time=p.start_time, end_time=p.end_time,
             section_label=labels.get(s.section_id, ""), subject_name=subjects.get(s.class_subject_id, ""),
             absent_name=names.get(s.absent_user_id), note=s.note)
        for s, p in rows
    ]


def cover_stats(db: Session, school_id: int, start: date, end: date) -> list[dict]:
    rows = db.execute(
        select(Substitution.substitute_user_id, func.count())
        .where(Substitution.school_id == school_id, Substitution.sub_date.between(start, end),
               Substitution.substitute_user_id.is_not(None))
        .group_by(Substitution.substitute_user_id)
    ).all()
    names = _names(db, {u for u, _ in rows})
    return sorted(
        [dict(user_id=u, full_name=names.get(u, ""), covers=n) for u, n in rows], key=lambda r: (-r["covers"], r["full_name"])
    )


def list_unavailability(db: Session, school_id: int) -> list[dict]:
    rows = list(db.execute(
        select(TeacherUnavailability).where(TeacherUnavailability.school_id == school_id)
        .order_by(TeacherUnavailability.user_id, TeacherUnavailability.day_of_week, TeacherUnavailability.period_number)
    ).scalars())
    names = _names(db, {r.user_id for r in rows})
    return [dict(id=r.id, user_id=r.user_id, full_name=names.get(r.user_id, ""), day_of_week=r.day_of_week,
                 period_number=r.period_number, reason=r.reason) for r in rows]


def add_unavailability(db: Session, user: User, data: UnavailabilityIn) -> None:
    t = db.get(User, data.user_id)
    if not t or t.school_id != user.school_id or t.role not in TEACHING_ROLES:
        raise _400("Pick a teacher of this school")
    # the unique constraint can't catch whole-day blocks (period_number NULL)
    dup = db.execute(
        select(TeacherUnavailability.id).where(
            TeacherUnavailability.user_id == data.user_id, TeacherUnavailability.day_of_week == data.day_of_week,
            TeacherUnavailability.period_number.is_(None) if data.period_number is None
            else TeacherUnavailability.period_number == data.period_number,
        )
    ).first()
    if dup:
        raise _400("That block already exists")
    db.add(TeacherUnavailability(tenant_id=user.tenant_id, school_id=user.school_id, **data.model_dump()))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _400("That block already exists")


def remove_unavailability(db: Session, user: User, block_id: int) -> None:
    b = db.get(TeacherUnavailability, block_id)
    if not b or b.school_id != user.school_id:
        raise _404("Block")
    db.delete(b)
    db.commit()


# ---------- student leave ----------


def approved_leave_students(db: Session, student_ids, d: date) -> set[int]:
    ids = list(student_ids)
    if not ids:
        return set()
    return set(db.execute(
        select(StudentLeave.student_id).where(
            StudentLeave.student_id.in_(ids), StudentLeave.status == StudentLeaveStatus.approved,
            StudentLeave.from_date <= d, StudentLeave.to_date >= d,
        )
    ).scalars())


def _can_decide(db: Session, user: User, lv: StudentLeave) -> bool:
    from app.services import rbac_service

    if lv.school_id != user.school_id:
        return False
    if user.role == UserRole.school_admin:
        return True
    if user.role == UserRole.teacher and db.get(Section, lv.section_id).class_teacher_user_id == user.id:
        return True
    # a school can delegate leave decisions to anyone
    return rbac_service.has_permission(db, user, "studentleave.decide")


def leaves_to_read(db: Session, user: Optional[User], leaves: list[StudentLeave]) -> list[dict]:
    if not leaves:
        return []
    students = dict(db.execute(select(Student.id, Student.full_name).where(Student.id.in_({lv.student_id for lv in leaves}))).all())
    labels = section_labels(db, {lv.section_id for lv in leaves})
    names = _names(db, {lv.applied_by_user_id for lv in leaves} | {lv.decided_by_user_id for lv in leaves})
    return [
        dict(id=lv.id, student_id=lv.student_id, student_name=students.get(lv.student_id, ""), section_id=lv.section_id,
             section_label=labels.get(lv.section_id, ""), kind=lv.kind, from_date=lv.from_date, to_date=lv.to_date,
             days=(lv.to_date - lv.from_date).days + 1, reason=lv.reason, status=lv.status,
             applied_by_name=names.get(lv.applied_by_user_id), created_at=lv.created_at,
             decided_by_name=names.get(lv.decided_by_user_id), decided_at=lv.decided_at, decision_note=lv.decision_note,
             can_decide=bool(user) and lv.status == StudentLeaveStatus.pending and _can_decide(db, user, lv))
        for lv in leaves
    ]


def apply(db: Session, parent_user_id: int, student_id: int, data: StudentLeaveIn) -> StudentLeave:
    st = require_linked_child(db, parent_user_id, student_id)
    today = school_today(db, st.school_id)
    if data.from_date < today - timedelta(days=7):
        raise _400("Leave can be applied at most a week after the fact")
    overlap = db.execute(
        select(StudentLeave.id).where(
            StudentLeave.student_id == st.id,
            StudentLeave.status.in_([StudentLeaveStatus.pending, StudentLeaveStatus.approved]),
            StudentLeave.from_date <= data.to_date, StudentLeave.to_date >= data.from_date,
        ).limit(1)
    ).first()
    if overlap:
        raise _400("There's already a leave request for some of these days")
    lv = StudentLeave(tenant_id=st.tenant_id, school_id=st.school_id, student_id=st.id, section_id=st.section_id,
                      applied_by_user_id=parent_user_id, **data.model_dump())
    db.add(lv)
    db.flush()
    sec = db.get(Section, st.section_id)
    if sec.class_teacher_user_id:
        notify.staff_users(db, tenant_id=st.tenant_id, school_id=st.school_id, user_ids=[sec.class_teacher_user_id],
                           title=f"Leave request: {st.full_name}",
                           body=f"{data.from_date:%d %b} to {data.to_date:%d %b} ({data.kind.value}). {data.reason}")
    db.commit()
    db.refresh(lv)
    return lv


def child_leaves(db: Session, parent_user_id: int, student_id: int) -> list[StudentLeave]:
    st = require_linked_child(db, parent_user_id, student_id)
    return list(db.execute(
        select(StudentLeave).where(StudentLeave.student_id == st.id).order_by(StudentLeave.from_date.desc())
    ).scalars())


def update_leave(db: Session, parent_user_id: int, student_id: int, leave_id: int,
                 data: StudentLeaveUpdate) -> StudentLeave:
    """Change a request the school hasn't answered yet. Once it is decided the
    dates have been acted on — the register may already be marked — so a change
    means cancelling and applying again."""
    st = require_linked_child(db, parent_user_id, student_id)
    lv = db.get(StudentLeave, leave_id)
    if not lv or lv.student_id != st.id:
        raise _404("Leave")
    if lv.status != StudentLeaveStatus.pending:
        raise _400(f"This request is already {lv.status.value} — cancel it and apply again")
    fields = data.model_dump(exclude_unset=True)
    from_date = fields.get("from_date", lv.from_date)
    to_date = fields.get("to_date", lv.to_date)
    if to_date < from_date:
        raise _400("The leave would end before it starts")
    if (to_date - from_date).days > 60:
        raise _400("A single leave can't be longer than 60 days")
    if from_date < school_today(db, st.school_id) - timedelta(days=7):
        raise _400("Leave can be applied at most a week after the fact")
    overlap = db.execute(
        select(StudentLeave.id).where(
            StudentLeave.student_id == st.id,
            StudentLeave.id != lv.id,
            StudentLeave.status.in_([StudentLeaveStatus.pending, StudentLeaveStatus.approved]),
            StudentLeave.from_date <= to_date, StudentLeave.to_date >= from_date,
        ).limit(1)
    ).first()
    if overlap:
        raise _400("There's already a leave request for some of these days")
    for k, v in fields.items():
        setattr(lv, k, v)
    db.commit()
    db.refresh(lv)
    return lv


def cancel(db: Session, parent_user_id: int, student_id: int, leave_id: int) -> StudentLeave:
    st = require_linked_child(db, parent_user_id, student_id)
    lv = db.get(StudentLeave, leave_id)
    if not lv or lv.student_id != st.id:
        raise _404("Leave")
    if lv.status == StudentLeaveStatus.pending or (
        lv.status == StudentLeaveStatus.approved and lv.from_date > school_today(db, st.school_id)
    ):
        lv.status = StudentLeaveStatus.cancelled
        db.commit()
        db.refresh(lv)
        return lv
    raise _400("Only pending leave, or approved leave that hasn't started, can be cancelled")


def staff_leaves(db: Session, user: User, status_: Optional[StudentLeaveStatus], section_id: Optional[int],
                 start: Optional[date], end: Optional[date]) -> list[StudentLeave]:
    stmt = select(StudentLeave).where(StudentLeave.school_id == user.school_id)
    if user.role == UserRole.teacher:
        mine = select(Section.id).where(Section.class_teacher_user_id == user.id)
        stmt = stmt.where(StudentLeave.section_id.in_(mine))
    elif user.role not in (UserRole.school_admin, UserRole.principal):
        return []
    if status_:
        stmt = stmt.where(StudentLeave.status == status_)
    if section_id:
        stmt = stmt.where(StudentLeave.section_id == section_id)
    if start:
        stmt = stmt.where(StudentLeave.to_date >= start)
    if end:
        stmt = stmt.where(StudentLeave.from_date <= end)
    return list(db.execute(stmt.order_by(StudentLeave.from_date.desc()).limit(500)).scalars())


def decide(db: Session, user: User, leave_id: int, data: DecideIn) -> StudentLeave:
    lv = db.get(StudentLeave, leave_id)
    if not lv or lv.school_id != user.school_id:
        raise _404("Leave")
    if not _can_decide(db, user, lv):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the class teacher or school admin can decide")
    if lv.status == StudentLeaveStatus.cancelled:
        raise _400("The family cancelled this request")
    if lv.status != StudentLeaveStatus.pending:
        raise _400("This request has already been decided")
    if not data.approve and not (data.note or "").strip():
        raise _400("Give a reason when rejecting")
    lv.status = StudentLeaveStatus.approved if data.approve else StudentLeaveStatus.rejected
    lv.decided_by_user_id, lv.decided_at, lv.decision_note = user.id, datetime.now(timezone.utc), data.note
    st = db.get(Student, lv.student_id)
    verb = "approved" if data.approve else "not approved"
    notify.student_parents(db, st, f"Leave {verb}: {st.full_name}",
                           f"{lv.from_date:%d %b} to {lv.to_date:%d %b} was {verb}." + (f" {data.note}" if data.note else ""),
                           category=NotificationCategory.attendance, link=f"/parent/leave-request-detail?id={lv.id}")
    db.commit()
    db.refresh(lv)
    return lv


def leave_map(db: Session, student_ids, d: date) -> dict[int, str]:
    """{student_id: 'Sick leave'} for approved leave on the date."""
    ids = list(student_ids)
    if not ids:
        return {}
    rows = db.execute(
        select(StudentLeave.student_id, StudentLeave.kind).where(
            StudentLeave.student_id.in_(ids), StudentLeave.status == StudentLeaveStatus.approved,
            StudentLeave.from_date <= d, StudentLeave.to_date >= d,
        )
    ).all()
    return {sid: f"{k.value.capitalize()} leave" for sid, k in rows}
