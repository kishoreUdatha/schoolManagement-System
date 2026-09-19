"""Events calendar with parent consent, parent-teacher meeting slot booking,
photo gallery and the combined calendar feed for every portal."""
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import notify, storage
from app.core.enums import (
    ConsentResponse,
    EventAudience,
    NoticeAudience,
    PtmSlotStatus,
    UserRole,
)
from app.core.scoping import require_linked_child, section_labels
from app.models.academic import SchoolClass, Section
from app.models.events import (
    EventConsent,
    GalleryAlbum,
    GalleryPhoto,
    PtmSession,
    PtmSlot,
    SchoolEvent,
)
from app.models.exam import Exam
from app.models.holiday import Holiday
from app.models.parent import ParentStudent
from app.models.student import Student
from app.models.subject import ClassSubject
from app.models.tenant import School
from app.models.user import User
from app.schemas.events import AlbumIn, EventIn, PtmSessionIn, SlotOutcomeIn


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def school_today(db: Session, school_id: int) -> date:
    s = db.get(School, school_id)
    return datetime.now(ZoneInfo(s.timezone if s and s.timezone else "Asia/Kolkata")).date()


# ---------- audiences ----------


def _check_audience(db: Session, school_id: int, audience: EventAudience, class_id, section_id):
    """Validate and normalise; returns (class_id, section_id) to store."""
    if audience == EventAudience.class_parents:
        c = db.get(SchoolClass, class_id) if class_id else None
        if not c or c.school_id != school_id:
            raise _400("Pick the class this is for")
        return c.id, None
    if audience == EventAudience.section_parents:
        sec = db.get(Section, section_id) if section_id else None
        if not sec or sec.school_id != school_id:
            raise _400("Pick the section this is for")
        return sec.class_id, sec.id
    return None, None


def _class_names(db: Session, class_ids: set[int]) -> dict[int, str]:
    if not class_ids:
        return {}
    return dict(db.execute(select(SchoolClass.id, SchoolClass.name).where(SchoolClass.id.in_(class_ids))).all())


def _audience_labels(db: Session, rows) -> dict[int, str]:
    classes = _class_names(db, {r.class_id for r in rows if r.class_id})
    sections = section_labels(db, {r.section_id for r in rows if r.section_id})
    out = {}
    for r in rows:
        if r.audience == EventAudience.everyone:
            out[r.id] = "Everyone"
        elif r.audience == EventAudience.staff:
            out[r.id] = "Staff only"
        elif r.audience == EventAudience.parents:
            out[r.id] = "All parents"
        elif r.audience == EventAudience.class_parents:
            out[r.id] = f"{classes.get(r.class_id, 'Class')} parents"
        else:
            out[r.id] = f"{sections.get(r.section_id, 'Section')} parents"
    return out


def _notify_audience(db: Session, obj, title: str, body: str) -> None:
    kw = dict(tenant_id=obj.tenant_id, school_id=obj.school_id, title=title, body=body)
    a = obj.audience
    if a in (EventAudience.everyone, EventAudience.parents):
        notify.broadcast(db, audience=NoticeAudience.all_parents, **kw)
    if a in (EventAudience.everyone, EventAudience.staff):
        notify.broadcast(db, audience=NoticeAudience.all_staff, **kw)
    if a == EventAudience.class_parents:
        notify.broadcast(db, audience=NoticeAudience.class_parents, class_id=obj.class_id, **kw)
    if a == EventAudience.section_parents:
        notify.broadcast(db, audience=NoticeAudience.section_parents, section_id=obj.section_id, **kw)


class ParentScope:
    """A parent's active children and the classes/sections they sit in."""

    def __init__(self, db: Session, parent_user_id: int):
        rows = db.execute(
            select(Student, Section.class_id)
            .join(ParentStudent, ParentStudent.student_id == Student.id)
            .join(Section, Student.section_id == Section.id)
            .where(ParentStudent.parent_user_id == parent_user_id, Student.is_active.is_(True))
            .order_by(Student.full_name)
        ).all()
        self.children = [s for s, _ in rows]
        self.class_of = {s.id: cid for s, cid in rows}
        self.class_ids = set(self.class_of.values())
        self.section_ids = {s.section_id for s in self.children}
        self.school_ids = {s.school_id for s in self.children}

    def audience_clause(self, model):
        return and_(
            model.school_id.in_(self.school_ids or {-1}),
            or_(
                model.audience.in_([EventAudience.everyone, EventAudience.parents]),
                and_(model.audience == EventAudience.class_parents, model.class_id.in_(self.class_ids or {-1})),
                and_(model.audience == EventAudience.section_parents, model.section_id.in_(self.section_ids or {-1})),
            ),
        )

    def eligible(self, obj, student: Student) -> bool:
        if obj.school_id != student.school_id:
            return False
        if obj.audience in (EventAudience.everyone, EventAudience.parents):
            return True
        if obj.audience == EventAudience.class_parents:
            return self.class_of.get(student.id) == obj.class_id
        if obj.audience == EventAudience.section_parents:
            return student.section_id == obj.section_id
        return False


# ---------- events ----------


def get_event(db: Session, event_id: int, school_id: int) -> SchoolEvent:
    e = db.get(SchoolEvent, event_id)
    if not e or e.school_id != school_id:
        raise _404("Event")
    return e


def _consent_counts(db: Session, event_ids: list[int]) -> dict[int, dict]:
    if not event_ids:
        return {}
    out: dict[int, dict] = {}
    for eid, resp, n in db.execute(
        select(EventConsent.event_id, EventConsent.response, func.count())
        .where(EventConsent.event_id.in_(event_ids))
        .group_by(EventConsent.event_id, EventConsent.response)
    ).all():
        out.setdefault(eid, {})[resp] = n
    return out


def events_to_read(db: Session, events: list[SchoolEvent]) -> list[dict]:
    labels = _audience_labels(db, events)
    counts = _consent_counts(db, [e.id for e in events if e.requires_consent])
    out = []
    for e in events:
        c = counts.get(e.id, {})
        d = {k: getattr(e, k) for k in (
            "id", "title", "kind", "start_date", "end_date", "start_time", "end_time", "venue", "description",
            "audience", "class_id", "section_id", "requires_consent", "consent_deadline", "fee_amount",
            "is_published", "published_at", "is_cancelled",
        )}
        d.update(
            audience_label=labels[e.id],
            consent_yes=c.get(ConsentResponse.yes, 0),
            consent_no=c.get(ConsentResponse.no, 0),
        )
        out.append(d)
    return out


def list_events(db: Session, school_id: int, start: Optional[date], end: Optional[date], published_only=False):
    stmt = select(SchoolEvent).where(SchoolEvent.school_id == school_id)
    if start:
        stmt = stmt.where(SchoolEvent.end_date >= start)
    if end:
        stmt = stmt.where(SchoolEvent.start_date <= end)
    if published_only:
        stmt = stmt.where(SchoolEvent.is_published.is_(True))
    return list(db.execute(stmt.order_by(SchoolEvent.start_date, SchoolEvent.start_time)).scalars())


def _apply_event(db: Session, e: SchoolEvent, data: EventIn) -> None:
    e.class_id, e.section_id = _check_audience(db, e.school_id, data.audience, data.class_id, data.section_id)
    if data.requires_consent and data.audience == EventAudience.staff:
        raise _400("Consent can only be collected from parents")
    for k in ("title", "kind", "start_date", "end_date", "start_time", "end_time", "venue", "description",
              "audience", "requires_consent", "fee_amount"):
        setattr(e, k, getattr(data, k))
    e.end_time = data.end_time if data.start_time else None
    e.consent_deadline = data.consent_deadline if data.requires_consent else None


def create_event(db: Session, tenant_id: int, school_id: int, user_id: int, data: EventIn) -> SchoolEvent:
    e = SchoolEvent(tenant_id=tenant_id, school_id=school_id, created_by_user_id=user_id)
    _apply_event(db, e, data)
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def update_event(db: Session, e: SchoolEvent, data: EventIn) -> SchoolEvent:
    if e.is_cancelled:
        raise _400("This event was cancelled")
    moved = (e.start_date, e.end_date, e.start_time, e.venue) != (
        data.start_date, data.end_date, data.start_time, data.venue
    )
    if e.is_published and e.requires_consent and not data.requires_consent:
        if db.execute(select(EventConsent.id).where(EventConsent.event_id == e.id).limit(1)).first():
            raise _400("Parents have already answered; consent can't be switched off")
    _apply_event(db, e, data)
    if e.is_published and moved:
        _notify_audience(db, e, f"Event updated: {e.title}", f"New schedule: {_when(e)}" + (f" at {e.venue}" if e.venue else ""))
    db.commit()
    db.refresh(e)
    return e


def _when(e: SchoolEvent) -> str:
    s = e.start_date.strftime("%d %b %Y")
    if e.end_date != e.start_date:
        s += " to " + e.end_date.strftime("%d %b %Y")
    if e.start_time:
        s += ", " + e.start_time.strftime("%I:%M %p").lstrip("0")
    return s


def publish_event(db: Session, e: SchoolEvent) -> SchoolEvent:
    if e.is_cancelled:
        raise _400("This event was cancelled")
    if e.is_published:
        return e
    e.is_published = True
    e.published_at = _now()
    body = _when(e) + (f" at {e.venue}" if e.venue else "")
    if e.description:
        body += "\n\n" + e.description
    if e.requires_consent:
        body += "\n\nPlease give or decline consent in the parent app"
        body += f" by {e.consent_deadline.strftime('%d %b')}." if e.consent_deadline else "."
    _notify_audience(db, e, e.title, body)
    db.commit()
    db.refresh(e)
    return e


def cancel_event(db: Session, e: SchoolEvent) -> SchoolEvent:
    if e.is_cancelled:
        return e
    e.is_cancelled = True
    if e.is_published:
        _notify_audience(db, e, f"Cancelled: {e.title}", f"The event on {_when(e)} has been cancelled.")
    db.commit()
    db.refresh(e)
    return e


def delete_event(db: Session, e: SchoolEvent) -> None:
    if e.is_published:
        raise _400("Published events can't be deleted; cancel it instead")
    db.delete(e)
    db.commit()


def _eligible_students_stmt(e: SchoolEvent):
    stmt = select(Student).where(Student.school_id == e.school_id, Student.is_active.is_(True))
    if e.audience == EventAudience.class_parents:
        stmt = stmt.join(Section, Student.section_id == Section.id).where(Section.class_id == e.class_id)
    elif e.audience == EventAudience.section_parents:
        stmt = stmt.where(Student.section_id == e.section_id)
    elif e.audience == EventAudience.staff:
        stmt = stmt.where(false())
    return stmt


def consent_report(db: Session, e: SchoolEvent) -> dict:
    if not e.requires_consent:
        raise _400("This event doesn't collect consent")
    students = list(db.execute(_eligible_students_stmt(e).order_by(Student.section_id, Student.full_name)).scalars())
    answers = {
        c.student_id: c
        for c in db.execute(select(EventConsent).where(EventConsent.event_id == e.id)).scalars()
    }
    parents = dict(
        db.execute(
            select(User.id, User.full_name).where(User.id.in_({c.parent_user_id for c in answers.values()} or {-1}))
        ).all()
    )
    labels = section_labels(db, {s.section_id for s in students})
    rows, yes, no = [], 0, 0
    for s in students:
        c = answers.get(s.id)
        yes += bool(c and c.response == ConsentResponse.yes)
        no += bool(c and c.response == ConsentResponse.no)
        rows.append(dict(
            student_id=s.id, student_name=s.full_name, admission_no=s.admission_no,
            class_label=labels.get(s.section_id),
            response=c.response if c else None, note=c.note if c else None,
            responded_at=c.responded_at if c else None,
            parent_name=parents.get(c.parent_user_id) if c else None,
        ))
    return dict(
        event=events_to_read(db, [e])[0], eligible=len(students), yes=yes, no=no,
        pending=len(students) - yes - no, rows=rows,
    )


def consent_open(db: Session, e: SchoolEvent) -> bool:
    if not (e.is_published and e.requires_consent) or e.is_cancelled:
        return False
    today = school_today(db, e.school_id)
    return today <= (e.consent_deadline or e.start_date)


def parent_events(db: Session, parent_user_id: int, start: Optional[date], end: Optional[date]) -> list[dict]:
    scope = ParentScope(db, parent_user_id)
    if not scope.children:
        return []
    stmt = select(SchoolEvent).where(SchoolEvent.is_published.is_(True), scope.audience_clause(SchoolEvent))
    if start:
        stmt = stmt.where(SchoolEvent.end_date >= start)
    if end:
        stmt = stmt.where(SchoolEvent.start_date <= end)
    events = list(db.execute(stmt.order_by(SchoolEvent.start_date, SchoolEvent.start_time)).scalars())
    answers = {
        (c.event_id, c.student_id): c
        for c in db.execute(
            select(EventConsent).where(
                EventConsent.event_id.in_([e.id for e in events if e.requires_consent] or [-1]),
                EventConsent.student_id.in_([s.id for s in scope.children]),
            )
        ).scalars()
    }
    out = []
    for e, d in zip(events, events_to_read(db, events)):
        d.pop("consent_yes"), d.pop("consent_no")
        d["consent_open"] = consent_open(db, e)
        d["children"] = []
        if e.requires_consent:
            for s in scope.children:
                if scope.eligible(e, s):
                    c = answers.get((e.id, s.id))
                    d["children"].append(dict(
                        student_id=s.id, student_name=s.full_name,
                        response=c.response if c else None, note=c.note if c else None,
                    ))
        out.append(d)
    return out


def give_consent(db: Session, parent_user_id: int, event_id: int, student_id: int, response, note) -> EventConsent:
    student = require_linked_child(db, parent_user_id, student_id)
    e = db.get(SchoolEvent, event_id)
    scope = ParentScope(db, parent_user_id)
    if not e or not e.is_published or not scope.eligible(e, student):
        raise _404("Event")
    if not e.requires_consent:
        raise _400("This event doesn't need consent")
    if not consent_open(db, e):
        raise _400("Consent for this event has closed")
    c = db.execute(
        select(EventConsent).where(EventConsent.event_id == e.id, EventConsent.student_id == student.id)
    ).scalar_one_or_none()
    if not c:
        c = EventConsent(tenant_id=e.tenant_id, school_id=e.school_id, event_id=e.id, student_id=student.id)
        db.add(c)
    c.response, c.note, c.parent_user_id, c.responded_at = response, note, parent_user_id, _now()
    db.commit()
    db.refresh(c)
    return c


# ---------- parent-teacher meetings ----------


def get_session(db: Session, session_id: int, school_id: int) -> PtmSession:
    s = db.get(PtmSession, session_id)
    if not s or s.school_id != school_id:
        raise _404("Meeting")
    return s


def _scope_of(db: Session, school_id: int, class_id, section_id):
    if section_id:
        return _check_audience(db, school_id, EventAudience.section_parents, None, section_id)
    if class_id:
        return _check_audience(db, school_id, EventAudience.class_parents, class_id, None)
    return None, None


def _slot_times(s: PtmSession) -> list[tuple[time, time]]:
    out = []
    cur = datetime.combine(s.meeting_date, s.start_time)
    end = datetime.combine(s.meeting_date, s.end_time)
    step = timedelta(minutes=s.slot_minutes)
    while cur + step <= end:
        out.append((cur.time(), (cur + step).time()))
        cur += step
    return out


def _has_slots(db: Session, session_id: int) -> bool:
    return db.execute(select(PtmSlot.id).where(PtmSlot.session_id == session_id).limit(1)).first() is not None


def create_session(db: Session, tenant_id: int, school_id: int, user_id: int, data: PtmSessionIn) -> PtmSession:
    s = PtmSession(tenant_id=tenant_id, school_id=school_id, created_by_user_id=user_id)
    s.class_id, s.section_id = _scope_of(db, school_id, data.class_id, data.section_id)
    for k in ("title", "meeting_date", "start_time", "end_time", "slot_minutes", "venue", "notes", "booking_closes_at"):
        setattr(s, k, getattr(data, k))
    if not _slot_times(s):
        raise _400("The meeting window is shorter than one slot")
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def update_session(db: Session, s: PtmSession, data: PtmSessionIn) -> PtmSession:
    timing = (s.meeting_date, s.start_time, s.end_time, s.slot_minutes) != (
        data.meeting_date, data.start_time, data.end_time, data.slot_minutes
    )
    if timing and _has_slots(db, s.id):
        raise _400("Remove the teachers before changing the date, times or slot length")
    s.class_id, s.section_id = _scope_of(db, s.school_id, data.class_id, data.section_id)
    for k in ("title", "meeting_date", "start_time", "end_time", "slot_minutes", "venue", "notes", "booking_closes_at"):
        setattr(s, k, getattr(data, k))
    if not _slot_times(s):
        raise _400("The meeting window is shorter than one slot")
    db.commit()
    db.refresh(s)
    return s


def delete_session(db: Session, s: PtmSession) -> None:
    booked = db.execute(
        select(func.count()).select_from(PtmSlot).where(PtmSlot.session_id == s.id, PtmSlot.student_id.is_not(None))
    ).scalar_one()
    if booked:
        raise _400("Parents have booked slots; cancel their bookings first")
    db.delete(s)
    db.commit()


def add_teachers(db: Session, s: PtmSession, user_ids: list[int]) -> int:
    users = list(db.execute(
        select(User).where(
            User.id.in_(user_ids),
            User.school_id == s.school_id,
            User.role.in_([UserRole.teacher, UserRole.principal]),
            User.is_active.is_(True),
        )
    ).scalars())
    if len(users) != len(set(user_ids)):
        raise _400("Only active teachers or the principal of this school can take meetings")
    have = set(db.execute(select(PtmSlot.teacher_user_id).where(PtmSlot.session_id == s.id)).scalars())
    added = 0
    for u in users:
        if u.id in have:
            continue
        for a, b in _slot_times(s):
            db.add(PtmSlot(tenant_id=s.tenant_id, school_id=s.school_id, session_id=s.id,
                           teacher_user_id=u.id, start_time=a, end_time=b))
        added += 1
        if s.is_published:
            notify.staff_users(db, tenant_id=s.tenant_id, school_id=s.school_id, user_ids=[u.id],
                               title=f"Parent-teacher meeting: {s.title}",
                               body=f"You have meeting slots on {s.meeting_date.strftime('%d %b %Y')}.")
    db.commit()
    return added


def remove_teacher(db: Session, s: PtmSession, teacher_user_id: int) -> None:
    slots = list(db.execute(
        select(PtmSlot).where(PtmSlot.session_id == s.id, PtmSlot.teacher_user_id == teacher_user_id)
    ).scalars())
    if not slots:
        raise _404("Teacher")
    if any(x.student_id for x in slots):
        raise _400("Parents have booked this teacher; cancel their bookings first")
    for x in slots:
        db.delete(x)
    db.commit()


def _teacher_names(db: Session, ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all())


def _scope_label(db: Session, s: PtmSession) -> str:
    if s.section_id:
        return section_labels(db, {s.section_id}).get(s.section_id, "Section")
    if s.class_id:
        return _class_names(db, {s.class_id}).get(s.class_id, "Class")
    return "Whole school"


def session_to_read(db: Session, s: PtmSession) -> dict:
    teachers, slots, booked = db.execute(
        select(
            func.count(func.distinct(PtmSlot.teacher_user_id)),
            func.count(PtmSlot.id),
            func.count(PtmSlot.student_id),
        ).where(PtmSlot.session_id == s.id)
    ).one()
    d = {k: getattr(s, k) for k in (
        "id", "title", "meeting_date", "start_time", "end_time", "slot_minutes", "venue", "notes",
        "class_id", "section_id", "booking_closes_at", "is_published",
    )}
    d.update(scope_label=_scope_label(db, s), teacher_count=teachers, slot_count=slots, booked_count=booked)
    return d


def list_sessions(db: Session, school_id: int, upcoming_only: bool) -> list[dict]:
    stmt = select(PtmSession).where(PtmSession.school_id == school_id)
    if upcoming_only:
        stmt = stmt.where(PtmSession.meeting_date >= school_today(db, school_id))
    return [session_to_read(db, s) for s in db.execute(stmt.order_by(PtmSession.meeting_date.desc())).scalars()]


def _slot_rows(db: Session, slots: list[PtmSlot]) -> list[dict]:
    students = {
        st.id: st for st in db.execute(
            select(Student).where(Student.id.in_({x.student_id for x in slots if x.student_id} or {-1}))
        ).scalars()
    }
    labels = section_labels(db, {st.section_id for st in students.values()})
    parents = _teacher_names(db, {x.parent_user_id for x in slots if x.parent_user_id})
    out = []
    for x in slots:
        st = students.get(x.student_id)
        out.append(dict(
            id=x.id, start_time=x.start_time, end_time=x.end_time, status=x.status,
            student_id=x.student_id, student_name=st.full_name if st else None,
            class_label=labels.get(st.section_id) if st else None,
            parent_name=parents.get(x.parent_user_id), parent_note=x.parent_note, teacher_notes=x.teacher_notes,
        ))
    return out


def session_detail(db: Session, s: PtmSession) -> dict:
    slots = list(db.execute(
        select(PtmSlot).where(PtmSlot.session_id == s.id).order_by(PtmSlot.teacher_user_id, PtmSlot.start_time)
    ).scalars())
    names = _teacher_names(db, {x.teacher_user_id for x in slots})
    rows = dict(zip([x.id for x in slots], _slot_rows(db, slots)))
    teachers: dict[int, list] = {}
    for x in slots:
        teachers.setdefault(x.teacher_user_id, []).append(rows[x.id])
    d = session_to_read(db, s)
    d["teachers"] = sorted(
        [dict(teacher_user_id=t, teacher_name=names.get(t, "Teacher"), slots=v) for t, v in teachers.items()],
        key=lambda t: t["teacher_name"],
    )
    return d


def _session_parents_audience(s: PtmSession):
    if s.section_id:
        return NoticeAudience.section_parents
    if s.class_id:
        return NoticeAudience.class_parents
    return NoticeAudience.all_parents


def publish_session(db: Session, s: PtmSession) -> PtmSession:
    if s.is_published:
        return s
    if not _has_slots(db, s.id):
        raise _400("Add at least one teacher before publishing")
    s.is_published = True
    when = s.meeting_date.strftime("%d %b %Y")
    notify.broadcast(
        db, tenant_id=s.tenant_id, school_id=s.school_id, audience=_session_parents_audience(s),
        class_id=s.class_id, section_id=s.section_id, title=f"Parent-teacher meeting: {s.title}",
        body=f"Book a slot with your child's teachers for {when}" + (f" at {s.venue}" if s.venue else "") + ".",
    )
    teacher_ids = list(db.execute(select(PtmSlot.teacher_user_id).where(PtmSlot.session_id == s.id).distinct()).scalars())
    notify.staff_users(db, tenant_id=s.tenant_id, school_id=s.school_id, user_ids=teacher_ids,
                       title=f"Parent-teacher meeting: {s.title}", body=f"You have meeting slots on {when}.")
    db.commit()
    db.refresh(s)
    return s


def admin_cancel_booking(db: Session, s: PtmSession, slot_id: int) -> None:
    x = db.get(PtmSlot, slot_id)
    if not x or x.session_id != s.id:
        raise _404("Slot")
    if x.student_id:
        st = db.get(Student, x.student_id)
        if st:
            notify.student_parents(
                db, st, f"Meeting slot cancelled: {s.title}",
                f"The school cancelled the {x.start_time.strftime('%I:%M %p').lstrip('0')} slot. Please book another.",
            )
    _free(x)
    db.commit()


def _free(x: PtmSlot) -> None:
    x.student_id = x.parent_user_id = x.booked_at = x.parent_note = x.teacher_notes = None
    x.status = PtmSlotStatus.open


def _in_scope(db: Session, s: PtmSession, scope: ParentScope, student: Student) -> bool:
    if s.school_id != student.school_id:
        return False
    if s.section_id:
        return student.section_id == s.section_id
    if s.class_id:
        return scope.class_of.get(student.id) == s.class_id
    return True


def booking_open(db: Session, s: PtmSession) -> bool:
    if not s.is_published:
        return False
    if s.booking_closes_at and _now() >= s.booking_closes_at:
        return False
    return school_today(db, s.school_id) <= s.meeting_date


def _teaches(db: Session, scope: ParentScope) -> dict[int, set[int]]:
    """{teacher_user_id: {student ids they teach}} via class teacher + class subjects."""
    out: dict[int, set[int]] = {}
    sec_teacher = dict(db.execute(
        select(Section.id, Section.class_teacher_user_id).where(Section.id.in_(scope.section_ids or {-1}))
    ).all())
    subj = db.execute(
        select(ClassSubject.class_id, ClassSubject.teacher_user_id).where(
            ClassSubject.class_id.in_(scope.class_ids or {-1}), ClassSubject.teacher_user_id.is_not(None)
        )
    ).all()
    for st in scope.children:
        t = sec_teacher.get(st.section_id)
        if t:
            out.setdefault(t, set()).add(st.id)
        for cid, tid in subj:
            if cid == scope.class_of.get(st.id):
                out.setdefault(tid, set()).add(st.id)
    return out


def parent_sessions(db: Session, parent_user_id: int) -> list[dict]:
    scope = ParentScope(db, parent_user_id)
    if not scope.children:
        return []
    horizon = min(school_today(db, sid) for sid in scope.school_ids) - timedelta(days=30)
    sessions = list(db.execute(
        select(PtmSession).where(
            PtmSession.school_id.in_(scope.school_ids),
            PtmSession.is_published.is_(True),
            PtmSession.meeting_date >= horizon,
        ).order_by(PtmSession.meeting_date)
    ).scalars())
    teaches = _teaches(db, scope)
    child_ids = {c.id for c in scope.children}
    out = []
    for s in sessions:
        eligible = [c.id for c in scope.children if _in_scope(db, s, scope, c)]
        if not eligible:
            continue
        slots = list(db.execute(
            select(PtmSlot).where(PtmSlot.session_id == s.id).order_by(PtmSlot.start_time)
        ).scalars())
        names = _teacher_names(db, {x.teacher_user_id for x in slots})
        by_teacher: dict[int, list] = {}
        for x in slots:
            mine = x.student_id in child_ids and x.parent_user_id is not None
            by_teacher.setdefault(x.teacher_user_id, []).append(dict(
                id=x.id, start_time=x.start_time, end_time=x.end_time,
                state="mine" if mine else ("taken" if x.student_id else "open"),
                student_id=x.student_id if mine else None,
                status=x.status if mine else None,
                teacher_notes=x.teacher_notes if mine and x.status == PtmSlotStatus.done else None,
            ))
        teachers = [
            dict(teacher_user_id=t, teacher_name=names.get(t, "Teacher"),
                 teaches=sorted(teaches.get(t, set()) & set(eligible)), slots=v)
            for t, v in by_teacher.items()
        ]
        teachers.sort(key=lambda t: (not t["teaches"], t["teacher_name"]))
        d = session_to_read(db, s)
        d.update(booking_open=booking_open(db, s), eligible_children=eligible, teachers=teachers)
        out.append(d)
    return out


def book_slot(db: Session, parent_user_id: int, slot_id: int, student_id: int, note: Optional[str]) -> PtmSlot:
    student = require_linked_child(db, parent_user_id, student_id)
    x = db.execute(select(PtmSlot).where(PtmSlot.id == slot_id).with_for_update()).scalar_one_or_none()
    if not x:
        raise _404("Slot")
    s = db.get(PtmSession, x.session_id)
    scope = ParentScope(db, parent_user_id)
    if not s or not s.is_published or not _in_scope(db, s, scope, student):
        raise _404("Slot")
    if not booking_open(db, s):
        raise _400("Booking for this meeting has closed")
    if x.student_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Someone just booked this slot; pick another")
    existing = db.execute(
        select(PtmSlot.id).where(
            PtmSlot.session_id == s.id, PtmSlot.teacher_user_id == x.teacher_user_id, PtmSlot.student_id == student.id
        )
    ).first()
    if existing:
        raise _400(f"{student.full_name} already has a slot with this teacher; cancel it to pick another")
    clash = db.execute(
        select(PtmSlot.id).where(
            PtmSlot.session_id == s.id, PtmSlot.parent_user_id == parent_user_id,
            PtmSlot.start_time < x.end_time, PtmSlot.end_time > x.start_time,
        )
    ).first()
    if clash:
        raise _400("You already have a meeting at this time")
    x.student_id, x.parent_user_id, x.booked_at, x.parent_note = student.id, parent_user_id, _now(), note
    x.status = PtmSlotStatus.booked
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That slot is no longer available")
    db.refresh(x)
    return x


def parent_cancel(db: Session, parent_user_id: int, slot_id: int) -> None:
    x = db.get(PtmSlot, slot_id)
    if not x or x.parent_user_id != parent_user_id:
        raise _404("Booking")
    s = db.get(PtmSession, x.session_id)
    if x.status != PtmSlotStatus.booked or not booking_open(db, s):
        raise _400("This booking can no longer be cancelled")
    _free(x)
    db.commit()


def teacher_sessions(db: Session, teacher_user_id: int, school_id: int) -> list[dict]:
    horizon = school_today(db, school_id) - timedelta(days=60)
    sessions = list(db.execute(
        select(PtmSession)
        .where(
            PtmSession.school_id == school_id, PtmSession.is_published.is_(True), PtmSession.meeting_date >= horizon,
            PtmSession.id.in_(select(PtmSlot.session_id).where(PtmSlot.teacher_user_id == teacher_user_id)),
        )
        .order_by(PtmSession.meeting_date)
    ).scalars())
    out = []
    for s in sessions:
        slots = list(db.execute(
            select(PtmSlot).where(PtmSlot.session_id == s.id, PtmSlot.teacher_user_id == teacher_user_id)
            .order_by(PtmSlot.start_time)
        ).scalars())
        d = session_to_read(db, s)
        d["slots"] = _slot_rows(db, slots)
        out.append(d)
    return out


def record_outcome(db: Session, teacher_user_id: int, slot_id: int, data: SlotOutcomeIn) -> dict:
    x = db.get(PtmSlot, slot_id)
    if not x or x.teacher_user_id != teacher_user_id:
        raise _404("Slot")
    if not x.student_id:
        raise _400("Nobody booked this slot")
    if data.status not in (PtmSlotStatus.done, PtmSlotStatus.no_show, PtmSlotStatus.booked):
        raise _400("Mark the meeting as done or no-show")
    s = db.get(PtmSession, x.session_id)
    if data.status != PtmSlotStatus.booked and school_today(db, s.school_id) < s.meeting_date:
        raise _400("The meeting hasn't happened yet")
    first_done = x.status != PtmSlotStatus.done and data.status == PtmSlotStatus.done
    x.status = data.status
    x.teacher_notes = data.teacher_notes
    if first_done and data.teacher_notes:
        st = db.get(Student, x.student_id)
        if st:
            notify.student_parents(db, st, f"Meeting notes: {s.title}", data.teacher_notes)
    db.commit()
    return _slot_rows(db, [x])[0]


# ---------- gallery ----------

IMAGE_EXT = {"jpg", "jpeg", "png", "webp"}
MAX_PHOTOS_PER_UPLOAD = 30


def get_album(db: Session, album_id: int, school_id: int) -> GalleryAlbum:
    a = db.get(GalleryAlbum, album_id)
    if not a or a.school_id != school_id:
        raise _404("Album")
    return a


def _apply_album(db: Session, a: GalleryAlbum, data: AlbumIn) -> None:
    a.class_id, a.section_id = _check_audience(db, a.school_id, data.audience, data.class_id, data.section_id)
    if data.event_id is not None:
        get_event(db, data.event_id, a.school_id)
    for k in ("title", "description", "album_date", "event_id", "audience"):
        setattr(a, k, getattr(data, k))


def create_album(db: Session, tenant_id: int, school_id: int, user_id: int, data: AlbumIn) -> GalleryAlbum:
    a = GalleryAlbum(tenant_id=tenant_id, school_id=school_id, created_by_user_id=user_id)
    _apply_album(db, a, data)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def update_album(db: Session, a: GalleryAlbum, data: AlbumIn) -> GalleryAlbum:
    _apply_album(db, a, data)
    db.commit()
    db.refresh(a)
    return a


def delete_album(db: Session, a: GalleryAlbum) -> None:
    keys = list(db.execute(select(GalleryPhoto.file_key).where(GalleryPhoto.album_id == a.id)).scalars())
    db.delete(a)
    db.commit()
    for k in keys:
        storage.delete(k)


def set_album_published(db: Session, a: GalleryAlbum, published: bool) -> GalleryAlbum:
    if published and not a.is_published:
        if not db.execute(select(GalleryPhoto.id).where(GalleryPhoto.album_id == a.id).limit(1)).first():
            raise _400("Add photos before publishing the album")
        _notify_audience(db, a, f"New photos: {a.title}", "A new photo album is up in the gallery.")
    a.is_published = published
    db.commit()
    db.refresh(a)
    return a


def albums_to_read(db: Session, albums: list[GalleryAlbum]) -> list[dict]:
    ids = [a.id for a in albums]
    stats = {
        aid: (n, cover) for aid, n, cover in db.execute(
            select(GalleryPhoto.album_id, func.count(), func.min(GalleryPhoto.id))
            .where(GalleryPhoto.album_id.in_(ids or [-1]))
            .group_by(GalleryPhoto.album_id)
        ).all()
    }
    labels = _audience_labels(db, albums)
    out = []
    for a in albums:
        n, cover = stats.get(a.id, (0, None))
        d = {k: getattr(a, k) for k in (
            "id", "title", "description", "album_date", "event_id", "audience", "class_id", "section_id", "is_published",
        )}
        d.update(audience_label=labels[a.id], photo_count=n, cover_photo_id=cover)
        out.append(d)
    return out


def album_detail(db: Session, a: GalleryAlbum) -> dict:
    d = albums_to_read(db, [a])[0]
    d["photos"] = list(db.execute(
        select(GalleryPhoto).where(GalleryPhoto.album_id == a.id).order_by(GalleryPhoto.id)
    ).scalars())
    return d


def list_albums(db: Session, school_id: int, published_only: bool, staff_view: bool = False) -> list[dict]:
    stmt = select(GalleryAlbum).where(GalleryAlbum.school_id == school_id)
    if published_only:
        stmt = stmt.where(GalleryAlbum.is_published.is_(True))
    return albums_to_read(db, list(db.execute(stmt.order_by(GalleryAlbum.album_date.desc())).scalars()))


def parent_albums(db: Session, parent_user_id: int) -> list[dict]:
    scope = ParentScope(db, parent_user_id)
    if not scope.children:
        return []
    albums = db.execute(
        select(GalleryAlbum)
        .where(GalleryAlbum.is_published.is_(True), scope.audience_clause(GalleryAlbum))
        .order_by(GalleryAlbum.album_date.desc())
    ).scalars()
    return albums_to_read(db, list(albums))


def parent_album(db: Session, parent_user_id: int, album_id: int) -> GalleryAlbum:
    scope = ParentScope(db, parent_user_id)
    a = db.get(GalleryAlbum, album_id)
    if not a or not a.is_published or not any(scope.eligible(a, c) for c in scope.children):
        raise _404("Album")
    return a


def upload_photos(db: Session, a: GalleryAlbum, user_id: int, files: list[UploadFile]) -> list[GalleryPhoto]:
    if not files:
        raise _400("Choose at least one photo")
    if len(files) > MAX_PHOTOS_PER_UPLOAD:
        raise _400(f"Upload at most {MAX_PHOTOS_PER_UPLOAD} photos at a time")
    for f in files:
        name = f.filename or ""
        if name.rsplit(".", 1)[-1].lower() not in IMAGE_EXT:
            raise _400(f"{name or 'File'}: only JPG, PNG or WEBP photos can be added")
    saved = []
    try:
        for f in files:
            info = storage.save_upload(a.school_id, "gallery", f)
            saved.append(info["key"])
            db.add(GalleryPhoto(
                tenant_id=a.tenant_id, school_id=a.school_id, album_id=a.id, file_key=info["key"],
                content_type=info["content_type"], size_bytes=info["size_bytes"], uploaded_by_user_id=user_id,
            ))
        db.commit()
    except Exception:
        db.rollback()
        for k in saved:
            storage.delete(k)
        raise
    return list(db.execute(
        select(GalleryPhoto).where(GalleryPhoto.file_key.in_(saved)).order_by(GalleryPhoto.id)
    ).scalars())


def get_photo(db: Session, photo_id: int, school_id: int) -> GalleryPhoto:
    p = db.get(GalleryPhoto, photo_id)
    if not p or p.school_id != school_id:
        raise _404("Photo")
    return p


def delete_photo(db: Session, p: GalleryPhoto) -> None:
    key = p.file_key
    db.delete(p)
    db.commit()
    storage.delete(key)


# ---------- calendar ----------


def _base_items(db: Session, school_id: int, start: date, end: date) -> list[dict]:
    items = []
    for h in db.execute(
        select(Holiday).where(Holiday.school_id == school_id, Holiday.end_date >= start, Holiday.start_date <= end)
    ).scalars():
        items.append(dict(type="holiday", id=h.id, title=h.name, start_date=h.start_date, end_date=h.end_date,
                          detail=h.description))
    for x in db.execute(
        select(Exam).where(Exam.school_id == school_id, Exam.end_date >= start, Exam.start_date <= end)
    ).scalars():
        items.append(dict(type="exam", id=x.id, title=x.name, start_date=x.start_date, end_date=x.end_date))
    return items


def _event_item(e: SchoolEvent) -> dict:
    return dict(type="event", id=e.id, title=e.title, start_date=e.start_date, end_date=e.end_date,
                start_time=e.start_time, end_time=e.end_time, detail=e.venue,
                is_draft=not e.is_published, is_cancelled=e.is_cancelled)


def _ptm_item(s: PtmSession) -> dict:
    return dict(type="ptm", id=s.id, title=s.title, start_date=s.meeting_date, end_date=s.meeting_date,
                start_time=s.start_time, end_time=s.end_time, detail=s.venue, is_draft=not s.is_published)


def _sorted(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda i: (i["start_date"], i.get("start_time") or time.min, i["title"]))


def staff_calendar(db: Session, user: User, start: date, end: date) -> list[dict]:
    admin = user.role == UserRole.school_admin
    items = _base_items(db, user.school_id, start, end)
    items += [_event_item(e) for e in list_events(db, user.school_id, start, end, published_only=not admin)]
    stmt = select(PtmSession).where(
        PtmSession.school_id == user.school_id, PtmSession.meeting_date.between(start, end)
    )
    if not admin:
        stmt = stmt.where(PtmSession.is_published.is_(True))
    items += [_ptm_item(s) for s in db.execute(stmt).scalars()]
    booked = db.execute(
        select(PtmSlot, PtmSession)
        .join(PtmSession, PtmSlot.session_id == PtmSession.id)
        .where(
            PtmSlot.teacher_user_id == user.id, PtmSlot.student_id.is_not(None),
            PtmSession.is_published.is_(True), PtmSession.meeting_date.between(start, end),
        )
    ).all()
    names = dict(db.execute(
        select(Student.id, Student.full_name).where(Student.id.in_({x.student_id for x, _ in booked} or {-1}))
    ).all())
    for x, s in booked:
        items.append(dict(type="ptm_slot", id=x.id, title=f"Meeting: {names.get(x.student_id, 'parent')}'s parent",
                          start_date=s.meeting_date, end_date=s.meeting_date,
                          start_time=x.start_time, end_time=x.end_time, detail=s.venue))
    return _sorted(items)


def parent_calendar(db: Session, parent_user_id: int, start: date, end: date) -> list[dict]:
    scope = ParentScope(db, parent_user_id)
    items: list[dict] = []
    for sid in scope.school_ids:
        items += _base_items(db, sid, start, end)
    for e in parent_events(db, parent_user_id, start, end):
        items.append(dict(type="event", id=e["id"], title=e["title"], start_date=e["start_date"],
                          end_date=e["end_date"], start_time=e["start_time"], end_time=e["end_time"],
                          detail=e["venue"], is_cancelled=e["is_cancelled"]))
    for s in parent_sessions(db, parent_user_id):
        if not (start <= s["meeting_date"] <= end):
            continue
        items.append(dict(type="ptm", id=s["id"], title=s["title"], start_date=s["meeting_date"],
                          end_date=s["meeting_date"], start_time=s["start_time"], end_time=s["end_time"],
                          detail=s["venue"]))
        for t in s["teachers"]:
            for x in t["slots"]:
                if x["state"] == "mine":
                    items.append(dict(type="ptm_slot", id=x["id"], title=f"Meeting with {t['teacher_name']}",
                                      start_date=s["meeting_date"], end_date=s["meeting_date"],
                                      start_time=x["start_time"], end_time=x["end_time"], detail=s["venue"]))
    return _sorted(items)
