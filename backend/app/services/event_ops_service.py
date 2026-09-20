"""The register at the coach door, the teacher's own parents' evening, and
what the school has actually sent.

events_service.py plans an event and collects consent. This covers what
happens on the day, plus the two communication gaps: nobody could see what
had been sent across all notices, and a teacher could not arrange a meeting
for their own class without asking the office.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.enums import (
    ConsentResponse,
    EventAudience,
    NoticeChannel,
    NoticeStatus,
    RecipientStatus,
    UserRole,
)
from app.core.scoping import section_labels
from app.models.academic import SchoolClass, Section
from app.models.event_ops import EventAttendance
from app.models.events import EventConsent, PtmSession, SchoolEvent
from app.models.messaging import Conversation, Message
from app.models.notice import Notice, NoticeRecipient
from app.models.student import Student
from app.models.user import User
from app.services import events_service


def _404(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _400(why: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, why)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------- the register ----------


def attendance_register(db: Session, school_id: int, event_id: int) -> dict:
    """Every eligible child, what their parent said, and whether they went.

    Consent and attendance sit side by side and neither is derived from the
    other. The number worth reading is `consented_absent`: children whose
    parents said yes and who are not on the coach.
    """
    event = events_service.get_event(db, event_id, school_id)
    students = list(db.execute(
        events_service._eligible_students_stmt(event)
        .order_by(Student.section_id, Student.full_name)
    ).scalars())

    consents = {
        c.student_id: c for c in db.execute(
            select(EventConsent).where(EventConsent.event_id == event_id)
        ).scalars()
    }
    marks = {
        a.student_id: a for a in db.execute(
            select(EventAttendance).where(EventAttendance.event_id == event_id)
        ).scalars()
    }
    labels = section_labels(db, {s.section_id for s in students})
    markers = dict(db.execute(
        select(User.id, User.full_name).where(
            User.id.in_({a.marked_by_user_id for a in marks.values() if a.marked_by_user_id} or {-1})
        )
    ).all())

    rows = []
    for s in students:
        c = consents.get(s.id)
        a = marks.get(s.id)
        consented = bool(c and c.response == ConsentResponse.yes)
        rows.append({
            "student_id": s.id,
            "student_name": s.full_name,
            "admission_no": s.admission_no,
            "class_label": labels.get(s.section_id),
            "consent": c.response.value if c else None,
            "consented": consented,
            "attended": a.attended if a else None,
            "note": a.note if a else None,
            "marked_by": markers.get(a.marked_by_user_id) if a else None,
            "marked_at": a.marked_at if a else None,
            # The one a teacher scans for.
            "consented_absent": consented and a is not None and not a.attended,
            "came_without_consent": (
                bool(a and a.attended) and event.requires_consent and not consented
            ),
        })

    return {
        "event": events_service.events_to_read(db, [event])[0],
        "requires_consent": event.requires_consent,
        "eligible": len(rows),
        "consented": sum(1 for r in rows if r["consented"]),
        "attended": sum(1 for r in rows if r["attended"]),
        "unmarked": sum(1 for r in rows if r["attended"] is None),
        "consented_absent": sum(1 for r in rows if r["consented_absent"]),
        "came_without_consent": sum(1 for r in rows if r["came_without_consent"]),
        "rows": rows,
    }


def save_attendance(db: Session, school_id: int, tenant_id: int, user_id: int,
                    event_id: int, entries: list[dict]) -> dict:
    """Mark who boarded. Recorded against a named person at a real time."""
    event = events_service.get_event(db, event_id, school_id)
    if event.is_cancelled:
        raise _400("This event was cancelled.")
    eligible = {
        s.id for s in db.execute(events_service._eligible_students_stmt(event)).scalars()
    }

    for e in entries:
        sid = int(e["student_id"])
        if sid not in eligible:
            raise _400("That child is not on this event.")
        row = db.execute(
            select(EventAttendance).where(
                EventAttendance.event_id == event_id,
                EventAttendance.student_id == sid,
            )
        ).scalar_one_or_none()
        if row is None:
            row = EventAttendance(
                tenant_id=tenant_id, school_id=school_id,
                event_id=event_id, student_id=sid, attended=bool(e["attended"]),
            )
            db.add(row)
        row.attended = bool(e["attended"])
        row.note = (e.get("note") or None)
        row.marked_by_user_id = user_id
        row.marked_at = _now()
    db.commit()
    return attendance_register(db, school_id, event_id)


# ---------- a teacher's own parents' evening ----------


def teacher_scopes(db: Session, user: User) -> list[dict]:
    """The sections this teacher may arrange a meeting for.

    A class teacher may arrange one for their own class. A teacher may not
    arrange a whole-school parents' evening, because that is a decision about
    everybody else's diary.
    """
    rows = db.execute(
        select(Section, SchoolClass)
        .join(SchoolClass, SchoolClass.id == Section.class_id)
        .where(
            Section.school_id == user.school_id,
            Section.class_teacher_user_id == user.id,
        )
        .order_by(SchoolClass.name, Section.name)
    ).all()
    return [
        {
            "section_id": sec.id,
            "class_id": cls.id,
            "label": f"{cls.name} {sec.name}",
        }
        for sec, cls in rows
    ]


def create_teacher_session(db: Session, user: User, section_id: int, data) -> PtmSession:
    """Create a PTM session for a section this teacher is class teacher of."""
    allowed = {s["section_id"] for s in teacher_scopes(db, user)}
    if section_id not in allowed:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "You can only arrange a meeting for a class you are the class teacher of. "
            "Ask the office for anything wider.",
        )
    payload = data.model_copy(update={"section_id": section_id, "class_id": None})
    session = events_service.create_session(
        db, user.tenant_id, user.school_id, user.id, payload
    )
    # The teacher who arranged it is the one parents will be booking with.
    events_service.add_teachers(db, session, [user.id])
    return session


# ---------- what the school has sent ----------


def _delivery(db: Session, notice_ids: list[int]) -> dict[int, dict]:
    """Per notice, how each channel got on.

    `skipped` is kept apart from `failed` throughout. Skipped means there was
    no address or mobile number on file; failed means we tried and could not.
    Merging them sends somebody to debug a gateway when the real answer is a
    blank column in a spreadsheet.
    """
    if not notice_ids:
        return {}
    rows = db.execute(
        select(
            NoticeRecipient.notice_id,
            NoticeRecipient.channel,
            NoticeRecipient.status,
            func.count(NoticeRecipient.id),
        )
        .where(NoticeRecipient.notice_id.in_(notice_ids))
        .group_by(NoticeRecipient.notice_id, NoticeRecipient.channel, NoticeRecipient.status)
    ).all()

    out: dict[int, dict] = {}
    for notice_id, channel, st, n in rows:
        bucket = out.setdefault(notice_id, {"total": 0, "channels": {}})
        ch = bucket["channels"].setdefault(
            channel.value,
            {"channel": channel.value, "total": 0, "queued": 0, "sent": 0,
             "delivered": 0, "failed": 0, "skipped": 0, "read": 0},
        )
        ch["total"] += n
        if st.value in ch:
            ch[st.value] += n
        bucket["total"] += n

    read_rows = db.execute(
        select(NoticeRecipient.notice_id, func.count(NoticeRecipient.id))
        .where(
            NoticeRecipient.notice_id.in_(notice_ids),
            NoticeRecipient.read_at.is_not(None),
        )
        .group_by(NoticeRecipient.notice_id)
    ).all()
    for notice_id, n in read_rows:
        out.setdefault(notice_id, {"total": 0, "channels": {}})["read"] = n

    for bucket in out.values():
        bucket.setdefault("read", 0)
        bucket["channels"] = sorted(bucket["channels"].values(), key=lambda c: c["channel"])
    return out


def campaigns(db: Session, school_id: int, *, state: Optional[NoticeStatus] = None,
              limit: int = 100) -> dict:
    """Every notice, with what became of it.

    A scheduled notice is reported as scheduled and counted separately from a
    sent one. Nothing in this deployment sends on a timer, so a scheduled
    notice sits waiting for somebody to send it — see `scheduler_running`.
    """
    stmt = select(Notice).where(Notice.school_id == school_id)
    if state:
        stmt = stmt.where(Notice.status == state)
    notices = list(db.execute(stmt.order_by(Notice.created_at.desc()).limit(limit)).scalars())
    delivery = _delivery(db, [n.id for n in notices])
    authors = dict(db.execute(
        select(User.id, User.full_name).where(
            User.id.in_({n.created_by_user_id for n in notices if n.created_by_user_id} or {-1})
        )
    ).all())

    rows = []
    for n in notices:
        d = delivery.get(n.id, {"total": 0, "channels": [], "read": 0})
        rows.append({
            "notice_id": n.id,
            "title": n.title,
            "audience": n.audience.value,
            "channels": n.channels or [],
            "status": n.status.value,
            "scheduled_at": n.scheduled_at,
            "sent_at": n.sent_at,
            "created_at": n.created_at,
            "created_by": authors.get(n.created_by_user_id),
            "recipients": d["total"],
            "read": d.get("read", 0),
            "delivery": d["channels"],
            "overdue": bool(
                n.status == NoticeStatus.scheduled
                and n.scheduled_at
                and n.scheduled_at < _now()
            ),
        })

    return {
        "rows": rows,
        "sent": sum(1 for r in rows if r["status"] == NoticeStatus.sent.value),
        "scheduled": sum(1 for r in rows if r["status"] == NoticeStatus.scheduled.value),
        "draft": sum(1 for r in rows if r["status"] == NoticeStatus.draft.value),
        "overdue": sum(1 for r in rows if r["overdue"]),
        # Stated rather than implied. Nothing in this deployment sends a
        # notice on a timer; a scheduled one waits for somebody to press send.
        "scheduler_running": False,
    }


def history(db: Session, school_id: int, *, frm: Optional[date] = None,
            to: Optional[date] = None, channel: Optional[NoticeChannel] = None,
            limit: int = 500) -> dict:
    """Every message that went to a person, across every notice.

    The per-notice view answers "did this go out". This answers "what have we
    sent this family", which is the question asked when somebody says they
    were never told.
    """
    to = to or date.today()
    frm = frm or (to - timedelta(days=90))

    stmt = (
        select(NoticeRecipient, Notice, User)
        .join(Notice, Notice.id == NoticeRecipient.notice_id)
        .join(User, User.id == NoticeRecipient.user_id, isouter=True)
        .where(
            Notice.school_id == school_id,
            func.date(Notice.created_at) >= frm,
            func.date(Notice.created_at) <= to,
        )
    )
    if channel:
        stmt = stmt.where(NoticeRecipient.channel == channel)
    rows = db.execute(
        stmt.order_by(Notice.created_at.desc(), User.full_name).limit(limit)
    ).all()

    out = []
    for rec, n, user in rows:
        out.append({
            "recipient_id": rec.id,
            "notice_id": n.id,
            "title": n.title,
            "sent_on": n.sent_at or n.created_at,
            "to_user_id": rec.user_id,
            "to_name": user.full_name if user else None,
            "to_role": user.role.value if user else None,
            "channel": rec.channel.value,
            "status": rec.status.value,
            "error": rec.error,
            "read_at": rec.read_at,
        })

    by_status: dict[str, int] = {}
    for r in out:
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1

    return {
        "from_date": frm,
        "to_date": to,
        "rows": out,
        "count": len(out),
        "by_status": [{"status": k, "count": v} for k, v in sorted(by_status.items())],
        "truncated": len(out) >= limit,
    }


# ---------- what an admin can see of messaging ----------


def conversation_overview(db: Session, school_id: int, *, limit: int = 200) -> dict:
    """Who is talking to whom, and when they last did.

    Message bodies are deliberately absent. A conversation is between a
    parent and a teacher; an administrator is not a participant, and a screen
    that quietly shows every word would change what both of them are willing
    to write. What an office actually needs from this is whether a parent has
    been left waiting, which the counts answer.
    """
    rows = db.execute(
        select(Conversation)
        .where(Conversation.school_id == school_id)
        .order_by(Conversation.last_message_at.desc().nullslast())
        .limit(limit)
    ).scalars()

    out = []
    for c in rows:
        parent = db.get(User, c.parent_user_id)
        teacher = db.get(User, c.teacher_user_id)
        student = db.get(Student, c.student_id)
        total = db.execute(
            select(func.count(Message.id)).where(Message.conversation_id == c.id)
        ).scalar_one()
        out.append({
            "conversation_id": c.id,
            "parent_name": parent.full_name if parent else None,
            "teacher_name": teacher.full_name if teacher else None,
            "student_name": student.full_name if student else None,
            "messages": total,
            "last_message_at": c.last_message_at,
            "teacher_unread": c.teacher_unread,
            "parent_unread": c.parent_unread,
            "closed": c.closed_at is not None,
            # A parent waiting on a teacher is the only thing here an office
            # can usefully act on.
            "awaiting_teacher": c.teacher_unread > 0 and c.closed_at is None,
        })

    return {
        "rows": out,
        "count": len(out),
        "awaiting_teacher": sum(1 for r in out if r["awaiting_teacher"]),
        # Said on the screen too, so nobody assumes the bodies are hidden by
        # accident.
        "bodies_visible": False,
    }
