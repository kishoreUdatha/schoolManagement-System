"""Locking and reopening the attendance register, and the visitor master.

A register locks once the school is happy with it; after that even a class
teacher inside the edit window can't change it. The office (or anyone with
attendance.correct) reopens it with a reason, which is kept on the record."""
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.enums import AttendanceStatus, RegisterStatus, UserRole, VisitStatus
from app.core.scoping import school_today, section_labels
from app.models.academic import Section
from app.models.attendance import StudentAttendance
from app.models.register import AttendanceSession, Visitor
from app.models.user import User
from app.models.visitor import Visit
from app.schemas.register import VisitorIn

OFFICE = (UserRole.school_admin, UserRole.principal)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _may_lock(db: Session, user: User) -> bool:
    if user.role in OFFICE:
        return True
    from app.services import rbac_service

    return rbac_service.has_permission(db, user, "attendance.correct")


def _names(db: Session, ids) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all())


# ---------- sessions ----------


def get_session(db: Session, school_id: int, section_id: int, on: date) -> Optional[AttendanceSession]:
    return db.execute(
        select(AttendanceSession).where(
            AttendanceSession.school_id == school_id, AttendanceSession.section_id == section_id,
            AttendanceSession.date == on,
        )
    ).scalar_one_or_none()


def is_locked(db: Session, school_id: int, section_id: int, on: date) -> bool:
    s = get_session(db, school_id, section_id, on)
    return bool(s and s.status == RegisterStatus.locked)


def touch(db: Session, tenant_id: int, school_id: int, section_id: int, on: date, user_id: int) -> AttendanceSession:
    """Record that the register was marked. Called when attendance is saved."""
    s = get_session(db, school_id, section_id, on)
    if not s:
        s = AttendanceSession(tenant_id=tenant_id, school_id=school_id, section_id=section_id, date=on)
        db.add(s)
    s.marked_by_user_id, s.marked_at = user_id, _now()
    return s


def _counts(db: Session, section_id: int, on: date) -> tuple[int, int]:
    rows = db.execute(
        select(StudentAttendance.status, func.count())
        .where(StudentAttendance.section_id == section_id, StudentAttendance.date == on)
        .group_by(StudentAttendance.status)
    ).all()
    present = sum(n for st, n in rows if st != AttendanceStatus.absent)
    absent = sum(n for st, n in rows if st == AttendanceStatus.absent)
    return present, absent


def lock(db: Session, user: User, section_id: int, on: date) -> AttendanceSession:
    if not _may_lock(db, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the office can lock a register")
    sec = db.get(Section, section_id)
    if not sec or sec.school_id != user.school_id:
        raise _404("Section")
    if on > school_today(db, user.school_id):
        raise _400("That day hasn't happened yet")
    marked = db.execute(
        select(func.count()).select_from(StudentAttendance)
        .where(StudentAttendance.section_id == section_id, StudentAttendance.date == on)
    ).scalar_one()
    if not marked:
        raise _400("Nothing has been marked for that day")
    s = get_session(db, user.school_id, section_id, on)
    if not s:
        s = AttendanceSession(tenant_id=user.tenant_id, school_id=user.school_id, section_id=section_id, date=on)
        db.add(s)
    if s.status == RegisterStatus.locked:
        raise _400("That register is already locked")
    s.status, s.locked_by_user_id, s.locked_at = RegisterStatus.locked, user.id, _now()
    s.present, s.absent = _counts(db, section_id, on)
    db.commit()
    db.refresh(s)
    return s


def reopen(db: Session, user: User, section_id: int, on: date, reason: str) -> AttendanceSession:
    if not _may_lock(db, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the office can reopen a register")
    if not (reason or "").strip():
        raise _400("Say why the register is being reopened")
    s = get_session(db, user.school_id, section_id, on)
    if not s or s.status != RegisterStatus.locked:
        raise _400("That register isn't locked")
    s.status = RegisterStatus.open
    s.reopened_by_user_id, s.reopened_at, s.reopen_reason = user.id, _now(), reason.strip()
    db.commit()
    db.refresh(s)
    return s


def lock_day(db: Session, user: User, on: date) -> dict:
    """Lock every register that has been marked for a day."""
    if not _may_lock(db, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the office can lock registers")
    sections = list(db.execute(
        select(StudentAttendance.section_id).where(
            StudentAttendance.school_id == user.school_id, StudentAttendance.date == on
        ).distinct()
    ).scalars())
    locked = 0
    for sid in sections:
        s = get_session(db, user.school_id, sid, on)
        if s and s.status == RegisterStatus.locked:
            continue
        if not s:
            s = AttendanceSession(tenant_id=user.tenant_id, school_id=user.school_id, section_id=sid, date=on)
            db.add(s)
        s.status, s.locked_by_user_id, s.locked_at = RegisterStatus.locked, user.id, _now()
        s.present, s.absent = _counts(db, sid, on)
        locked += 1
    db.commit()
    return dict(date=on, sections=len(sections), locked=locked)


def day_overview(db: Session, school_id: int, on: date) -> list[dict]:
    """Every section, whether it was marked that day, and whether it's locked."""
    sections = list(db.execute(
        select(Section).where(Section.school_id == school_id).order_by(Section.class_id, Section.name)
    ).scalars())
    labels = section_labels(db, {s.id for s in sections})
    sessions = {
        s.section_id: s for s in db.execute(
            select(AttendanceSession).where(AttendanceSession.school_id == school_id, AttendanceSession.date == on)
        ).scalars()
    }
    marked = dict(db.execute(
        select(StudentAttendance.section_id, func.count())
        .where(StudentAttendance.school_id == school_id, StudentAttendance.date == on)
        .group_by(StudentAttendance.section_id)
    ).all())
    users = _names(db, {s.locked_by_user_id for s in sessions.values()} | {s.marked_by_user_id for s in sessions.values()}
                   | {s.reopened_by_user_id for s in sessions.values()})
    out = []
    for sec in sections:
        s = sessions.get(sec.id)
        present, absent = (s.present, s.absent) if s and s.status == RegisterStatus.locked else _counts(db, sec.id, on)
        out.append(dict(
            section_id=sec.id, section_label=labels.get(sec.id, sec.name), date=on,
            marked=marked.get(sec.id, 0) > 0, marked_count=marked.get(sec.id, 0),
            status=s.status if s else RegisterStatus.open,
            marked_by_name=users.get(s.marked_by_user_id) if s else None,
            locked_by_name=users.get(s.locked_by_user_id) if s else None,
            locked_at=s.locked_at if s else None,
            reopened_by_name=users.get(s.reopened_by_user_id) if s else None,
            reopen_reason=s.reopen_reason if s else None,
            present=present, absent=absent,
        ))
    return out


# ---------- visitor master ----------


def upsert_visitor(db: Session, tenant_id: int, school_id: int, *, full_name: str, phone: str,
                   company: Optional[str] = None, id_type: Optional[str] = None,
                   id_last4: Optional[str] = None) -> Visitor:
    """Find the visitor by phone, or add them. Refuses anyone barred."""
    phone = phone.strip()
    v = db.execute(
        select(Visitor).where(Visitor.school_id == school_id, Visitor.phone == phone)
    ).scalar_one_or_none()
    if v and v.is_blocked:
        raise _400(f"{v.full_name} is not allowed on site: {v.blocked_reason or 'no reason recorded'}")
    if not v:
        v = Visitor(tenant_id=tenant_id, school_id=school_id, full_name=full_name.strip(), phone=phone)
        db.add(v)
    v.full_name = full_name.strip() or v.full_name
    if company:
        v.company = company
    if id_type:
        v.id_type = id_type
    if id_last4:
        v.id_last4 = id_last4
    db.flush()
    return v


def get_visitor(db: Session, visitor_id: int, school_id: int) -> Visitor:
    v = db.get(Visitor, visitor_id)
    if not v or v.school_id != school_id:
        raise _404("Visitor")
    return v


def list_visitors(db: Session, school_id: int, search: Optional[str], blocked_only: bool) -> list[Visitor]:
    stmt = select(Visitor).where(Visitor.school_id == school_id)
    if blocked_only:
        stmt = stmt.where(Visitor.is_blocked.is_(True))
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(Visitor.full_name.ilike(like), Visitor.phone.ilike(like), Visitor.company.ilike(like)))
    return list(db.execute(stmt.order_by(Visitor.full_name).limit(300)).scalars())


def update_visitor(db: Session, user: User, visitor_id: int, data: VisitorIn) -> Visitor:
    v = get_visitor(db, visitor_id, user.school_id)
    clash = db.execute(
        select(Visitor.id).where(Visitor.school_id == v.school_id, Visitor.phone == data.phone.strip(), Visitor.id != v.id)
    ).first()
    if clash:
        raise _400("Another visitor already has that phone number")
    for k, val in data.model_dump().items():
        setattr(v, k, val)
    db.commit()
    db.refresh(v)
    return v


def set_blocked(db: Session, user: User, visitor_id: int, blocked: bool, reason: Optional[str]) -> Visitor:
    v = get_visitor(db, visitor_id, user.school_id)
    if blocked and not (reason or "").strip():
        raise _400("Say why this person isn't allowed on site")
    v.is_blocked = blocked
    v.blocked_reason = reason.strip() if blocked and reason else None
    v.blocked_by_user_id = user.id if blocked else None
    v.blocked_at = _now() if blocked else None
    db.commit()
    db.refresh(v)
    return v


def visitors_to_read(db: Session, items: list[Visitor]) -> list[dict]:
    if not items:
        return []
    ids = [v.id for v in items]
    counts = dict(db.execute(
        select(Visit.visitor_id, func.count()).where(Visit.visitor_id.in_(ids)).group_by(Visit.visitor_id)
    ).all())
    last = dict(db.execute(
        select(Visit.visitor_id, func.max(Visit.check_in_at)).where(Visit.visitor_id.in_(ids)).group_by(Visit.visitor_id)
    ).all())
    users = _names(db, {v.blocked_by_user_id for v in items})
    return [
        dict(id=v.id, full_name=v.full_name, phone=v.phone, email=v.email, company=v.company, id_type=v.id_type,
             id_last4=v.id_last4, notes=v.notes, is_blocked=v.is_blocked, blocked_reason=v.blocked_reason,
             blocked_by_name=users.get(v.blocked_by_user_id), blocked_at=v.blocked_at,
             visits=counts.get(v.id, 0), last_visit_at=last.get(v.id))
        for v in items
    ]


def visitor_history(db: Session, school_id: int, visitor_id: int, limit: int = 50) -> list[dict]:
    v = get_visitor(db, visitor_id, school_id)
    rows = list(db.execute(
        select(Visit).where(Visit.visitor_id == v.id).order_by(Visit.id.desc()).limit(limit)
    ).scalars())
    hosts = _names(db, {r.host_user_id for r in rows})
    return [
        dict(visit_id=r.id, pass_no=r.pass_no, purpose=r.purpose, purpose_detail=r.purpose_detail,
             host_name=hosts.get(r.host_user_id), status=r.status, expected_at=r.expected_at,
             check_in_at=r.check_in_at, check_out_at=r.check_out_at)
        for r in rows
    ]


def backfill_visitors(db: Session, school_id: int) -> int:
    """Create master records for visits recorded before this existed."""
    rows = list(db.execute(
        select(Visit).where(Visit.school_id == school_id, Visit.visitor_id.is_(None))
    ).scalars())
    made = 0
    for r in rows:
        existing = db.execute(
            select(Visitor).where(Visitor.school_id == school_id, Visitor.phone == r.phone)
        ).scalar_one_or_none()
        if not existing:
            existing = Visitor(tenant_id=r.tenant_id, school_id=school_id, full_name=r.visitor_name, phone=r.phone,
                               company=r.company, id_type=r.id_type, id_last4=r.id_last4)
            db.add(existing)
            db.flush()
            made += 1
        r.visitor_id = existing.id
    db.commit()
    return made
