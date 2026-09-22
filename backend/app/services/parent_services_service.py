"""Parent services — see app.models.parent_services.

Every parent-facing function takes the parent's user id and checks the child
belongs to them (require_linked_child), so a parent only ever reaches their
own children's records. School-facing functions are scoped by school_id.
"""
from __future__ import annotations

import io
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core import notify
from app.core.enums import MoneyMode, NoticeAudience, UserRole
from app.core.scoping import require_linked_child, section_label
from app.models.academic import AcademicYear, SchoolClass, Section
from app.models.parent import ParentStudent
from app.models.parent_services import (
    CanteenMenu,
    HelpTicket,
    HelpTicketReply,
    ParentRequest,
    ParentServiceSettings,
    ProjectMilestone,
    StudentAchievement,
    Survey,
    SurveyResponse,
)
from app.models.student import Student
from app.models.tenant import School
from app.models.user import User


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _409(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg)


def _name(db: Session, user_id: Optional[int]) -> Optional[str]:
    if not user_id:
        return None
    u = db.get(User, user_id)
    return u.full_name if u else None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _tell_parent(db: Session, parent: User, title: str, body: str, student_id: Optional[int] = None) -> None:
    """In-app notice to one parent. Best effort; caller commits."""
    if parent.tenant_id is None or parent.school_id is None:
        return
    notify._send(
        db,
        tenant_id=parent.tenant_id,
        school_id=parent.school_id,
        user_ids=[parent.id],
        title=title,
        body=body,
        audience=NoticeAudience.single_parent,
        student_id=student_id,
    )


def _parent_school(parent: User) -> int:
    if parent.school_id is None or parent.tenant_id is None:
        raise _400("Your account is not linked to a school")
    return parent.school_id


# =====================================================================
# School contact hours
# =====================================================================


def get_settings_row(db: Session, school_id: int) -> Optional[ParentServiceSettings]:
    return db.execute(
        select(ParentServiceSettings).where(ParentServiceSettings.school_id == school_id)
    ).scalar_one_or_none()


def settings_read(db: Session, school_id: int) -> dict:
    s = get_settings_row(db, school_id)
    school = db.get(School, school_id)
    return {
        "school_name": school.name if school else None,
        "communication_hours": s.communication_hours if s else None,
        "office_hours": s.office_hours if s else None,
        # Fall back to the school profile's contact details.
        "office_phone": (s.office_phone if s and s.office_phone else (school.phone_primary if school else None)),
        "office_email": (s.office_email if s and s.office_email else (school.email if school else None)),
        "help_desk_note": s.help_desk_note if s else None,
    }


def put_settings(db: Session, user: User, data) -> dict:
    s = get_settings_row(db, user.school_id)
    if not s:
        s = ParentServiceSettings(tenant_id=user.tenant_id, school_id=user.school_id)
        db.add(s)
    for k, v in data.model_dump().items():
        setattr(s, k, (v or "").strip() or None)
    db.commit()
    return settings_read(db, user.school_id)


# =====================================================================
# Requests the school approves
# =====================================================================

KIND_LABEL = {
    "link_child": "Link a child",
    "contact_change": "Contact details change",
    "transport_change": "Transport change",
    "library_renewal": "Library renewal",
}

TRANSPORT_LABEL = {
    "change_stop": "Change stop",
    "start_service": "Start using school transport",
    "stop_service": "Stop using school transport",
    "temporary_pause": "Pause transport for a while",
}


def _summary(r: ParentRequest) -> str:
    d = r.details or {}
    if r.kind == "link_child":
        return f"Admission no. {d.get('admission_no')} · born {d.get('date_of_birth')} · {d.get('relation', 'guardian')}"
    if r.kind == "contact_change":
        parts = []
        if d.get("phone"):
            parts.append(f"mobile → {d['phone']}")
        if d.get("email"):
            parts.append(f"email → {d['email']}")
        return ", ".join(parts)
    if r.kind == "transport_change":
        s = f"{TRANSPORT_LABEL.get(d.get('request_type'), d.get('request_type'))} from {d.get('effective_from')}"
        if d.get("until"):
            s += f" to {d['until']}"
        if d.get("requested_stop_name"):
            s += f" · {d['requested_stop_name']} ({d.get('requested_route_name')})"
        return s
    if r.kind == "library_renewal":
        return f"{d.get('title')} (copy {d.get('accession_no')}) · due {d.get('due_on')}"
    return r.kind


def _match_student(db: Session, school_id: int, details: dict) -> Optional[Student]:
    adm = (details.get("admission_no") or "").strip()
    dob = details.get("date_of_birth")
    if not adm or not dob:
        return None
    return db.execute(
        select(Student).where(
            Student.school_id == school_id,
            func.lower(Student.admission_no) == adm.lower(),
            Student.dob == date.fromisoformat(dob),
        )
    ).scalar_one_or_none()


def request_read(db: Session, r: ParentRequest, *, school_side: bool = False) -> dict:
    parent = db.get(User, r.parent_user_id)
    st = db.get(Student, r.student_id) if r.student_id else None
    out = {
        "id": r.id,
        "kind": r.kind,
        "status": r.status,
        "parent_user_id": r.parent_user_id,
        "parent_name": parent.full_name if parent else None,
        "parent_phone": parent.phone if parent and school_side else None,
        "parent_email": parent.email if parent and school_side else None,
        "student_id": r.student_id,
        "student_name": st.full_name if st else None,
        "section_label": section_label(db, st.section_id) if st else None,
        "details": r.details or {},
        "summary": _summary(r),
        "reason": r.reason,
        "decided_by_name": _name(db, r.decided_by_user_id),
        "decided_at": r.decided_at,
        "decision_note": r.decision_note,
        "created_at": r.created_at,
    }
    if school_side and r.kind == "link_child" and r.status == "pending":
        m = _match_student(db, r.school_id, r.details or {})
        out["matched_student_id"] = m.id if m else None
        out["matched_student_name"] = m.full_name if m else None
    return out


def _new_request(db: Session, parent: User, kind: str, details: dict, *, student_id=None, reason=None) -> ParentRequest:
    r = ParentRequest(
        tenant_id=parent.tenant_id,
        school_id=_parent_school(parent),
        parent_user_id=parent.id,
        student_id=student_id,
        kind=kind,
        status="pending",
        details=details,
        reason=(reason or "").strip() or None,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def _pending(db: Session, parent_id: int, kind: str) -> list[ParentRequest]:
    return list(
        db.execute(
            select(ParentRequest).where(
                ParentRequest.parent_user_id == parent_id,
                ParentRequest.kind == kind,
                ParentRequest.status == "pending",
            )
        ).scalars()
    )


def parent_requests(
    db: Session, parent_id: int, *, kind: Optional[str] = None, student_id: Optional[int] = None
) -> list[ParentRequest]:
    stmt = select(ParentRequest).where(ParentRequest.parent_user_id == parent_id)
    if kind:
        stmt = stmt.where(ParentRequest.kind == kind)
    if student_id is not None:
        require_linked_child(db, parent_id, student_id)
        stmt = stmt.where(ParentRequest.student_id == student_id)
    return list(db.execute(stmt.order_by(ParentRequest.created_at.desc()).limit(100)).scalars())


def request_link_child(db: Session, parent: User, data) -> ParentRequest:
    adm = data.admission_no.strip()
    for r in _pending(db, parent.id, "link_child"):
        if (r.details or {}).get("admission_no", "").lower() == adm.lower():
            raise _409("You already asked to link this child; the school is checking it")
    return _new_request(
        db,
        parent,
        "link_child",
        {
            "admission_no": adm,
            "date_of_birth": data.date_of_birth.isoformat(),
            "relation": data.relation.value,
        },
        reason=data.note,
    )


def request_contact_change(db: Session, parent: User, data) -> ParentRequest:
    if _pending(db, parent.id, "contact_change"):
        raise _409("You already have a contact change waiting for the school")
    phone = (data.phone or "").strip() or None
    email = (data.email or "").strip().lower() or None
    if phone == parent.phone and email in (None, (parent.email or "").lower()):
        raise _400("That is already your mobile number")
    if email and email == (parent.email or "").lower() and not phone:
        raise _400("That is already your email address")
    return _new_request(
        db,
        parent,
        "contact_change",
        {"phone": phone, "email": email, "old_phone": parent.phone, "old_email": parent.email},
        reason=data.reason,
    )


def _current_assignment(db: Session, student_id: int):
    from app.models.transport import TransportAssignment, TransportRoute, TransportStop

    return db.execute(
        select(TransportAssignment, TransportRoute, TransportStop)
        .join(TransportRoute, TransportAssignment.route_id == TransportRoute.id)
        .join(TransportStop, TransportAssignment.stop_id == TransportStop.id)
        .where(TransportAssignment.student_id == student_id, TransportAssignment.end_date.is_(None))
    ).first()


def request_transport_change(db: Session, parent: User, student_id: int, data) -> ParentRequest:
    from app.models.transport import TransportRoute, TransportStop

    st = require_linked_child(db, parent.id, student_id)
    cur = _current_assignment(db, st.id)
    if data.request_type in ("change_stop", "stop_service", "temporary_pause") and not cur:
        raise _400("This child is not using school transport yet — ask to start using it instead")
    if data.request_type == "start_service" and cur:
        raise _400("This child already uses school transport — ask for a stop change instead")
    if data.effective_from < date.today():
        raise _400("The change can't start in the past")
    details = {
        "request_type": data.request_type,
        "effective_from": data.effective_from.isoformat(),
        "until": data.until.isoformat() if data.until else None,
        "current_route_name": cur[1].name if cur else None,
        "current_stop_name": cur[2].name if cur else None,
    }
    if data.requested_stop_id and data.request_type in ("change_stop", "start_service"):
        stop = db.get(TransportStop, data.requested_stop_id)
        route = db.get(TransportRoute, stop.route_id) if stop else None
        if not stop or not route or route.school_id != st.school_id or not route.is_active:
            raise _400("Choose one of the school's stops")
        if cur and stop.id == cur[2].id:
            raise _400("That is already your child's stop")
        details.update(
            requested_stop_id=stop.id,
            requested_stop_name=stop.name,
            requested_route_id=route.id,
            requested_route_name=route.name,
        )
    for r in _pending(db, parent.id, "transport_change"):
        if r.student_id == st.id:
            raise _409("There is already a transport request waiting for the school for this child")
    return _new_request(db, parent, "transport_change", details, student_id=st.id, reason=data.reason)


def request_library_renewal(db: Session, parent: User, student_id: int, data) -> ParentRequest:
    from app.models.library import Book, BookCopy, Loan

    st = require_linked_child(db, parent.id, student_id)
    loan = db.get(Loan, data.loan_id)
    if not loan or loan.student_id != st.id:
        raise _404("Loan")
    if loan.returned_on or loan.lost_on:
        raise _400("This book has already been returned")
    for r in _pending(db, parent.id, "library_renewal"):
        if (r.details or {}).get("loan_id") == loan.id:
            raise _409("You already asked to renew this book")
    copy = db.get(BookCopy, loan.copy_id)
    book = db.get(Book, copy.book_id) if copy else None
    return _new_request(
        db,
        parent,
        "library_renewal",
        {
            "loan_id": loan.id,
            "title": book.title if book else None,
            "accession_no": copy.accession_no if copy else None,
            "due_on": loan.due_on.isoformat(),
        },
        student_id=st.id,
        reason=data.note,
    )


def cancel_request(db: Session, parent: User, request_id: int) -> ParentRequest:
    r = db.get(ParentRequest, request_id)
    if not r or r.parent_user_id != parent.id:
        raise _404("Request")
    if r.status != "pending":
        raise _400("Only a request still waiting for the school can be withdrawn")
    r.status = "cancelled"
    db.commit()
    db.refresh(r)
    return r


def school_requests(
    db: Session, school_id: int, kinds: Iterable[str], *, status_filter: Optional[str] = None
) -> list[ParentRequest]:
    stmt = select(ParentRequest).where(ParentRequest.school_id == school_id, ParentRequest.kind.in_(list(kinds)))
    if status_filter:
        stmt = stmt.where(ParentRequest.status == status_filter)
    # Pending first, then newest.
    stmt = stmt.order_by((ParentRequest.status != "pending"), ParentRequest.created_at.desc()).limit(300)
    return list(db.execute(stmt).scalars())


def _apply_link_child(db: Session, user: User, r: ParentRequest, student_id: Optional[int]) -> None:
    from app.core.enums import ParentRelation
    from app.schemas.parent import LinkChildRequest
    from app.services import parent_service

    st = db.get(Student, student_id) if student_id else _match_student(db, r.school_id, r.details or {})
    if not st or st.school_id != r.school_id:
        raise _400("No student matches this admission number and date of birth — choose the student to link")
    parent_service.link_child(
        db,
        r.parent_user_id,
        user.tenant_id,
        user.school_id,
        LinkChildRequest(student_id=st.id, relation=ParentRelation((r.details or {}).get("relation", "guardian"))),
    )
    r.student_id = st.id


def _apply_contact_change(db: Session, r: ParentRequest) -> None:
    d = r.details or {}
    parent = db.get(User, r.parent_user_id)
    if not parent:
        raise _404("Parent")
    for field in ("phone", "email"):
        v = d.get(field)
        if not v:
            continue
        col = getattr(User, field)
        clash = db.execute(
            select(User.id).where(User.tenant_id == parent.tenant_id, func.lower(col) == v.lower(), User.id != parent.id)
        ).first()
        if clash:
            raise _409(f"Another account already uses this {'mobile number' if field == 'phone' else 'email address'}")
        setattr(parent, field, v)


def _apply_transport(db: Session, user: User, r: ParentRequest) -> None:
    from app.core.enums import TransportDirection
    from app.schemas.transport import AssignmentCreate
    from app.services import transport_service

    d = r.details or {}
    kind = d.get("request_type")
    start = date.fromisoformat(d["effective_from"])
    cur = _current_assignment(db, r.student_id)
    if kind in ("change_stop", "start_service"):
        transport_service.assign(
            db,
            user.tenant_id,
            user.school_id,
            AssignmentCreate(
                student_id=r.student_id,
                route_id=d["requested_route_id"],
                stop_id=d["requested_stop_id"],
                direction=cur[0].direction if cur else TransportDirection.both,
                start_date=start,
            ),
        )
    elif kind == "stop_service":
        if not cur:
            raise _400("This child has no transport assignment to end")
        transport_service.end_assignment(db, cur[0].id, user.school_id, max(cur[0].start_date, start - timedelta(days=1)))
    # temporary_pause: nothing to change in the assignment; the approval is the record.


def _apply_library(db: Session, user: User, r: ParentRequest) -> None:
    from app.services import library_service

    library_service.renew(db, (r.details or {})["loan_id"], user.school_id)


def decide_request(db: Session, user: User, request_id: int, kinds: Iterable[str], data) -> ParentRequest:
    r = db.get(ParentRequest, request_id)
    if not r or r.school_id != user.school_id or r.kind not in set(kinds):
        raise _404("Request")
    if r.status != "pending":
        raise _400(f"This request is already {r.status}")
    if data.approve:
        if r.kind == "link_child":
            _apply_link_child(db, user, r, data.student_id)
        elif r.kind == "contact_change":
            _apply_contact_change(db, r)
        elif r.kind == "transport_change":
            _apply_transport(db, user, r)
        elif r.kind == "library_renewal":
            _apply_library(db, user, r)
    r.status = "approved" if data.approve else "rejected"
    r.decided_by_user_id = user.id
    r.decided_at = _now()
    r.decision_note = (data.note or "").strip() or None
    parent = db.get(User, r.parent_user_id)
    if parent:
        verdict = "approved" if data.approve else "declined"
        body = f"{KIND_LABEL.get(r.kind, r.kind)}: {_summary(r)}. The school {verdict} your request."
        if r.decision_note:
            body += f" Note: {r.decision_note}"
        _tell_parent(db, parent, f"Request {verdict}", body, r.student_id)
    db.commit()
    db.refresh(r)
    return r


# =====================================================================
# Help desk
# =====================================================================


def _ticket_read(db: Session, t: HelpTicket, *, with_replies: bool = False) -> dict:
    st = db.get(Student, t.student_id) if t.student_id else None
    replies = list(
        db.execute(
            select(HelpTicketReply).where(HelpTicketReply.ticket_id == t.id).order_by(HelpTicketReply.created_at)
        ).scalars()
    )
    out = {
        "id": t.id,
        "parent_user_id": t.parent_user_id,
        "parent_name": _name(db, t.parent_user_id),
        "student_id": t.student_id,
        "student_name": st.full_name if st else None,
        "category": t.category,
        "subject": t.subject,
        "status": t.status,
        "assigned_to_name": _name(db, t.assigned_to_user_id),
        "last_activity_at": t.last_activity_at or t.created_at,
        "parent_unread": t.parent_unread,
        "last_reply": replies[-1].body if replies else None,
        "resolved_at": t.resolved_at,
        "created_at": t.created_at,
        "replies": None,
    }
    if with_replies:
        out["replies"] = [
            {
                "id": x.id,
                "author_user_id": x.author_user_id,
                "author_name": _name(db, x.author_user_id),
                "from_parent": x.author_user_id == t.parent_user_id,
                "body": x.body,
                "created_at": x.created_at,
            }
            for x in replies
        ]
    return out


def ticket_read(db: Session, t: HelpTicket, *, with_replies: bool = False) -> dict:
    return _ticket_read(db, t, with_replies=with_replies)


def parent_create_ticket(db: Session, parent: User, data) -> HelpTicket:
    school_id = _parent_school(parent)
    if data.student_id is not None:
        require_linked_child(db, parent.id, data.student_id)
    t = HelpTicket(
        tenant_id=parent.tenant_id,
        school_id=school_id,
        parent_user_id=parent.id,
        student_id=data.student_id,
        category=data.category.strip(),
        subject=data.subject.strip(),
        status="open",
        last_activity_at=_now(),
    )
    db.add(t)
    db.flush()
    db.add(HelpTicketReply(ticket_id=t.id, author_user_id=parent.id, body=data.description.strip()))
    db.commit()
    db.refresh(t)
    return t


def parent_tickets(db: Session, parent_id: int, student_id: Optional[int] = None) -> list[HelpTicket]:
    stmt = select(HelpTicket).where(HelpTicket.parent_user_id == parent_id)
    if student_id is not None:
        require_linked_child(db, parent_id, student_id)
        # Office requests about this child, and ones about no child in particular.
        stmt = stmt.where(or_(HelpTicket.student_id == student_id, HelpTicket.student_id.is_(None)))
    return list(db.execute(stmt.order_by(HelpTicket.last_activity_at.desc().nullslast()).limit(100)).scalars())


def _parent_ticket(db: Session, parent_id: int, ticket_id: int) -> HelpTicket:
    t = db.get(HelpTicket, ticket_id)
    if not t or t.parent_user_id != parent_id:
        raise _404("Request")
    return t


def parent_open_ticket(db: Session, parent_id: int, ticket_id: int) -> HelpTicket:
    t = _parent_ticket(db, parent_id, ticket_id)
    if t.parent_unread:
        t.parent_unread = 0
        db.commit()
        db.refresh(t)
    return t


def parent_reply(db: Session, parent: User, ticket_id: int, body: str) -> HelpTicket:
    t = _parent_ticket(db, parent.id, ticket_id)
    db.add(HelpTicketReply(ticket_id=t.id, author_user_id=parent.id, body=body.strip()))
    if t.status == "resolved":  # writing again reopens it
        t.status = "open"
        t.resolved_at = None
        t.resolved_by_user_id = None
    t.last_activity_at = _now()
    db.commit()
    db.refresh(t)
    return t


def parent_resolve(db: Session, parent: User, ticket_id: int) -> HelpTicket:
    t = _parent_ticket(db, parent.id, ticket_id)
    if t.status != "resolved":
        t.status = "resolved"
        t.resolved_at = _now()
        t.resolved_by_user_id = parent.id
        t.last_activity_at = t.resolved_at
        db.commit()
        db.refresh(t)
    return t


def school_tickets(db: Session, school_id: int, status_filter: Optional[str] = None) -> list[HelpTicket]:
    stmt = select(HelpTicket).where(HelpTicket.school_id == school_id)
    if status_filter:
        stmt = stmt.where(HelpTicket.status == status_filter)
    return list(
        db.execute(
            stmt.order_by((HelpTicket.status == "resolved"), HelpTicket.last_activity_at.desc().nullslast()).limit(300)
        ).scalars()
    )


def school_ticket(db: Session, school_id: int, ticket_id: int) -> HelpTicket:
    t = db.get(HelpTicket, ticket_id)
    if not t or t.school_id != school_id:
        raise _404("Request")
    return t


def school_reply(db: Session, user: User, ticket_id: int, body: str) -> HelpTicket:
    t = school_ticket(db, user.school_id, ticket_id)
    db.add(HelpTicketReply(ticket_id=t.id, author_user_id=user.id, body=body.strip()))
    t.parent_unread = (t.parent_unread or 0) + 1
    t.last_activity_at = _now()
    if t.status == "open":
        t.status = "in_progress"
    if not t.assigned_to_user_id:
        t.assigned_to_user_id = user.id
    parent = db.get(User, t.parent_user_id)
    if parent:
        _tell_parent(db, parent, "Reply from the school office", f"{t.subject}: {body.strip()[:300]}", t.student_id)
    db.commit()
    db.refresh(t)
    return t


def school_set_ticket_status(db: Session, user: User, ticket_id: int, new_status: str) -> HelpTicket:
    t = school_ticket(db, user.school_id, ticket_id)
    t.status = new_status
    if new_status == "resolved":
        t.resolved_at = _now()
        t.resolved_by_user_id = user.id
    else:
        t.resolved_at = None
        t.resolved_by_user_id = None
    if not t.assigned_to_user_id:
        t.assigned_to_user_id = user.id
    t.last_activity_at = _now()
    db.commit()
    db.refresh(t)
    return t


# =====================================================================
# Surveys
# =====================================================================


def _survey_is_open(s: Survey, today: date) -> bool:
    return s.status == "open" and (s.closes_on is None or s.closes_on >= today)


def _effective_status(s: Survey, today: date) -> str:
    if s.status == "open" and s.closes_on is not None and s.closes_on < today:
        return "closed"
    return s.status


def _audience_parent_ids(db: Session, s: Survey) -> set[int]:
    stmt = (
        select(ParentStudent.parent_user_id)
        .join(Student, ParentStudent.student_id == Student.id)
        .where(Student.school_id == s.school_id, Student.is_active.is_(True))
    )
    if s.audience == "class" and s.class_id:
        stmt = stmt.join(Section, Student.section_id == Section.id).where(Section.class_id == s.class_id)
    return set(db.execute(stmt).scalars())


def survey_read(db: Session, s: Survey, *, school_side: bool = False, response: Optional[SurveyResponse] = None) -> dict:
    cls = db.get(SchoolClass, s.class_id) if s.class_id else None
    out = {
        "id": s.id,
        "title": s.title,
        "description": s.description,
        "audience": s.audience,
        "class_id": s.class_id,
        "class_name": cls.name if cls else None,
        "questions": s.questions or [],
        "status": _effective_status(s, date.today()),
        "closes_on": s.closes_on,
        "created_at": s.created_at,
    }
    if school_side:
        out["response_count"] = db.execute(
            select(func.count(SurveyResponse.id)).where(SurveyResponse.survey_id == s.id)
        ).scalar_one()
        out["audience_count"] = len(_audience_parent_ids(db, s))
    else:
        out["submitted"] = response is not None
        out["submitted_at"] = response.updated_at if response else None
        out["my_answers"] = response.answers if response else None
    return out


def school_surveys(db: Session, school_id: int) -> list[Survey]:
    return list(
        db.execute(select(Survey).where(Survey.school_id == school_id).order_by(Survey.created_at.desc())).scalars()
    )


def _school_survey(db: Session, school_id: int, survey_id: int) -> Survey:
    s = db.get(Survey, survey_id)
    if not s or s.school_id != school_id:
        raise _404("Survey")
    return s


def _check_class(db: Session, school_id: int, class_id: Optional[int]) -> None:
    if class_id is None:
        return
    c = db.get(SchoolClass, class_id)
    if not c or c.school_id != school_id:
        raise _400("Unknown class")


def create_survey(db: Session, user: User, data) -> Survey:
    _check_class(db, user.school_id, data.class_id)
    s = Survey(
        tenant_id=user.tenant_id,
        school_id=user.school_id,
        title=data.title.strip(),
        description=(data.description or "").strip() or None,
        audience=data.audience,
        class_id=data.class_id if data.audience == "class" else None,
        questions=[q.model_dump() for q in data.questions],
        status=data.status,
        closes_on=data.closes_on,
        created_by_user_id=user.id,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def update_survey(db: Session, user: User, survey_id: int, data) -> Survey:
    s = _school_survey(db, user.school_id, survey_id)
    answered = db.execute(select(SurveyResponse.id).where(SurveyResponse.survey_id == s.id)).first()
    new_q = [q.model_dump() for q in data.questions]
    if answered and new_q != (s.questions or []):
        raise _400("Parents have already answered this survey, so its questions can't change")
    _check_class(db, user.school_id, data.class_id)
    s.title = data.title.strip()
    s.description = (data.description or "").strip() or None
    s.audience = data.audience
    s.class_id = data.class_id if data.audience == "class" else None
    s.questions = new_q
    s.status = data.status
    s.closes_on = data.closes_on
    db.commit()
    db.refresh(s)
    return s


def set_survey_status(db: Session, user: User, survey_id: int, new_status: str) -> Survey:
    s = _school_survey(db, user.school_id, survey_id)
    s.status = new_status
    if new_status == "open" and s.closes_on and s.closes_on < date.today():
        s.closes_on = None  # reopening an expired survey
    db.commit()
    db.refresh(s)
    return s


def delete_survey(db: Session, user: User, survey_id: int) -> None:
    s = _school_survey(db, user.school_id, survey_id)
    if db.execute(select(SurveyResponse.id).where(SurveyResponse.survey_id == s.id)).first():
        raise _400("Parents have answered this survey — close it instead of deleting it")
    db.delete(s)
    db.commit()


def survey_results(db: Session, user: User, survey_id: int) -> dict:
    s = _school_survey(db, user.school_id, survey_id)
    responses = list(db.execute(select(SurveyResponse).where(SurveyResponse.survey_id == s.id)).scalars())
    questions = []
    for q in s.questions or []:
        vals = [r.answers.get(q["id"]) for r in responses if r.answers.get(q["id"]) not in (None, "", [])]
        res = {"id": q["id"], "text": q["text"], "kind": q["kind"], "answered": len(vals), "average": None, "counts": {}, "comments": []}
        if q["kind"] == "rating":
            nums = [int(v) for v in vals]
            res["average"] = round(sum(nums) / len(nums), 2) if nums else None
            res["counts"] = {str(i): nums.count(i) for i in range(1, 6)}
        elif q["kind"] == "choice":
            res["counts"] = {o: sum(1 for v in vals if v == o) for o in q.get("options", [])}
        else:
            res["comments"] = [str(v) for v in vals][:200]
        questions.append(res)
    return {"survey": survey_read(db, s, school_side=True), "questions": questions}


def _parent_class_ids(db: Session, parent_id: int) -> set[int]:
    return set(
        db.execute(
            select(Section.class_id)
            .join(Student, Student.section_id == Section.id)
            .join(ParentStudent, ParentStudent.student_id == Student.id)
            .where(ParentStudent.parent_user_id == parent_id)
        ).scalars()
    )


def _parent_can_see(db: Session, parent: User, s: Survey, class_ids: Optional[set[int]] = None) -> bool:
    if s.school_id != parent.school_id or s.status == "draft":
        return False
    if s.audience == "class":
        return s.class_id in (class_ids if class_ids is not None else _parent_class_ids(db, parent.id))
    return True


def parent_surveys(db: Session, parent: User) -> list[dict]:
    if parent.school_id is None:
        return []
    class_ids = _parent_class_ids(db, parent.id)
    rows = db.execute(
        select(Survey).where(Survey.school_id == parent.school_id, Survey.status != "draft").order_by(Survey.created_at.desc())
    ).scalars()
    mine = {
        r.survey_id: r
        for r in db.execute(select(SurveyResponse).where(SurveyResponse.parent_user_id == parent.id)).scalars()
    }
    today = date.today()
    out = []
    for s in rows:
        if not _parent_can_see(db, parent, s, class_ids):
            continue
        # Closed surveys stay listed only for parents who answered them.
        if not _survey_is_open(s, today) and s.id not in mine:
            continue
        out.append(survey_read(db, s, response=mine.get(s.id)))
    return out


def parent_answer(db: Session, parent: User, survey_id: int, answers: dict) -> dict:
    s = db.get(Survey, survey_id)
    if not s or not _parent_can_see(db, parent, s):
        raise _404("Survey")
    if not _survey_is_open(s, date.today()):
        raise _400("This survey is closed")
    clean: dict = {}
    for q in s.questions or []:
        v = answers.get(q["id"])
        if v in (None, ""):
            if q.get("required", True):
                raise _400(f"Answer: {q['text']}")
            continue
        if q["kind"] == "rating":
            try:
                n = int(v)
            except (TypeError, ValueError):
                raise _400(f"Rate 1 to 5: {q['text']}")
            if not 1 <= n <= 5:
                raise _400(f"Rate 1 to 5: {q['text']}")
            clean[q["id"]] = n
        elif q["kind"] == "choice":
            if v not in q.get("options", []):
                raise _400(f"Pick one of the options: {q['text']}")
            clean[q["id"]] = v
        else:
            clean[q["id"]] = str(v).strip()[:2000]
    r = db.execute(
        select(SurveyResponse).where(SurveyResponse.survey_id == s.id, SurveyResponse.parent_user_id == parent.id)
    ).scalar_one_or_none()
    if r:
        r.answers = clean
    else:
        r = SurveyResponse(survey_id=s.id, parent_user_id=parent.id, answers=clean)
        db.add(r)
    db.commit()
    db.refresh(r)
    return survey_read(db, s, response=r)


# =====================================================================
# Achievements & milestones
# =====================================================================


def _staff_student(db: Session, user: User, student_id: int) -> Student:
    st = db.get(Student, student_id)
    if not st or st.school_id != user.school_id:
        raise _404("Student")
    if user.role == UserRole.teacher:
        from app.models.subject import ClassSubject

        sec = db.get(Section, st.section_id)
        teaches = sec is not None and (
            sec.class_teacher_user_id == user.id
            or db.execute(
                select(ClassSubject.id).where(
                    ClassSubject.class_id == sec.class_id, ClassSubject.teacher_user_id == user.id
                )
            ).first()
            is not None
        )
        if not teaches:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't teach this student")
    return st


def achievement_read(db: Session, a: StudentAchievement) -> dict:
    st = db.get(Student, a.student_id)
    return {
        "id": a.id,
        "student_id": a.student_id,
        "student_name": st.full_name if st else None,
        "title": a.title,
        "category": a.category,
        "description": a.description,
        "status": a.status,
        "achieved_on": a.achieved_on,
        "target_value": a.target_value,
        "current_value": a.current_value,
        "unit": a.unit,
        "shared_with_parents": a.shared_with_parents,
        "recorded_by_name": _name(db, a.recorded_by_user_id),
        "created_at": a.created_at,
    }


def _check_achievement(a: StudentAchievement) -> None:
    if a.status == "in_progress" and not a.target_value:
        raise _400("A milestone in progress needs a target (for example 10 books)")
    if a.status == "achieved" and a.achieved_on is None:
        a.achieved_on = date.today()


def staff_achievements(db: Session, user: User, student_id: int) -> list[StudentAchievement]:
    _staff_student(db, user, student_id)
    return list(
        db.execute(
            select(StudentAchievement)
            .where(StudentAchievement.student_id == student_id)
            .order_by(StudentAchievement.created_at.desc())
        ).scalars()
    )


def create_achievement(db: Session, user: User, data) -> StudentAchievement:
    st = _staff_student(db, user, data.student_id)
    a = StudentAchievement(
        tenant_id=st.tenant_id,
        school_id=st.school_id,
        student_id=st.id,
        title=data.title.strip(),
        category=data.category,
        description=(data.description or "").strip() or None,
        status=data.status,
        achieved_on=data.achieved_on,
        target_value=data.target_value,
        current_value=data.current_value,
        unit=(data.unit or "").strip() or None,
        shared_with_parents=data.shared_with_parents,
        recorded_by_user_id=user.id,
    )
    _check_achievement(a)
    db.add(a)
    if a.shared_with_parents and a.status == "achieved":
        notify.student_parents(db, st, "New achievement", f"{st.full_name}: {a.title}")
    db.commit()
    db.refresh(a)
    return a


def _staff_achievement(db: Session, user: User, achievement_id: int) -> StudentAchievement:
    a = db.get(StudentAchievement, achievement_id)
    if not a or a.school_id != user.school_id:
        raise _404("Achievement")
    _staff_student(db, user, a.student_id)
    return a


def update_achievement(db: Session, user: User, achievement_id: int, data) -> StudentAchievement:
    a = _staff_achievement(db, user, achievement_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    if a.status == "in_progress" and a.target_value and (a.current_value or 0) >= a.target_value:
        a.status = "achieved"  # target reached
    _check_achievement(a)
    db.commit()
    db.refresh(a)
    return a


def delete_achievement(db: Session, user: User, achievement_id: int) -> None:
    a = _staff_achievement(db, user, achievement_id)
    db.delete(a)
    db.commit()


def parent_achievements(db: Session, parent_id: int, student_id: int) -> list[StudentAchievement]:
    require_linked_child(db, parent_id, student_id)
    return list(
        db.execute(
            select(StudentAchievement)
            .where(StudentAchievement.student_id == student_id, StudentAchievement.shared_with_parents.is_(True))
            .order_by(StudentAchievement.status.desc(), StudentAchievement.achieved_on.desc().nullsfirst(),
                      StudentAchievement.created_at.desc())
        ).scalars()
    )


def _staff_project(db: Session, user: User, project_id: int):
    from app.models.project import Project
    from app.models.subject import ClassSubject

    p = db.get(Project, project_id)
    if not p or p.school_id != user.school_id:
        raise _404("Project")
    if user.role == UserRole.teacher and p.created_by_user_id != user.id:
        cs = db.get(ClassSubject, p.class_subject_id)
        if not cs or cs.teacher_user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your project")
    return p


def milestone_read(m: ProjectMilestone) -> dict:
    return {"id": m.id, "project_id": m.project_id, "title": m.title, "due_on": m.due_on, "position": m.position}


def project_milestones(db: Session, project_ids: list[int]) -> list[ProjectMilestone]:
    if not project_ids:
        return []
    return list(
        db.execute(
            select(ProjectMilestone)
            .where(ProjectMilestone.project_id.in_(project_ids))
            .order_by(ProjectMilestone.project_id, ProjectMilestone.position, ProjectMilestone.due_on.nullslast(), ProjectMilestone.id)
        ).scalars()
    )


def staff_milestones(db: Session, user: User, project_id: int) -> list[ProjectMilestone]:
    p = _staff_project(db, user, project_id)
    return project_milestones(db, [p.id])


def add_milestone(db: Session, user: User, project_id: int, data) -> ProjectMilestone:
    p = _staff_project(db, user, project_id)
    if data.due_on and data.due_on > p.deadline:
        raise _400("A milestone can't be due after the project deadline")
    m = ProjectMilestone(
        tenant_id=p.tenant_id, school_id=p.school_id, project_id=p.id,
        title=data.title.strip(), due_on=data.due_on, position=data.position,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def delete_milestone(db: Session, user: User, project_id: int, milestone_id: int) -> None:
    p = _staff_project(db, user, project_id)
    m = db.get(ProjectMilestone, milestone_id)
    if not m or m.project_id != p.id:
        raise _404("Milestone")
    db.delete(m)
    db.commit()


def parent_milestones(db: Session, parent_id: int, student_id: int) -> list[ProjectMilestone]:
    from app.services import project_service

    projects = project_service.list_for_child(db, parent_id, student_id)
    return project_milestones(db, [p.id for p in projects])


def parent_activities(db: Session, parent_id: int, student_id: int) -> list[dict]:
    from app.models.academics_ops import Activity, ActivityMember

    st = require_linked_child(db, parent_id, student_id)
    rows = db.execute(
        select(ActivityMember, Activity)
        .join(Activity, ActivityMember.activity_id == Activity.id)
        .where(ActivityMember.student_id == st.id)
        .order_by(ActivityMember.left_on.is_not(None), Activity.name)
    ).all()
    return [
        {
            "activity_id": a.id,
            "name": a.name,
            "kind": a.kind.value if hasattr(a.kind, "value") else a.kind,
            "description": a.description,
            "day_of_week": a.day_of_week,
            "start_time": a.start_time,
            "end_time": a.end_time,
            "venue": a.venue,
            "in_charge_name": _name(db, a.in_charge_user_id),
            "role": m.role,
            "joined_on": m.joined_on,
            "left_on": m.left_on,
        }
        for m, a in rows
    ]


# =====================================================================
# Weekly progress by subject
# =====================================================================


def weekly_subjects(db: Session, parent_id: int, student_id: int, report_id: int) -> list[dict]:
    from app.models.exam import ExamSubject
    from app.models.homework import Homework, HomeworkSubmission
    from app.models.mark import Mark
    from app.models.subject import ClassSubject, Subject
    from app.models.syllabus import SyllabusChapter, SyllabusTopic, TopicCoverage
    from app.models.weekly_report import WeeklyReport

    st = require_linked_child(db, parent_id, student_id)
    r = db.get(WeeklyReport, report_id)
    if not r or r.student_id != st.id or r.shared_at is None:
        raise _404("Weekly report")
    sec = db.get(Section, st.section_id)
    if not sec:
        return []
    ws, we = r.week_start, r.week_start + timedelta(days=6)
    subjects = db.execute(
        select(ClassSubject.id, Subject.name)
        .join(Subject, ClassSubject.subject_id == Subject.id)
        .where(ClassSubject.class_id == sec.class_id)
        .order_by(Subject.name)
    ).all()
    out = []
    for cs_id, name in subjects:
        topics = list(
            db.execute(
                select(SyllabusTopic.title)
                .join(TopicCoverage, TopicCoverage.topic_id == SyllabusTopic.id)
                .join(SyllabusChapter, SyllabusTopic.chapter_id == SyllabusChapter.id)
                .where(
                    SyllabusChapter.class_subject_id == cs_id,
                    TopicCoverage.section_id == sec.id,
                    TopicCoverage.covered_on >= ws,
                    TopicCoverage.covered_on <= we,
                )
                .order_by(TopicCoverage.covered_on, SyllabusTopic.sequence)
            ).scalars()
        )
        hw_total = db.execute(
            select(func.count(Homework.id)).where(
                Homework.class_subject_id == cs_id, Homework.due_date >= ws, Homework.due_date <= we
            )
        ).scalar_one()
        hw_done = db.execute(
            select(func.count(HomeworkSubmission.id))
            .join(Homework, HomeworkSubmission.homework_id == Homework.id)
            .where(
                Homework.class_subject_id == cs_id,
                Homework.due_date >= ws,
                Homework.due_date <= we,
                HomeworkSubmission.student_id == st.id,
            )
        ).scalar_one()
        marks = db.execute(
            select(ExamSubject.max_marks, Mark.marks_obtained)
            .join(ExamSubject, Mark.exam_subject_id == ExamSubject.id)
            .where(
                Mark.student_id == st.id,
                ExamSubject.class_subject_id == cs_id,
                ExamSubject.exam_date >= ws,
                ExamSubject.exam_date <= we,
                Mark.marks_obtained.is_not(None),
            )
        ).all()
        pcts = [float(m) / float(x) * 100 for x, m in marks if x]
        marks_pct = round(sum(pcts) / len(pcts), 1) if pcts else None
        # A subject needs practice when homework was missed or a test went
        # under half marks; otherwise it is on track.
        if not topics and not hw_total and marks_pct is None:
            label = "no_activity"
        elif hw_done < hw_total or (marks_pct is not None and marks_pct < 50):
            label = "practice"
        else:
            label = "on_track"
        out.append(
            {
                "subject_name": name,
                "topics": topics,
                "homework_total": int(hw_total),
                "homework_submitted": int(hw_done),
                "marks_pct": marks_pct,
                "label": label,
            }
        )
    return out


# =====================================================================
# Meals
# =====================================================================


def canteen_menu(db: Session, school_id: int) -> list[CanteenMenu]:
    return list(
        db.execute(
            select(CanteenMenu).where(CanteenMenu.school_id == school_id).order_by(CanteenMenu.day_of_week, CanteenMenu.meal)
        ).scalars()
    )


def set_canteen_menu(db: Session, user: User, data) -> list[CanteenMenu]:
    seen = set()
    for s in data.slots:
        key = (s.day_of_week, s.meal)
        if key in seen:
            raise _400("Each day and meal can appear once")
        seen.add(key)
    db.execute(CanteenMenu.__table__.delete().where(CanteenMenu.school_id == user.school_id))
    for s in data.slots:
        db.add(
            CanteenMenu(
                tenant_id=user.tenant_id, school_id=user.school_id,
                day_of_week=s.day_of_week, meal=s.meal, items=s.items.strip(),
            )
        )
    db.commit()
    return canteen_menu(db, user.school_id)


def child_meal_menu(db: Session, parent_id: int, student_id: int) -> dict:
    from app.services import hostel_service

    st = require_linked_child(db, parent_id, student_id)
    stay = hostel_service.child_hostel(db, parent_id, student_id)
    if stay:
        week = [
            {"day_of_week": m.day_of_week, "meal": m.meal.value, "items": m.items}
            for m in hostel_service.get_menu(db, stay["hostel_id"])
        ]
        return {"source": "hostel", "name": stay["hostel_name"], "week": week}
    rows = canteen_menu(db, st.school_id)
    if rows:
        return {
            "source": "canteen",
            "name": "School canteen",
            "week": [{"day_of_week": m.day_of_week, "meal": m.meal, "items": m.items} for m in rows],
        }
    return {"source": "none", "name": None, "week": []}


# =====================================================================
# Transport
# =====================================================================


def child_route_stops(db: Session, parent_id: int, student_id: int) -> list[dict]:
    from app.models.transport import TransportStop

    st = require_linked_child(db, parent_id, student_id)
    cur = _current_assignment(db, st.id)
    if not cur:
        return []
    a, route, mine = cur
    stops = db.execute(
        select(TransportStop).where(TransportStop.route_id == route.id).order_by(TransportStop.sequence)
    ).scalars()
    return [
        {
            "id": s.id, "name": s.name, "sequence": s.sequence,
            "pickup_time": s.pickup_time, "drop_time": s.drop_time, "is_mine": s.id == mine.id,
        }
        for s in stops
    ]


def stop_options(db: Session, parent_id: int, student_id: int) -> list[dict]:
    from app.models.transport import TransportRoute, TransportStop

    st = require_linked_child(db, parent_id, student_id)
    rows = db.execute(
        select(TransportStop, TransportRoute)
        .join(TransportRoute, TransportStop.route_id == TransportRoute.id)
        .where(TransportRoute.school_id == st.school_id, TransportRoute.is_active.is_(True))
        .order_by(TransportRoute.name, TransportStop.sequence)
    ).all()
    return [
        {
            "stop_id": s.id, "stop_name": s.name, "route_id": r.id, "route_name": r.name,
            "pickup_time": s.pickup_time, "drop_time": s.drop_time,
            "monthly_fee": s.monthly_fee if s.monthly_fee is not None else getattr(r, "monthly_fee", None),
        }
        for s, r in rows
    ]


# =====================================================================
# Fees: academic years, counter receipts
# =====================================================================


def parent_academic_years(db: Session, parent: User) -> list[AcademicYear]:
    if parent.school_id is None:
        return []
    return list(
        db.execute(
            select(AcademicYear).where(AcademicYear.school_id == parent.school_id).order_by(AcademicYear.start_date.desc())
        ).scalars()
    )


def year_range(db: Session, school_id: int, academic_year_id: Optional[int]) -> Optional[tuple[date, date]]:
    if not academic_year_id:
        return None
    y = db.get(AcademicYear, academic_year_id)
    if not y or y.school_id != school_id:
        raise _404("Academic year")
    return y.start_date, y.end_date


def counter_receipts(db: Session, parent_id: int, student_id: int, academic_year_id: Optional[int] = None) -> list[dict]:
    from app.models.accounts import FeeCollection
    from app.models.fee import FeeHead, StudentFee

    st = require_linked_child(db, parent_id, student_id)
    stmt = (
        select(FeeCollection, StudentFee, FeeHead)
        .join(StudentFee, FeeCollection.student_fee_id == StudentFee.id)
        .join(FeeHead, StudentFee.fee_head_id == FeeHead.id)
        .where(FeeCollection.student_id == st.id, FeeCollection.mode != MoneyMode.online)
    )
    rng = year_range(db, st.school_id, academic_year_id)
    if rng:
        stmt = stmt.where(FeeCollection.collected_on >= rng[0], FeeCollection.collected_on <= rng[1])
    rows = db.execute(stmt.order_by(FeeCollection.collected_on.desc(), FeeCollection.id.desc())).all()
    return [
        {
            "id": c.id, "receipt_no": c.receipt_no, "student_id": c.student_id,
            "fee_head_name": h.name, "period": sf.period, "amount": c.amount,
            "mode": c.mode.value, "reference": c.reference, "collected_on": c.collected_on,
        }
        for c, sf, h in rows
    ]


def counter_receipt_pdf(db: Session, parent_id: int, student_id: int, collection_id: int) -> tuple[bytes, str]:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    rows = [r for r in counter_receipts(db, parent_id, student_id) if r["id"] == collection_id]
    if not rows:
        raise _404("Receipt")
    r = rows[0]
    st = db.get(Student, student_id)
    school = db.get(School, st.school_id)
    styles = getSampleStyleSheet()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A5, leftMargin=1.2 * cm, rightMargin=1.2 * cm, topMargin=1.2 * cm)
    els = [
        Paragraph(f"<b>{school.name if school else ''}</b>", styles["Title"]),
        Paragraph((school.address or "") if school else "", styles["Normal"]),
        Spacer(1, 0.3 * cm),
        Paragraph("<b>FEE RECEIPT</b>", styles["Heading2"]),
    ]
    meta = [
        ["Receipt no.", r["receipt_no"]],
        ["Date", r["collected_on"].strftime("%d %b %Y")],
        ["Student", f"{st.full_name} ({st.admission_no})"],
        ["Class", section_label(db, st.section_id) or ""],
        ["Mode", r["mode"].replace("_", " ").title()],
        ["Reference", r["reference"] or ""],
    ]
    t = Table(meta, colWidths=[3.5 * cm, 8.5 * cm])
    t.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("TEXTCOLOR", (0, 0), (0, -1), colors.grey)]))
    els += [t, Spacer(1, 0.4 * cm)]
    lines = Table(
        [["Fee", "Period", "Amount (Rs.)"], [r["fee_head_name"] or "", r["period"] or "", f"{Decimal(r['amount']):,.2f}"],
         ["", "Total", f"{Decimal(r['amount']):,.2f}"]],
        colWidths=[6 * cm, 3 * cm, 3 * cm],
    )
    lines.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F9FAFB")),
                ("ALIGN", (2, 0), (2, -1), "RIGHT"),
                ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.black),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -2), 0.25, colors.HexColor("#E5E7EB")),
            ]
        )
    )
    els += [lines, Spacer(1, 0.6 * cm), Paragraph("Paid at the school office. This is a computer-generated receipt.", styles["Italic"])]
    doc.build(els)
    return buf.getvalue(), f"{r['receipt_no']}.pdf"

