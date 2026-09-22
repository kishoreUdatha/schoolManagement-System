"""Front desk: visitor register, early-pickup gate passes, security incidents."""
import secrets
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import notify
from app.core.enums import GatePassStatus, UserRole, VisitStatus
from app.core.scoping import get_school_student, require_linked_child, section_label
from app.services import foundation_service
from app.models.student import Student
from app.models.tenant import School
from app.models.user import User
from app.models.visitor import GatePass, SecurityIncident, StaffGateEntry, Visit
from app.schemas.visitor import (
    StaffGateEntryIn,
    GatePassDecision,
    GatePassIn,
    IncidentIn,
    IncidentUpdate,
    ParentGatePassIn,
    VisitIn,
    VisitUpdate,
)

# who may answer for a host who is busy
OFFICE = (UserRole.school_admin, UserRole.principal)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _school_today(db: Session, school_id: int) -> tuple[date, datetime, datetime]:
    """Today's date and its UTC bounds in the school's own timezone."""
    school = db.get(School, school_id)
    tz = ZoneInfo(school.timezone if school and school.timezone else "Asia/Kolkata")
    today = datetime.now(tz).date()
    start = datetime.combine(today, time.min, tzinfo=tz)
    return today, start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


def _local_hhmm(db: Session, school_id: int, at: datetime) -> str:
    school = db.get(School, school_id)
    tz = ZoneInfo(school.timezone if school and school.timezone else "Asia/Kolkata")
    return at.astimezone(tz).strftime("%I:%M %p").lstrip("0")


# --- Visits ---

def _check_refs(db: Session, school_id: int, data: VisitIn) -> None:
    if data.host_user_id is not None:
        u = db.get(User, data.host_user_id)
        if not u or u.school_id != school_id or u.role in (UserRole.parent, UserRole.student):
            raise _404("Staff member to meet")
    if data.student_id is not None:
        get_school_student(db, data.student_id, school_id)


def _issue_pass_no(db: Session, v: Visit) -> None:
    today, start, end = _school_today(db, v.school_id)
    n = db.execute(
        select(func.count(Visit.id)).where(
            Visit.school_id == v.school_id, Visit.check_in_at >= start, Visit.check_in_at < end, Visit.pass_no.is_not(None)
        )
    ).scalar_one()
    v.pass_no = f"V{today:%y%m%d}-{n + 1:03d}"


def _check_in(db: Session, v: Visit, actor_id: int) -> Visit:
    v.status = VisitStatus.checked_in
    v.check_in_at = datetime.now(timezone.utc)
    v.checked_in_by_user_id = actor_id
    for _ in range(3):  # two desks checking people in at the same second
        _issue_pass_no(db, v)
        try:
            with db.begin_nested():
                db.flush()
            break
        except IntegrityError:
            continue
    if v.host_user_id:
        notify.staff_users(
            db,
            tenant_id=v.tenant_id,
            school_id=v.school_id,
            user_ids=[v.host_user_id],
            title=f"Visitor at reception: {v.visitor_name}",
            body=f"{v.visitor_name}{f' ({v.company})' if v.company else ''} is here to see you. Pass {v.pass_no}.",
        )
    db.commit()
    db.refresh(v)
    return v


def create_visit(db: Session, tenant_id: int, school_id: int, actor_id: int, data: VisitIn) -> Visit:
    from app.services import register_service

    _check_refs(db, school_id, data)
    digits = "".join(ch for ch in (data.id_number or "") if ch.isalnum())
    master = register_service.upsert_visitor(
        db, tenant_id, school_id, full_name=data.visitor_name, phone=data.phone,
        company=data.company, id_type=data.id_type,
        id_last4=digits[-4:] if digits else None,
    )
    v = Visit(
        tenant_id=tenant_id,
        school_id=school_id,
        visitor_id=master.id,
        visitor_name=data.visitor_name.strip(),
        phone=data.phone.strip(),
        id_type=data.id_type,
        id_last4=digits[-4:] if digits else None,
        company=data.company,
        purpose=data.purpose,
        purpose_detail=data.purpose_detail,
        host_user_id=data.host_user_id,
        student_id=data.student_id,
        people_count=data.people_count,
        vehicle_no=data.vehicle_no.strip().upper() if data.vehicle_no else None,
        expected_at=data.expected_at,
        status=VisitStatus.expected if data.expected_at else VisitStatus.checked_in,
        registered_by_user_id=actor_id,
        notes=data.notes,
        valid_until=data.valid_until,
    )
    if data.valid_until and data.valid_until <= (data.expected_at or datetime.now(timezone.utc)):
        raise _400("The pass would expire before the visit starts")
    db.add(v)
    db.flush()
    if v.status == VisitStatus.checked_in:
        return _check_in(db, v, actor_id)
    db.commit()
    db.refresh(v)
    return v


def _visit(db: Session, visit_id: int, school_id: int) -> Visit:
    v = db.get(Visit, visit_id)
    if not v or v.school_id != school_id:
        raise _404("Visit")
    return v


def update_visit(db: Session, visit_id: int, school_id: int, data: VisitUpdate) -> Visit:
    """Correct a pre-registration before the visitor turns up — a time that
    moved, a different host, one more person in the car. Once they are through
    the gate the visit is a record of what happened, so it stops being editable.
    """
    v = _visit(db, visit_id, school_id)
    if v.status != VisitStatus.expected:
        raise _400(f"This visit is {v.status.value.replace('_', ' ')} — it can no longer be changed")
    fields = data.model_dump(exclude_unset=True)
    if fields.get("host_user_id") and fields["host_user_id"] != v.host_user_id:
        # a new host hasn't agreed to anything yet
        v.host_approved_at = None
        v.host_approved_by_user_id = None
    for k, value in fields.items():
        if k == "vehicle_no" and value:
            value = value.strip().upper()
        elif isinstance(value, str):
            value = value.strip()
        setattr(v, k, value)
    db.commit()
    db.refresh(v)
    return v


def host_decision(db: Session, visit_id: int, user: User, approved: bool, reason: Optional[str] = None) -> Visit:
    """The host confirming they are expecting someone, or saying they aren't.

    The desk can sign a visitor in either way — a parent at the gate shouldn't
    be turned away because a teacher is mid-lesson — but the gate can see
    whether the host has actually agreed, which is the point of asking.
    """
    v = _visit(db, visit_id, user.school_id)
    if v.status != VisitStatus.expected:
        raise _400("Only an expected visit is waiting on its host")
    if v.host_user_id and v.host_user_id != user.id and user.role not in OFFICE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the host or the office can answer for this visit",
        )
    if approved:
        v.host_approved_at = datetime.now(timezone.utc)
        v.host_approved_by_user_id = user.id
        v.host_declined_reason = None
    else:
        if not (reason or "").strip():
            raise _400("Say why they aren't being seen, so the desk can tell them")
        # Stays expected: the desk follows up (tells the visitor, then denies
        # or cancels). Denying here hid the visit from the desk's list.
        v.host_approved_at = None
        v.host_approved_by_user_id = None
        v.host_declined_reason = reason.strip()[:300]
    db.commit()
    db.refresh(v)
    return v


def check_in(db: Session, visit_id: int, school_id: int, actor_id: int) -> Visit:
    v = _visit(db, visit_id, school_id)
    if v.status != VisitStatus.expected:
        raise _400(f"Visitor is {v.status.value.replace('_', ' ')}")
    # A block made after the visit was booked still applies at the door.
    if v.visitor_id:
        from app.models.register import Visitor

        who = db.get(Visitor, v.visitor_id)
        if who and who.is_blocked:
            raise _400(f"{who.full_name} is not allowed on site: {who.blocked_reason or 'no reason recorded'}")
    return _check_in(db, v, actor_id)


def check_out(db: Session, visit_id: int, school_id: int, actor_id: Optional[int] = None,
              pass_returned: Optional[bool] = None) -> Visit:
    v = _visit(db, visit_id, school_id)
    if v.status != VisitStatus.checked_in:
        raise _400("Visitor isn't checked in")
    v.status = VisitStatus.checked_out
    v.check_out_at = datetime.now(timezone.utc)
    v.checked_out_by_user_id = actor_id
    v.pass_returned = pass_returned
    db.commit()
    db.refresh(v)
    return v


def close_visit(db: Session, visit_id: int, school_id: int, new_status: VisitStatus, note: Optional[str]) -> Visit:
    v = _visit(db, visit_id, school_id)
    if v.status != VisitStatus.expected:
        raise _400("Only expected visits can be denied or cancelled")
    v.status = new_status
    if note:
        v.notes = "; ".join(x for x in (v.notes, note) if x)[:500]
    db.commit()
    db.refresh(v)
    return v


def _user_name(db: Session, user_id: Optional[int]) -> Optional[str]:
    u = db.get(User, user_id) if user_id else None
    return u.full_name if u else None


# --- Staff through the gate ---

def add_staff_entry(db: Session, user: User, data: StaffGateEntryIn) -> StaffGateEntry:
    staff = db.get(User, data.user_id)
    if not staff or staff.school_id != user.school_id or staff.role in (UserRole.parent, UserRole.student):
        raise _404("Staff member")
    at = data.at or datetime.now(timezone.utc)
    if at > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise _400("That time is still to come")
    e = StaffGateEntry(tenant_id=user.tenant_id, school_id=user.school_id, user_id=staff.id,
                       direction=data.direction, at=at,
                       vehicle_no=data.vehicle_no.strip().upper() if data.vehicle_no else None,
                       note=(data.note or "").strip() or None, recorded_by_user_id=user.id)
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def list_staff_entries(db: Session, school_id: int, on: Optional[date] = None) -> list[StaffGateEntry]:
    today, start, end = _school_today(db, school_id)
    if on and on != today:
        start = start + timedelta(days=(on - today).days)
        end = start + timedelta(days=1)
    return list(db.execute(
        select(StaffGateEntry).where(StaffGateEntry.school_id == school_id,
                                     StaffGateEntry.at >= start, StaffGateEntry.at < end)
        .order_by(StaffGateEntry.at.desc())
    ).scalars())


def staff_entry_to_read(db: Session, e: StaffGateEntry) -> dict:
    staff = db.get(User, e.user_id)
    return {
        "id": e.id, "user_id": e.user_id, "staff_name": staff.full_name if staff else "",
        "role": staff.role.value if staff else None, "direction": e.direction, "at": e.at,
        "vehicle_no": e.vehicle_no, "note": e.note, "recorded_by_name": _user_name(db, e.recorded_by_user_id),
    }


def visit_to_read(db: Session, v: Visit) -> dict:
    host = db.get(User, v.host_user_id) if v.host_user_id else None
    student = db.get(Student, v.student_id) if v.student_id else None
    end = v.check_out_at or (datetime.now(timezone.utc) if v.status == VisitStatus.checked_in else None)
    return {
        **{k: getattr(v, k) for k in (
            "id", "visitor_name", "phone", "id_type", "id_last4", "company", "purpose", "purpose_detail",
            "host_user_id", "student_id", "people_count", "vehicle_no", "status", "expected_at",
            "check_in_at", "check_out_at", "pass_no", "notes",
            "host_approved_at", "host_declined_reason", "valid_until", "pass_returned",
        )},
        "checked_in_by_name": _user_name(db, v.checked_in_by_user_id),
        "checked_out_by_name": _user_name(db, v.checked_out_by_user_id),
        "host_name": host.full_name if host else None,
        "student_name": student.full_name if student else None,
        "minutes_inside": int((end - v.check_in_at).total_seconds() // 60) if end and v.check_in_at else None,
    }


def list_visits(db: Session, school_id: int, *, on: Optional[date] = None, inside_only: bool = False,
                q: Optional[str] = None) -> list[Visit]:
    stmt = select(Visit).where(Visit.school_id == school_id)
    if inside_only:
        stmt = stmt.where(Visit.status == VisitStatus.checked_in)
    else:
        today, start, end = _school_today(db, school_id)
        if on and on != today:
            start = start + timedelta(days=(on - today).days)
            end = start + timedelta(days=1)
        stmt = stmt.where(
            ((Visit.check_in_at >= start) & (Visit.check_in_at < end))
            | ((Visit.expected_at >= start) & (Visit.expected_at < end))
        )
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(Visit.visitor_name.ilike(like) | Visit.phone.ilike(like) | Visit.pass_no.ilike(like) | Visit.vehicle_no.ilike(like))
    return list(db.execute(stmt.order_by(Visit.check_in_at.desc().nulls_first(), Visit.expected_at)).scalars())


# --- Gate passes ---

def _new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _pass(db: Session, pass_id: int, school_id: int) -> GatePass:
    g = db.get(GatePass, pass_id)
    if not g or g.school_id != school_id:
        raise _404("Gate pass")
    return g


def _approved_notice(db: Session, g: GatePass, student: Student) -> None:
    when = g.leave_on.strftime("%d %b") + (f" at {g.leave_time}" if g.leave_time else "")
    notify.student_parents(
        db,
        student,
        f"Early pickup approved: {student.full_name}",
        f"{student.full_name} can leave on {when} with {g.pickup_name}. "
        f"Show code {g.code} at the gate.",
    )


def create_pass(db: Session, tenant_id: int, school_id: int, actor_id: int, data: GatePassIn) -> GatePass:
    student = get_school_student(db, data.student_id, school_id)
    today, _, _ = _school_today(db, school_id)
    if data.leave_on < today:
        raise _400("Date is in the past")
    g = GatePass(
        tenant_id=tenant_id,
        school_id=school_id,
        code=_new_code(),
        status=GatePassStatus.approved,  # created by the office = approved
        requested_by_user_id=actor_id,
        decided_by_user_id=actor_id,
        **data.model_dump(),
    )
    db.add(g)
    db.flush()
    _approved_notice(db, g, student)
    db.commit()
    db.refresh(g)
    return g


def parent_request(db: Session, parent: User, student_id: int, data: ParentGatePassIn) -> GatePass:
    student = require_linked_child(db, parent.id, student_id)
    today, _, _ = _school_today(db, student.school_id)
    if data.leave_on < today:
        raise _400("Date is in the past")
    open_ = db.execute(
        select(GatePass.id).where(
            GatePass.student_id == student.id,
            GatePass.leave_on == data.leave_on,
            GatePass.status.in_((GatePassStatus.requested, GatePassStatus.approved)),
        )
    ).first()
    if open_:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="There's already a pass for that day")
    g = GatePass(
        tenant_id=student.tenant_id,
        school_id=student.school_id,
        student_id=student.id,
        code=_new_code(),
        status=GatePassStatus.requested,
        requested_by_user_id=parent.id,
        **data.model_dump(),
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


def decide(db: Session, pass_id: int, school_id: int, actor_id: int, data: GatePassDecision) -> GatePass:
    g = _pass(db, pass_id, school_id)
    if g.status != GatePassStatus.requested:
        raise _400(f"Pass is already {g.status.value}")
    student = db.get(Student, g.student_id)
    g.decided_by_user_id = actor_id
    g.decision_note = data.note
    if data.approve:
        g.status = GatePassStatus.approved
        _approved_notice(db, g, student)
    else:
        if not (data.note or "").strip():
            raise _400("Give the parent a reason")
        g.status = GatePassStatus.rejected
        notify.student_parents(
            db, student, f"Early pickup not approved: {student.full_name}",
            f"Your request for {g.leave_on:%d %b} wasn't approved: {data.note}",
        )
    db.commit()
    db.refresh(g)
    return g


def verify_code(db: Session, school_id: int, code: str) -> GatePass:
    """Gate lookup: today's approved pass with this code."""
    today, _, _ = _school_today(db, school_id)
    g = db.execute(
        select(GatePass).where(
            GatePass.school_id == school_id,
            GatePass.code == code,
            GatePass.leave_on == today,
            GatePass.status.in_((GatePassStatus.approved, GatePassStatus.departed)),
        )
    ).scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No approved pass for today with that code")
    return g


def release(db: Session, pass_id: int, school_id: int, actor_id: int) -> GatePass:
    g = _pass(db, pass_id, school_id)
    today, _, _ = _school_today(db, school_id)
    if g.status != GatePassStatus.approved:
        raise _400(f"Pass is {g.status.value}")
    if g.leave_on != today:
        raise _400(f"This pass is for {g.leave_on:%d %b}")
    g.status = GatePassStatus.departed
    g.departed_at = datetime.now(timezone.utc)
    g.released_by_user_id = actor_id
    student = db.get(Student, g.student_id)
    notify.student_parents(
        db, student, f"{student.full_name} has left school",
        f"{student.full_name} left the school gate at {_local_hhmm(db, school_id, g.departed_at)} with {g.pickup_name}.",
    )
    db.commit()
    db.refresh(g)
    return g


def parent_cancel(db: Session, parent: User, student_id: int, pass_id: int) -> GatePass:
    require_linked_child(db, parent.id, student_id)
    g = db.get(GatePass, pass_id)
    if not g or g.student_id != student_id:
        raise _404("Gate pass")
    if g.status not in (GatePassStatus.requested, GatePassStatus.approved):
        raise _400(f"Pass is {g.status.value}")
    g.status = GatePassStatus.cancelled
    db.commit()
    db.refresh(g)
    return g


def pass_to_read(db: Session, g: GatePass, *, show_code: bool = True) -> dict:
    s = db.get(Student, g.student_id)
    req = db.get(User, g.requested_by_user_id) if g.requested_by_user_id else None
    return {
        **{k: getattr(g, k) for k in (
            "id", "student_id", "leave_on", "leave_time", "reason", "pickup_name", "pickup_relation",
            "pickup_phone", "status", "decision_note", "departed_at", "created_at",
        )},
        "code": g.code if show_code else None,
        "student_name": s.full_name if s else "",
        "section_label": section_label(db, s.section_id) if s else None,
        "requested_by_name": req.full_name if req else None,
        "requested_by_parent": bool(req and req.role == UserRole.parent),
        "pickup_listed": foundation_service.pickup_allowed(db, g.student_id, g.pickup_name) is not None,
    }


def list_passes(db: Session, school_id: int, *, on: Optional[date] = None, pending_only: bool = False) -> list[GatePass]:
    stmt = select(GatePass).where(GatePass.school_id == school_id)
    if pending_only:
        stmt = stmt.where(GatePass.status == GatePassStatus.requested)
    else:
        stmt = stmt.where(GatePass.leave_on == (on or _school_today(db, school_id)[0]))
    return list(db.execute(stmt.order_by(GatePass.leave_on, GatePass.leave_time.nulls_last())).scalars())


def parent_passes(db: Session, parent_user_id: int, student_id: int) -> list[GatePass]:
    require_linked_child(db, parent_user_id, student_id)
    return list(
        db.execute(
            select(GatePass).where(GatePass.student_id == student_id).order_by(GatePass.leave_on.desc()).limit(30)
        ).scalars()
    )


# --- Incidents ---

def create_incident(db: Session, tenant_id: int, school_id: int, actor_id: int, data: IncidentIn) -> SecurityIncident:
    i = SecurityIncident(tenant_id=tenant_id, school_id=school_id, reported_by_user_id=actor_id, **data.model_dump())
    db.add(i)
    db.commit()
    db.refresh(i)
    return i


def update_incident(db: Session, incident_id: int, school_id: int, data: IncidentUpdate) -> SecurityIncident:
    i = db.get(SecurityIncident, incident_id)
    if not i or i.school_id != school_id:
        raise _404("Incident")
    for k, v in data.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(i, k, v)
    db.commit()
    db.refresh(i)
    return i


def list_incidents(db: Session, school_id: int, *, open_only: bool = False) -> list[SecurityIncident]:
    stmt = select(SecurityIncident).where(SecurityIncident.school_id == school_id)
    if open_only:
        stmt = stmt.where(SecurityIncident.is_closed.is_(False))
    return list(db.execute(stmt.order_by(SecurityIncident.occurred_at.desc()).limit(200)).scalars())


def incident_to_read(db: Session, i: SecurityIncident) -> dict:
    who = db.get(User, i.reported_by_user_id) if i.reported_by_user_id else None
    return {
        **{k: getattr(i, k) for k in (
            "id", "occurred_at", "location", "category", "severity", "description", "action_taken", "is_closed", "created_at",
        )},
        "reported_by_name": who.full_name if who else None,
    }


def dashboard(db: Session, school_id: int) -> dict:
    today, start, end = _school_today(db, school_id)
    return {
        "inside_now": db.execute(
            select(func.count(Visit.id)).where(Visit.school_id == school_id, Visit.status == VisitStatus.checked_in)
        ).scalar_one(),
        "visitors_today": db.execute(
            select(func.count(Visit.id)).where(Visit.school_id == school_id, Visit.check_in_at >= start, Visit.check_in_at < end)
        ).scalar_one(),
        "expected_today": db.execute(
            select(func.count(Visit.id)).where(
                Visit.school_id == school_id, Visit.status == VisitStatus.expected,
                Visit.expected_at >= start, Visit.expected_at < end,
            )
        ).scalar_one(),
        "gate_passes_today": db.execute(
            select(func.count(GatePass.id)).where(
                GatePass.school_id == school_id, GatePass.leave_on == today,
                GatePass.status.in_((GatePassStatus.approved, GatePassStatus.departed)),
            )
        ).scalar_one(),
        "gate_passes_pending": db.execute(
            select(func.count(GatePass.id)).where(GatePass.school_id == school_id, GatePass.status == GatePassStatus.requested)
        ).scalar_one(),
        "open_incidents": db.execute(
            select(func.count(SecurityIncident.id)).where(SecurityIncident.school_id == school_id, SecurityIncident.is_closed.is_(False))
        ).scalar_one(),
    }
