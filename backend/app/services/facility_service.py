"""Rooms, labs and lab bookings.

A lab can only be booked once per period, and a class can only be in one lab
at a time. Teachers book their own periods; the office can book for anyone and
cancel anything."""
from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import notify
from app.core.enums import BookingStatus, RoomKind, UserRole
from app.core.scoping import school_today, section_labels
from app.models.academic import Section
from app.models.facility import Lab, LabBooking, Room
from app.models.holiday import Holiday
from app.models.rbac import Branch
from app.models.subject import ClassSubject, Subject
from app.models.timetable import Period
from app.models.user import User
from app.schemas.facility import BookingIn, LabIn, RoomIn

OFFICE = (UserRole.school_admin, UserRole.principal)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _names(db: Session, ids) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all())


# ---------- rooms ----------


def get_room(db: Session, room_id: int, school_id: int) -> Room:
    r = db.get(Room, room_id)
    if not r or r.school_id != school_id:
        raise _404("Room")
    return r


def list_rooms(db: Session, school_id: int, kind: Optional[RoomKind], branch_id: Optional[int]) -> list[Room]:
    stmt = select(Room).where(Room.school_id == school_id)
    if kind:
        stmt = stmt.where(Room.kind == kind)
    if branch_id:
        stmt = stmt.where(Room.branch_id == branch_id)
    return list(db.execute(stmt.order_by(Room.building, Room.name)).scalars())


def _check_room(db: Session, school_id: int, data: RoomIn, except_id: Optional[int] = None) -> None:
    stmt = select(Room.id).where(Room.school_id == school_id, func.lower(Room.code) == data.code.strip().lower())
    if except_id:
        stmt = stmt.where(Room.id != except_id)
    if db.execute(stmt.limit(1)).first():
        raise _400("A room with that code already exists")
    if data.branch_id is not None:
        b = db.get(Branch, data.branch_id)
        if not b or b.school_id != school_id:
            raise _400("Unknown branch")
    if data.section_id is not None:
        s = db.get(Section, data.section_id)
        if not s or s.school_id != school_id:
            raise _400("Unknown section")


def create_room(db: Session, user: User, data: RoomIn) -> Room:
    _check_room(db, user.school_id, data)
    r = Room(tenant_id=user.tenant_id, school_id=user.school_id, **data.model_dump())
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def update_room(db: Session, user: User, room_id: int, data: RoomIn) -> Room:
    r = get_room(db, room_id, user.school_id)
    _check_room(db, user.school_id, data, except_id=r.id)
    for k, v in data.model_dump().items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return r


def delete_room(db: Session, user: User, room_id: int) -> None:
    r = get_room(db, room_id, user.school_id)
    if db.execute(select(Lab.id).where(Lab.room_id == r.id).limit(1)).first():
        raise _400("A lab uses this room; move the lab first")
    db.delete(r)
    db.commit()


def room_to_read(db: Session, rooms: list[Room]) -> list[dict]:
    if not rooms:
        return []
    branches = dict(db.execute(
        select(Branch.id, Branch.name).where(Branch.id.in_({r.branch_id for r in rooms if r.branch_id} or {-1}))
    ).all())
    labels = section_labels(db, {r.section_id for r in rooms if r.section_id})
    return [
        dict(id=r.id, name=r.name, code=r.code, kind=r.kind, capacity=r.capacity, building=r.building, floor=r.floor,
             branch_id=r.branch_id, branch_name=branches.get(r.branch_id), section_id=r.section_id,
             section_label=labels.get(r.section_id), notes=r.notes, is_active=r.is_active)
        for r in rooms
    ]


# ---------- labs ----------


def get_lab(db: Session, lab_id: int, school_id: int) -> Lab:
    l = db.get(Lab, lab_id)
    if not l or l.school_id != school_id:
        raise _404("Lab")
    return l


def list_labs(db: Session, school_id: int, active_only: bool = False) -> list[Lab]:
    stmt = select(Lab).where(Lab.school_id == school_id)
    if active_only:
        stmt = stmt.where(Lab.is_active.is_(True))
    return list(db.execute(stmt.order_by(Lab.name)).scalars())


def _check_lab(db: Session, school_id: int, data: LabIn, except_id: Optional[int] = None) -> None:
    stmt = select(Lab.id).where(Lab.school_id == school_id, func.lower(Lab.code) == data.code.strip().lower())
    if except_id:
        stmt = stmt.where(Lab.id != except_id)
    if db.execute(stmt.limit(1)).first():
        raise _400("A lab with that code already exists")
    if data.room_id is not None:
        get_room(db, data.room_id, school_id)
    if data.subject_id is not None:
        s = db.get(Subject, data.subject_id)
        if not s or s.school_id != school_id:
            raise _400("Unknown subject")
    if data.in_charge_user_id is not None:
        u = db.get(User, data.in_charge_user_id)
        if not u or u.school_id != school_id or u.role in (UserRole.parent, UserRole.student):
            raise _400("Pick a staff member to look after the lab")


def create_lab(db: Session, user: User, data: LabIn) -> Lab:
    _check_lab(db, user.school_id, data)
    l = Lab(tenant_id=user.tenant_id, school_id=user.school_id, **data.model_dump())
    db.add(l)
    db.commit()
    db.refresh(l)
    return l


def update_lab(db: Session, user: User, lab_id: int, data: LabIn) -> Lab:
    l = get_lab(db, lab_id, user.school_id)
    _check_lab(db, user.school_id, data, except_id=l.id)
    for k, v in data.model_dump().items():
        setattr(l, k, v)
    db.commit()
    db.refresh(l)
    return l


def delete_lab(db: Session, user: User, lab_id: int) -> None:
    l = get_lab(db, lab_id, user.school_id)
    if db.execute(
        select(LabBooking.id).where(LabBooking.lab_id == l.id, LabBooking.status != BookingStatus.cancelled).limit(1)
    ).first():
        raise _400("This lab has bookings; switch it off instead")
    db.delete(l)
    db.commit()


def labs_to_read(db: Session, labs: list[Lab]) -> list[dict]:
    if not labs:
        return []
    rooms = {r.id: r for r in db.execute(select(Room).where(Room.id.in_({l.room_id for l in labs if l.room_id} or {-1}))).scalars()}
    subjects = dict(db.execute(
        select(Subject.id, Subject.name).where(Subject.id.in_({l.subject_id for l in labs if l.subject_id} or {-1}))
    ).all())
    users = _names(db, {l.in_charge_user_id for l in labs})
    upcoming = dict(db.execute(
        select(LabBooking.lab_id, func.count()).where(
            LabBooking.lab_id.in_([l.id for l in labs]), LabBooking.status == BookingStatus.booked,
            LabBooking.booking_date >= date.today(),
        ).group_by(LabBooking.lab_id)
    ).all())
    return [
        dict(id=l.id, name=l.name, code=l.code, room_id=l.room_id,
             room_name=rooms[l.room_id].name if l.room_id in rooms else None,
             subject_id=l.subject_id, subject_name=subjects.get(l.subject_id),
             in_charge_user_id=l.in_charge_user_id, in_charge_name=users.get(l.in_charge_user_id),
             capacity=l.capacity or (rooms[l.room_id].capacity if l.room_id in rooms else None),
             equipment=l.equipment, safety_notes=l.safety_notes, is_active=l.is_active,
             upcoming_bookings=upcoming.get(l.id, 0))
        for l in labs
    ]


# ---------- bookings ----------


def _period(db: Session, period_id: int, school_id: int) -> Period:
    p = db.get(Period, period_id)
    if not p or p.school_id != school_id:
        raise _400("Unknown period")
    return p


def book(db: Session, user: User, data: BookingIn) -> LabBooking:
    lab = get_lab(db, data.lab_id, user.school_id)
    if not lab.is_active:
        raise _400("That lab is switched off")
    p = _period(db, data.period_id, user.school_id)
    if p.day_of_week != data.booking_date.isoweekday():
        raise _400("That period isn't on this weekday")
    if p.is_break:
        raise _400("That's a break, not a teaching period")
    today = school_today(db, user.school_id)
    if data.booking_date < today:
        raise _400("Labs can't be booked for a past date")
    if data.booking_date > today + timedelta(days=120):
        raise _400("Book at most four months ahead")
    holiday = db.execute(
        select(Holiday).where(Holiday.school_id == user.school_id, Holiday.start_date <= data.booking_date,
                              Holiday.end_date >= data.booking_date).limit(1)
    ).scalar_one_or_none()
    if holiday:
        raise _400(f"{data.booking_date:%d %b} is a holiday ({holiday.name})")
    teacher_id = data.teacher_user_id or user.id
    if data.teacher_user_id and data.teacher_user_id != user.id and user.role not in OFFICE:
        raise _400("Only the office can book a lab for someone else")
    taken = db.execute(
        select(LabBooking).where(
            LabBooking.lab_id == lab.id, LabBooking.booking_date == data.booking_date,
            LabBooking.period_id == p.id, LabBooking.status != BookingStatus.cancelled,
        )
    ).scalar_one_or_none()
    if taken:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"{lab.name} is already booked for period {p.period_number} that day")
    if data.section_id is not None:
        sec = db.get(Section, data.section_id)
        if not sec or sec.school_id != user.school_id:
            raise _400("Unknown section")
        # the same lab is a double-booking (above); another lab is a clash for the class
        clash = db.execute(
            select(LabBooking).where(
                LabBooking.section_id == data.section_id, LabBooking.booking_date == data.booking_date,
                LabBooking.period_id == p.id, LabBooking.lab_id != lab.id,
                LabBooking.status != BookingStatus.cancelled,
            ).limit(1)
        ).first()
        if clash:
            raise _400("That class is already in another lab this period")
    if data.class_subject_id is not None:
        cs = db.get(ClassSubject, data.class_subject_id)
        if not cs or cs.school_id != user.school_id:
            raise _400("Unknown class subject")
    b = LabBooking(tenant_id=user.tenant_id, school_id=user.school_id, lab_id=lab.id,
                   booking_date=data.booking_date, period_id=p.id, section_id=data.section_id,
                   class_subject_id=data.class_subject_id, teacher_user_id=teacher_id,
                   purpose=data.purpose, students=data.students)
    db.add(b)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"{lab.name} is already booked for period {p.period_number} that day")
    if teacher_id != user.id:
        notify.staff_users(db, tenant_id=b.tenant_id, school_id=b.school_id, user_ids=[teacher_id],
                           title=f"Lab booked: {lab.name}",
                           body=f"{data.booking_date:%a %d %b}, period {p.period_number}." + (f" {data.purpose}" if data.purpose else ""))
        db.commit()
    db.refresh(b)
    return b


def cancel(db: Session, user: User, booking_id: int, reason: Optional[str]) -> LabBooking:
    b = db.get(LabBooking, booking_id)
    if not b or b.school_id != user.school_id:
        raise _404("Booking")
    if b.status == BookingStatus.cancelled:
        raise _400("That booking is already cancelled")
    if user.role not in OFFICE and b.teacher_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only cancel your own bookings")
    if b.booking_date < school_today(db, user.school_id):
        raise _400("Past bookings can't be cancelled")
    b.status, b.cancel_reason = BookingStatus.cancelled, reason
    if b.teacher_user_id and b.teacher_user_id != user.id:
        lab = db.get(Lab, b.lab_id)
        notify.staff_users(db, tenant_id=b.tenant_id, school_id=b.school_id, user_ids=[b.teacher_user_id],
                           title=f"Lab booking cancelled: {lab.name}",
                           body=f"{b.booking_date:%a %d %b}." + (f" {reason}" if reason else ""))
    db.commit()
    db.refresh(b)
    return b


def list_bookings(db: Session, school_id: int, *, lab_id: Optional[int], frm: date, to: date,
                  teacher_user_id: Optional[int], include_cancelled: bool) -> list[LabBooking]:
    stmt = select(LabBooking).where(
        LabBooking.school_id == school_id, LabBooking.booking_date.between(frm, to)
    )
    if lab_id:
        stmt = stmt.where(LabBooking.lab_id == lab_id)
    if teacher_user_id:
        stmt = stmt.where(LabBooking.teacher_user_id == teacher_user_id)
    if not include_cancelled:
        stmt = stmt.where(LabBooking.status != BookingStatus.cancelled)
    return list(db.execute(stmt.order_by(LabBooking.booking_date, LabBooking.period_id)).scalars())


def bookings_to_read(db: Session, items: list[LabBooking]) -> list[dict]:
    if not items:
        return []
    labs = {l.id: l for l in db.execute(select(Lab).where(Lab.id.in_({b.lab_id for b in items}))).scalars()}
    periods = {p.id: p for p in db.execute(select(Period).where(Period.id.in_({b.period_id for b in items}))).scalars()}
    labels = section_labels(db, {b.section_id for b in items if b.section_id})
    users = _names(db, {b.teacher_user_id for b in items})
    subjects = dict(db.execute(
        select(ClassSubject.id, Subject.name).join(Subject, ClassSubject.subject_id == Subject.id)
        .where(ClassSubject.id.in_({b.class_subject_id for b in items if b.class_subject_id} or {-1}))
    ).all())
    out = []
    for b in items:
        p = periods.get(b.period_id)
        out.append(dict(
            id=b.id, lab_id=b.lab_id, lab_name=labs[b.lab_id].name if b.lab_id in labs else "",
            booking_date=b.booking_date, period_id=b.period_id, period_number=p.period_number if p else 0,
            start_time=p.start_time if p else None, end_time=p.end_time if p else None,
            section_id=b.section_id, section_label=labels.get(b.section_id),
            class_subject_id=b.class_subject_id, subject_name=subjects.get(b.class_subject_id),
            teacher_user_id=b.teacher_user_id, teacher_name=users.get(b.teacher_user_id),
            purpose=b.purpose, students=b.students, status=b.status, cancel_reason=b.cancel_reason,
        ))
    return out


def availability(db: Session, school_id: int, on: date) -> dict:
    """Which labs are free in each period that day."""
    labs = list_labs(db, school_id, active_only=True)
    periods = list(db.execute(
        select(Period).where(Period.school_id == school_id, Period.day_of_week == on.isoweekday(),
                             Period.is_break.is_(False)).order_by(Period.period_number)
    ).scalars())
    taken = {
        (b.lab_id, b.period_id): b for b in db.execute(
            select(LabBooking).where(LabBooking.school_id == school_id, LabBooking.booking_date == on,
                                     LabBooking.status != BookingStatus.cancelled)
        ).scalars()
    }
    labels = section_labels(db, {b.section_id for b in taken.values() if b.section_id})
    users = _names(db, {b.teacher_user_id for b in taken.values()})
    holiday = db.execute(
        select(Holiday).where(Holiday.school_id == school_id, Holiday.start_date <= on, Holiday.end_date >= on).limit(1)
    ).scalar_one_or_none()
    rows = []
    for p in periods:
        slots = []
        for l in labs:
            b = taken.get((l.id, p.id))
            slots.append(dict(
                lab_id=l.id, lab_name=l.name, free=b is None, booking_id=b.id if b else None,
                booked_for=labels.get(b.section_id) if b else None,
                booked_by=users.get(b.teacher_user_id) if b else None,
            ))
        rows.append(dict(period_id=p.id, period_number=p.period_number, start_time=p.start_time,
                         end_time=p.end_time, labs=slots))
    return dict(date=on, is_holiday=holiday is not None, holiday_name=holiday.name if holiday else None,
                labs=[dict(id=l.id, name=l.name) for l in labs], periods=rows)
