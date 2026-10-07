"""What families hear from the school bus: a notice when their child boards
or is dropped (or wasn't at the stop for a pickup), and messages to everyone
on a route or a trip (running late, breakdown, cancelled). Notices go to the
parent app (core.notify); the boarding ones can be switched off per school.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import notify
from app.core.enums import BoardingStatus, NotificationCategory, TripDirection
from app.models.student import Student
from app.models.tenant import School
from app.models.transport import TransportAssignment, TransportRoute, TransportSettings, Trip
from app.models.user import User

LINK = "/parent/trip-tracking"


def settings(db: Session, tenant_id: int, school_id: int) -> TransportSettings:
    s = db.execute(select(TransportSettings).where(TransportSettings.school_id == school_id)).scalar_one_or_none()
    if s is None:
        s = TransportSettings(tenant_id=tenant_id, school_id=school_id, boarding_notices=True)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def update_settings(db: Session, user: User, boarding_notices: bool) -> TransportSettings:
    s = settings(db, user.tenant_id, user.school_id)
    s.boarding_notices = boarding_notices
    db.commit()
    db.refresh(s)
    return s


def _clock(db: Session, school_id: int, at: datetime) -> str:
    school = db.get(School, school_id)
    try:
        tz = ZoneInfo(school.timezone or "Asia/Kolkata") if school else ZoneInfo("Asia/Kolkata")
    except Exception:
        tz = ZoneInfo("Asia/Kolkata")
    return at.astimezone(tz).strftime("%I:%M %p").lstrip("0")


def boarding_changed(db: Session, trip: Trip, changes: list[tuple[int, BoardingStatus, Optional[str]]]) -> int:
    """Tell each family whose child's mark changed: boarded, dropped, or not
    at the stop for a pickup. `changes` is (student, new status, stop name).
    Caller commits."""
    if not changes:
        return 0
    s = settings(db, trip.tenant_id, trip.school_id)
    if not s.boarding_notices:
        return 0
    route = db.get(TransportRoute, trip.route_id)
    at = _clock(db, trip.school_id, datetime.now(timezone.utc))
    where = f"Route {route.code}" if route else "the school bus"
    sent = 0
    for student_id, new, stop in changes:
        st = db.get(Student, student_id)
        if not st:
            continue
        first = st.full_name.split()[0]
        at_stop = f", stop: {stop}" if stop else ""
        if new == BoardingStatus.boarded:
            title, body = f"{first} is on the bus", f"{st.full_name} boarded the bus at {at} ({where}{at_stop})."
        elif new == BoardingStatus.dropped:
            title, body = f"{first} has been dropped", f"{st.full_name} was dropped at {at} ({where}{at_stop})."
        elif trip.direction == TripDirection.pickup:
            title, body = f"{first} wasn't at the stop", f"The bus didn't pick up {st.full_name} this morning ({where}{at_stop}). Call the school if this is unexpected."
        else:
            continue  # absent on a drop trip: the child didn't take the bus home; the school knows already
        sent += 1 if notify.student_parents(db, st, title, body, category=NotificationCategory.general, link=LINK) else 0
    return sent


def _route(db: Session, school_id: int, route_id: int) -> TransportRoute:
    r = db.get(TransportRoute, route_id)
    if not r or r.school_id != school_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")
    return r


def message(db: Session, user: User, *, route_id: Optional[int] = None, trip_id: Optional[int] = None, text: str) -> dict:
    """One notice to every family with a child on the route (all of it), or on
    one trip (that direction, that day)."""
    from app.services import transport_service

    text = (text or "").strip()
    if len(text) < 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Write the message")
    if trip_id:
        trip = transport_service.get_trip(db, trip_id, user.school_id)
        route = _route(db, user.school_id, trip.route_id)
        student_ids = [s["student_id"] for s in transport_service._trip_students(db, trip)]
        what = f"{'Morning' if trip.direction == TripDirection.pickup else 'Afternoon'} bus, Route {route.code}"
    else:
        route = _route(db, user.school_id, route_id)
        today = transport_service.date.today()
        student_ids = list(db.execute(
            select(TransportAssignment.student_id).where(
                TransportAssignment.route_id == route.id, *transport_service._active_assignment_filter(today))
        ).scalars())
        what = f"School bus, Route {route.code}"
    families = 0
    for sid in dict.fromkeys(student_ids):
        st = db.get(Student, sid)
        if st and st.is_active:
            families += 1 if notify.student_parents(db, st, what, text, category=NotificationCategory.general, link=LINK) else 0
    db.commit()
    return {"students": len(set(student_ids)), "families_told": families}
