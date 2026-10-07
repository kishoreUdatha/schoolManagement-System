"""The front office's own registers: latecomers recorded at the gate, and the
post and courier register (letters and parcels in and out)."""
from __future__ import annotations

from datetime import datetime, time, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import notify
from app.core.enums import AttendanceStatus, NotificationCategory
from app.core.scoping import get_school_student, school_today
from app.models.attendance import StudentAttendance
from app.models.front_office import PostItem
from app.models.tenant import School
from app.models.user import User


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _tz(db: Session, school_id: int) -> ZoneInfo:
    s = db.get(School, school_id)
    try:
        return ZoneInfo(s.timezone or "Asia/Kolkata") if s else ZoneInfo("Asia/Kolkata")
    except Exception:
        return ZoneInfo("Asia/Kolkata")


# ---------- late arrivals at the gate ----------


def late_arrival(db: Session, user: User, student_id: int, arrived_at: Optional[time], reason: Optional[str]) -> dict:
    """A child coming in late today: marked late on today's register (made
    if the class hasn't been marked yet, so the teacher sees it), with the
    time, and the family told."""
    st = get_school_student(db, student_id, user.school_id)
    if not st.is_active:
        raise _400("That student has left")
    today = school_today(db, user.school_id)
    now = datetime.now(_tz(db, user.school_id))
    at = arrived_at or now.time().replace(second=0, microsecond=0)
    row = db.execute(select(StudentAttendance).where(StudentAttendance.student_id == st.id, StudentAttendance.date == today)).scalar_one_or_none()
    if row is None:
        row = StudentAttendance(tenant_id=st.tenant_id, school_id=st.school_id, student_id=st.id, section_id=st.section_id,
                                date=today, status=AttendanceStatus.late, marked_by_user_id=user.id)
        db.add(row)
    elif row.status in (AttendanceStatus.present, AttendanceStatus.absent):
        row.status = AttendanceStatus.late
    row.arrived_at = at
    if (reason or "").strip():
        row.remark = f"Late: {reason.strip()}"[:300]
    row.times_recorded_by_user_id = user.id
    db.flush()
    notify.student_parents(
        db, st, f"{st.full_name.split()[0]} reached school late",
        f"{st.full_name} reached school at {at.strftime('%I:%M %p').lstrip('0')} today" + (f" ({reason.strip()})" if (reason or "").strip() else "") + ".",
        category=NotificationCategory.attendance)
    db.commit()
    return {"student_id": st.id, "student_name": st.full_name, "date": today, "arrived_at": at, "status": row.status.value}


def late_today(db: Session, school_id: int) -> list[dict]:
    from app.services import attendance_ops_service

    today = school_today(db, school_id)
    data = attendance_ops_service.late_and_early(db, school_id, frm=today, to=today)
    rows = data["rows"] if isinstance(data, dict) and "rows" in data else data
    return [r for r in rows if r.get("arrived_at")]


# ---------- post and courier register ----------


def _post(db: Session, school_id: int, post_id: int) -> PostItem:
    p = db.get(PostItem, post_id)
    if not p or p.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post item not found")
    return p


def add_post(db: Session, user: User, data: dict) -> PostItem:
    direction = data["direction"]
    if direction not in ("in", "out"):
        raise _400("In or out")
    for_user_id = data.get("for_user_id")
    if for_user_id:
        u = db.get(User, for_user_id)
        if not u or u.school_id != user.school_id:
            raise _400("Choose a member of staff from this school")
    if not (data.get("party") or "").strip():
        raise _400("Say who it is from" if direction == "in" else "Say who it is going to")
    p = PostItem(tenant_id=user.tenant_id, school_id=user.school_id, direction=direction, kind=data.get("kind") or "letter",
                 party=data["party"].strip()[:160], for_user_id=for_user_id, for_text=(data.get("for_text") or "").strip()[:160] or None,
                 courier=(data.get("courier") or "").strip()[:80] or None, tracking_no=(data.get("tracking_no") or "").strip()[:80] or None,
                 note=(data.get("note") or "").strip()[:300] or None, logged_at=datetime.now(timezone.utc), logged_by_user_id=user.id)
    db.add(p)
    db.flush()
    if direction == "in" and for_user_id:
        what = {"letter": "A letter", "parcel": "A parcel", "document": "A document"}.get(p.kind, "Post")
        notify.staff_users(db, tenant_id=user.tenant_id, school_id=user.school_id, user_ids=[for_user_id],
                           title=f"{what} for you at reception", body=f"From {p.party}" + (f" by {p.courier}" if p.courier else "") + ". Please collect it from the front desk.")
    db.commit()
    db.refresh(p)
    return p


def hand_over(db: Session, user: User, post_id: int, to_name: Optional[str]) -> PostItem:
    p = _post(db, user.school_id, post_id)
    if p.handed_at:
        raise _400("Already handed over" if p.direction == "in" else "Already sent")
    p.handed_at = datetime.now(timezone.utc)
    p.handed_to = (to_name or "").strip()[:120] or None
    p.handed_by_user_id = user.id
    db.commit()
    db.refresh(p)
    return p


def list_post(db: Session, school_id: int, *, open_only: bool, direction: Optional[str]) -> list[dict]:
    q = select(PostItem).where(PostItem.school_id == school_id)
    if open_only:
        q = q.where(PostItem.handed_at.is_(None))
    if direction:
        q = q.where(PostItem.direction == direction)
    rows = db.execute(q.order_by(PostItem.logged_at.desc()).limit(300)).scalars().all()
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_({p.for_user_id for p in rows if p.for_user_id} or {-1}))).all())
    return [{"id": p.id, "direction": p.direction, "kind": p.kind, "party": p.party,
             "for_name": names.get(p.for_user_id) or p.for_text, "courier": p.courier, "tracking_no": p.tracking_no,
             "note": p.note, "logged_at": p.logged_at, "handed_at": p.handed_at, "handed_to": p.handed_to} for p in rows]
