"""Hostel: buildings, rooms & beds, allocation, roll call, outings, mess menu,
complaints and monthly fees.

Access: school admin / principal manage every hostel; a warden (any staff
user set as a hostel's warden) runs roll call, outings and complaints for
their own hostel.
"""
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import notify
from app.core.enums import (
    ComplaintStatus,
    FeeStatus,
    HostelAttendanceStatus,
    OutingStatus,
    UserRole,
)
from app.core.scoping import get_school_student, require_linked_child, section_labels
from app.models.fee import FeeHead, StudentFee
from app.models.hostel import (
    Hostel,
    HostelAllocation,
    HostelAttendance,
    HostelBed,
    HostelComplaint,
    HostelOuting,
    HostelRoom,
    MessMenu,
)
from app.models.student import Student
from app.models.tenant import School
from app.models.user import User
from app.schemas.hostel import (
    AllocationIn,
    ComplaintIn,
    ComplaintUpdate,
    HostelFeeGenerate,
    HostelIn,
    MenuIn,
    OutingDecision,
    TransferIn,
    OutingIn,
    ParentOutingIn,
    RollCallIn,
    RoomIn,
    RoomUpdate,
)


FEE_SOURCE = "hostel"
MANAGERS = (UserRole.school_admin, UserRole.principal)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _tz(db: Session, school_id: int) -> ZoneInfo:
    s = db.get(School, school_id)
    return ZoneInfo(s.timezone if s and s.timezone else "Asia/Kolkata")


# --- Access ---

def is_manager(user: User) -> bool:
    return user.role in MANAGERS


def _hostel(db: Session, hostel_id: int, user: User) -> Hostel:
    h = db.get(Hostel, hostel_id)
    if not h or h.school_id != user.school_id:
        raise _404("Hostel")
    if not is_manager(user) and h.warden_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You aren't the warden of this hostel")
    return h


def _require_manager(user: User) -> None:
    if not is_manager(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="School admin or principal only")


def visible_hostels(db: Session, user: User) -> list[Hostel]:
    stmt = select(Hostel).where(Hostel.school_id == user.school_id)
    if not is_manager(user):
        stmt = stmt.where(Hostel.warden_user_id == user.id)
    return list(db.execute(stmt.order_by(Hostel.is_active.desc(), Hostel.name)).scalars())


# --- Hostels, rooms, beds ---

def _check_warden(db: Session, school_id: int, user_id: Optional[int]) -> None:
    if user_id is None:
        return
    u = db.get(User, user_id)
    if not u or u.school_id != school_id or u.role in (UserRole.parent, UserRole.student) or not u.is_active:
        raise _404("Warden (staff member)")


def hostel_to_read(db: Session, h: Hostel) -> dict:
    warden = db.get(User, h.warden_user_id) if h.warden_user_id else None
    rooms = db.execute(select(func.count(HostelRoom.id)).where(HostelRoom.hostel_id == h.id, HostelRoom.is_active.is_(True))).scalar_one()
    beds = db.execute(
        select(func.count(HostelBed.id))
        .join(HostelRoom, HostelBed.room_id == HostelRoom.id)
        .where(HostelRoom.hostel_id == h.id, HostelRoom.is_active.is_(True), HostelBed.is_active.is_(True))
    ).scalar_one()
    occupied = db.execute(
        select(func.count(HostelAllocation.id))
        .join(HostelBed, HostelAllocation.bed_id == HostelBed.id)
        .join(HostelRoom, HostelBed.room_id == HostelRoom.id)
        .where(HostelRoom.hostel_id == h.id, HostelAllocation.end_date.is_(None))
    ).scalar_one()
    return {
        **{k: getattr(h, k) for k in HostelIn.model_fields},
        "id": h.id,
        "warden_name": warden.full_name if warden else None,
        "warden_phone": warden.phone if warden else None,
        "rooms": rooms,
        "beds": beds,
        "occupied": occupied,
    }


def create_hostel(db: Session, user: User, data: HostelIn) -> Hostel:
    _require_manager(user)
    _check_warden(db, user.school_id, data.warden_user_id)
    h = Hostel(tenant_id=user.tenant_id, school_id=user.school_id, **data.model_dump())
    db.add(h)
    db.commit()
    db.refresh(h)
    return h


def update_hostel(db: Session, hostel_id: int, user: User, data: HostelIn) -> Hostel:
    _require_manager(user)
    h = _hostel(db, hostel_id, user)
    _check_warden(db, user.school_id, data.warden_user_id)
    if not data.is_active and h.is_active:
        if db.execute(select(func.count(HostelAllocation.id)).join(HostelBed).join(HostelRoom).where(
            HostelRoom.hostel_id == h.id, HostelAllocation.end_date.is_(None)
        )).scalar_one():
            raise _400("Move residents out before deactivating the hostel")
    for k, v in data.model_dump().items():
        setattr(h, k, v)
    db.commit()
    db.refresh(h)
    return h


def _bed_labels(n: int) -> list[str]:
    out = []
    for i in range(n):
        s, x = "", i
        while True:
            s = chr(65 + x % 26) + s
            x = x // 26 - 1
            if x < 0:
                break
        out.append(s)
    return out


def add_room(db: Session, hostel_id: int, user: User, data: RoomIn) -> HostelRoom:
    _require_manager(user)
    h = _hostel(db, hostel_id, user)
    r = HostelRoom(hostel_id=h.id, room_no=data.room_no.strip().upper(), floor=data.floor,
                   room_type=data.room_type, monthly_fee=data.monthly_fee)
    db.add(r)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Room {data.room_no} already exists")
    for label in _bed_labels(data.beds):
        db.add(HostelBed(room_id=r.id, label=label))
    db.commit()
    db.refresh(r)
    return r


def _occupant(db: Session, bed_id: int) -> Optional[HostelAllocation]:
    return db.execute(
        select(HostelAllocation).where(HostelAllocation.bed_id == bed_id, HostelAllocation.end_date.is_(None))
    ).scalar_one_or_none()


def update_room(db: Session, room_id: int, user: User, data: RoomUpdate) -> HostelRoom:
    _require_manager(user)
    r = db.get(HostelRoom, room_id)
    if not r:
        raise _404("Room")
    _hostel(db, r.hostel_id, user)
    updates = data.model_dump(exclude_unset=True)
    beds_wanted = updates.pop("beds", None)
    if beds_wanted is not None:
        beds = list(db.execute(select(HostelBed).where(HostelBed.room_id == r.id).order_by(HostelBed.id)).scalars())
        active = [b for b in beds if b.is_active]
        if beds_wanted > len(active):
            existing = {b.label for b in beds}
            labels = [l for l in _bed_labels(len(beds) + beds_wanted) if l not in existing]
            for b in beds:
                if not b.is_active and len(active) < beds_wanted:
                    b.is_active = True
                    active.append(b)
            for label in labels[: beds_wanted - len(active)]:
                db.add(HostelBed(room_id=r.id, label=label))
        elif beds_wanted < len(active):
            # Retire empty beds from the end; refuse if that would evict someone.
            for b in reversed(active):
                if len([x for x in active if x.is_active]) <= beds_wanted:
                    break
                if _occupant(db, b.id):
                    raise _400(f"Bed {b.label} is occupied; move the student first")
                b.is_active = False
    if updates.get("is_active") is False and any(_occupant(db, b.id) for b in db.execute(select(HostelBed).where(HostelBed.room_id == r.id)).scalars()):
        raise _400("Room has residents")
    for k, v in updates.items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return r


def rooms(db: Session, hostel_id: int, user: User) -> list[dict]:
    h = _hostel(db, hostel_id, user)
    rows = list(db.execute(select(HostelRoom).where(HostelRoom.hostel_id == h.id).order_by(HostelRoom.room_no)).scalars())
    beds = list(db.execute(select(HostelBed).where(HostelBed.room_id.in_([r.id for r in rows]), HostelBed.is_active.is_(True)).order_by(HostelBed.label)).scalars())
    allocs = {
        a.bed_id: (a, s)
        for a, s in db.execute(
            select(HostelAllocation, Student)
            .join(Student, HostelAllocation.student_id == Student.id)
            .where(HostelAllocation.bed_id.in_([b.id for b in beds]), HostelAllocation.end_date.is_(None))
        ).all()
    }
    labels = section_labels(db, {s.section_id for _, s in allocs.values()})
    out = []
    for r in rows:
        rb = []
        for b in beds:
            if b.room_id != r.id:
                continue
            a, s = allocs.get(b.id, (None, None))
            rb.append({
                "id": b.id, "label": b.label,
                "student_id": s.id if s else None, "student_name": s.full_name if s else None,
                "section_label": labels.get(s.section_id) if s else None,
                "allocation_id": a.id if a else None, "since": a.start_date if a else None,
            })
        out.append({
            "id": r.id, "room_no": r.room_no, "floor": r.floor, "room_type": r.room_type,
            "monthly_fee": r.monthly_fee, "effective_fee": r.monthly_fee if r.monthly_fee is not None else h.monthly_fee,
            "is_active": r.is_active, "beds": rb,
        })
    return out


# --- Allocation ---

def allocate(db: Session, user: User, data: AllocationIn) -> HostelAllocation:
    _require_manager(user)
    student = get_school_student(db, data.student_id, user.school_id)
    if not student.is_active:
        raise _400("Student is inactive")
    bed = db.get(HostelBed, data.bed_id)
    room = db.get(HostelRoom, bed.room_id) if bed else None
    if not bed or not bed.is_active or not room or not room.is_active:
        raise _404("Bed")
    hostel = _hostel(db, room.hostel_id, user)
    if not hostel.is_active:
        raise _400("Hostel is inactive")
    if _occupant(db, bed.id):
        raise _400(f"Bed {room.room_no}-{bed.label} is taken")
    start = data.start_date or date.today()
    current = db.execute(
        select(HostelAllocation).where(HostelAllocation.student_id == student.id, HostelAllocation.end_date.is_(None))
    ).scalar_one_or_none()
    if current:
        if current.start_date >= start:
            raise _400("Student already has a bed from that date")
        current.end_date = start - timedelta(days=1)  # room change
        db.flush()
    a = HostelAllocation(tenant_id=user.tenant_id, school_id=user.school_id, student_id=student.id,
                         bed_id=bed.id, start_date=start)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def transfer(db: Session, allocation_id: int, user: User, data: TransferIn) -> HostelAllocation:
    """Move a resident to another bed.

    Moving is one act, not "vacate then allocate": doing it as two leaves a
    night where the child is in no bed at all, and a warden reading the
    register can't tell a move from a child who went home. This closes the old
    allocation the day before the new one starts and opens the new bed, so the
    history reads as one continuous stay in two places.
    """
    _require_manager(user)
    a = db.get(HostelAllocation, allocation_id)
    if not a or a.school_id != user.school_id:
        raise _404("Allocation")
    if a.end_date:
        raise _400("This resident has already moved out — allocate a bed instead")
    bed = db.get(HostelBed, data.bed_id)
    room = db.get(HostelRoom, bed.room_id) if bed else None
    if not bed or not bed.is_active or not room or not room.is_active:
        raise _404("Bed")
    if bed.id == a.bed_id:
        raise _400("That is the bed they are already in")
    hostel = _hostel(db, room.hostel_id, user)
    if not hostel.is_active:
        raise _400("Hostel is inactive")
    taken = _occupant(db, bed.id)
    if taken:
        raise _400(f"Bed {room.room_no}-{bed.label} is taken")
    on = data.moved_on or date.today()
    if on <= a.start_date:
        raise _400("The move has to be after the stay began")
    a.end_date = on - timedelta(days=1)
    moved = HostelAllocation(tenant_id=a.tenant_id, school_id=a.school_id, student_id=a.student_id,
                             bed_id=bed.id, start_date=on)
    db.add(moved)
    db.commit()
    db.refresh(moved)
    return moved


def vacate(db: Session, allocation_id: int, user: User, end: Optional[date]) -> HostelAllocation:
    _require_manager(user)
    a = db.get(HostelAllocation, allocation_id)
    if not a or a.school_id != user.school_id:
        raise _404("Allocation")
    if a.end_date:
        raise _400("Already vacated")
    end = end or date.today()
    if end < a.start_date:
        raise _400("End date is before the start date")
    a.end_date = end
    db.commit()
    db.refresh(a)
    return a


def _residents_q(hostel_id: int, on: date):
    return (
        select(HostelAllocation, Student, HostelBed, HostelRoom)
        .join(Student, HostelAllocation.student_id == Student.id)
        .join(HostelBed, HostelAllocation.bed_id == HostelBed.id)
        .join(HostelRoom, HostelBed.room_id == HostelRoom.id)
        .where(
            HostelRoom.hostel_id == hostel_id,
            HostelAllocation.start_date <= on,
            or_(HostelAllocation.end_date.is_(None), HostelAllocation.end_date >= on),
            Student.is_active.is_(True),
        )
        .order_by(HostelRoom.room_no, HostelBed.label)
    )


def residents(db: Session, hostel_id: int, user: User, on: Optional[date] = None) -> list[dict]:
    h = _hostel(db, hostel_id, user)
    on = on or datetime.now(_tz(db, h.school_id)).date()
    rows = db.execute(_residents_q(h.id, on)).all()
    sids = [s.id for _, s, _, _ in rows]
    marks = {}
    details: dict[int, dict] = {}
    for m in db.execute(select(HostelAttendance).where(HostelAttendance.student_id.in_(sids), HostelAttendance.date == on)).scalars():
        marks.setdefault(m.student_id, {})[m.session.value] = m.status.value
        details.setdefault(m.student_id, {})[m.session.value] = {
            "checked_in_at": m.checked_in_at, "is_late": m.is_late, "remark": m.remark,
        }
    out_now = set(db.execute(
        select(HostelOuting.student_id).where(HostelOuting.student_id.in_(sids), HostelOuting.status == OutingStatus.out)
    ).scalars())
    labels = section_labels(db, {s.section_id for _, s, _, _ in rows})
    return [
        {
            "allocation_id": a.id, "student_id": s.id, "student_name": s.full_name, "admission_no": s.admission_no,
            "section_label": labels.get(s.section_id), "room_no": r.room_no, "bed_label": b.label, "since": a.start_date,
            "today": marks.get(s.id, {}), "today_details": details.get(s.id, {}), "out_now": s.id in out_now,
        }
        for a, s, b, r in rows
    ]


# --- Roll call ---

def roll_call(db: Session, hostel_id: int, user: User, data: RollCallIn) -> int:
    h = _hostel(db, hostel_id, user)
    today = datetime.now(_tz(db, h.school_id)).date()
    if data.date > today:
        raise _400("Can't mark attendance for a future date")
    allowed = {s.id for _, s, _, _ in db.execute(_residents_q(h.id, data.date)).all()}
    bad = [m.student_id for m in data.marks if m.student_id not in allowed]
    if bad:
        raise _400(f"Students {bad} don't live in this hostel")
    existing = {
        a.student_id: a
        for a in db.execute(select(HostelAttendance).where(
            HostelAttendance.hostel_id == h.id, HostelAttendance.date == data.date, HostelAttendance.session == data.session
        )).scalars()
    }
    absentees = []
    for m in data.marks:
        row = existing.get(m.student_id)
        present = m.status == HostelAttendanceStatus.present
        extra = dict(
            checked_in_at=m.checked_in_at if present else None,
            is_late=bool(m.is_late and present),
            remark=(m.remark or "").strip() or None,
        )
        if row:
            changed = row.status != m.status
            row.status, row.marked_by_user_id = m.status, user.id
            for k, v in extra.items():
                setattr(row, k, v)
        else:
            changed = True
            db.add(HostelAttendance(hostel_id=h.id, student_id=m.student_id, date=data.date,
                                    session=data.session, status=m.status, marked_by_user_id=user.id, **extra))
        if changed and m.status == HostelAttendanceStatus.absent and data.date == today:
            absentees.append(m.student_id)
    db.flush()
    for sid in absentees:
        s = db.get(Student, sid)
        notify.student_parents(
            db, s, f"Hostel roll call: {s.full_name} absent",
            f"{s.full_name} was not present at the {data.session.value} roll call in {h.name} on {data.date:%d %b}. "
            "Please contact the warden if you know where they are.",
        )
    db.commit()
    return len(data.marks)


# --- Outings ---

def _outing(db: Session, outing_id: int, user: User) -> tuple[HostelOuting, Hostel]:
    o = db.get(HostelOuting, outing_id)
    if not o or o.school_id != user.school_id:
        raise _404("Outing")
    h = _student_hostel(db, o.student_id)
    if h is None:
        if not is_manager(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your hostel")
        return o, None
    return o, _hostel(db, h.id, user)


def _student_hostel(db: Session, student_id: int) -> Optional[Hostel]:
    return db.execute(
        select(Hostel)
        .join(HostelRoom, HostelRoom.hostel_id == Hostel.id)
        .join(HostelBed, HostelBed.room_id == HostelRoom.id)
        .join(HostelAllocation, HostelAllocation.bed_id == HostelBed.id)
        .where(HostelAllocation.student_id == student_id, HostelAllocation.end_date.is_(None))
    ).scalar_one_or_none()


def create_outing(db: Session, user: User, data: OutingIn) -> HostelOuting:
    s = get_school_student(db, data.student_id, user.school_id)
    h = _student_hostel(db, s.id)
    if h is None:
        raise _400("Student doesn't live in a hostel")
    _hostel(db, h.id, user)
    o = HostelOuting(tenant_id=s.tenant_id, school_id=s.school_id, status=OutingStatus.approved,
                     requested_by_user_id=user.id, decided_by_user_id=user.id, **data.model_dump())
    db.add(o)
    db.commit()
    db.refresh(o)
    return o


def parent_request_outing(db: Session, parent: User, student_id: int, data: ParentOutingIn) -> HostelOuting:
    s = require_linked_child(db, parent.id, student_id)
    if _student_hostel(db, s.id) is None:
        raise _400("Your child doesn't live in the hostel")
    if data.leave_at < datetime.now(timezone.utc) - timedelta(hours=1):
        raise _400("Leave time is in the past")
    overlapping = db.execute(
        select(HostelOuting.id).where(
            HostelOuting.student_id == s.id,
            HostelOuting.status.in_((OutingStatus.requested, OutingStatus.approved, OutingStatus.out)),
            HostelOuting.leave_at < data.return_by,
            HostelOuting.return_by > data.leave_at,
        )
    ).first()
    if overlapping:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="There's already a request for that time")
    o = HostelOuting(tenant_id=s.tenant_id, school_id=s.school_id, student_id=s.id, status=OutingStatus.requested,
                     requested_by_user_id=parent.id, **data.model_dump())
    db.add(o)
    db.commit()
    db.refresh(o)
    return o


def decide_outing(db: Session, outing_id: int, user: User, data: OutingDecision) -> HostelOuting:
    o, _ = _outing(db, outing_id, user)
    if o.status != OutingStatus.requested:
        raise _400(f"Already {o.status.value}")
    if not data.approve and not (data.note or "").strip():
        raise _400("Give a reason")
    o.status = OutingStatus.approved if data.approve else OutingStatus.rejected
    o.decided_by_user_id = user.id
    o.decision_note = data.note
    s = db.get(Student, o.student_id)
    tz = _tz(db, o.school_id)
    notify.student_parents(
        db, s,
        f"Hostel {o.kind.value.replace('_', ' ')} {'approved' if data.approve else 'not approved'}: {s.full_name}",
        f"{o.leave_at.astimezone(tz):%d %b %I:%M %p} – {o.return_by.astimezone(tz):%d %b %I:%M %p}."
        + (f" Note: {data.note}" if data.note else ""),
    )
    db.commit()
    db.refresh(o)
    return o


def mark_out(db: Session, outing_id: int, user: User) -> HostelOuting:
    o, _ = _outing(db, outing_id, user)
    if o.status != OutingStatus.approved:
        raise _400(f"Outing is {o.status.value}")
    o.status = OutingStatus.out
    o.went_out_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(o)
    return o


def mark_returned(db: Session, outing_id: int, user: User) -> HostelOuting:
    o, _ = _outing(db, outing_id, user)
    if o.status != OutingStatus.out:
        raise _400("Student isn't marked out")
    o.status = OutingStatus.returned
    o.returned_at = datetime.now(timezone.utc)
    s = db.get(Student, o.student_id)
    notify.student_parents(
        db, s, f"{s.full_name} is back in the hostel",
        f"Returned at {o.returned_at.astimezone(_tz(db, o.school_id)):%d %b %I:%M %p}.",
    )
    db.commit()
    db.refresh(o)
    return o


def parent_cancel_outing(db: Session, parent: User, student_id: int, outing_id: int) -> HostelOuting:
    require_linked_child(db, parent.id, student_id)
    o = db.get(HostelOuting, outing_id)
    if not o or o.student_id != student_id:
        raise _404("Outing")
    if o.status not in (OutingStatus.requested, OutingStatus.approved):
        raise _400(f"Outing is {o.status.value}")
    o.status = OutingStatus.cancelled
    db.commit()
    db.refresh(o)
    return o


def outing_to_read(db: Session, o: HostelOuting) -> dict:
    s = db.get(Student, o.student_id)
    req = db.get(User, o.requested_by_user_id) if o.requested_by_user_id else None
    now = datetime.now(timezone.utc)
    late = None
    if o.returned_at and o.returned_at > o.return_by:
        late = int((o.returned_at - o.return_by).total_seconds() // 60)
    return {
        **{k: getattr(o, k) for k in (
            "id", "student_id", "kind", "leave_at", "return_by", "reason", "escort_name", "status",
            "decision_note", "went_out_at", "returned_at",
        )},
        "student_name": s.full_name if s else "",
        "requested_by_name": req.full_name if req else None,
        "requested_by_parent": bool(req and req.role == UserRole.parent),
        "overdue": o.status == OutingStatus.out and now > o.return_by,
        "late_by_minutes": late,
    }


def list_outings(db: Session, hostel_id: int, user: User, *, active_only: bool = True) -> list[HostelOuting]:
    h = _hostel(db, hostel_id, user)
    sids = select(HostelAllocation.student_id).join(HostelBed).join(HostelRoom).where(
        HostelRoom.hostel_id == h.id, HostelAllocation.end_date.is_(None)
    )
    stmt = select(HostelOuting).where(HostelOuting.student_id.in_(sids))
    if active_only:
        stmt = stmt.where(HostelOuting.status.in_((OutingStatus.requested, OutingStatus.approved, OutingStatus.out)))
    return list(db.execute(stmt.order_by(HostelOuting.leave_at.desc()).limit(200)).scalars())


def parent_outings(db: Session, parent_user_id: int, student_id: int) -> list[HostelOuting]:
    require_linked_child(db, parent_user_id, student_id)
    return list(db.execute(select(HostelOuting).where(HostelOuting.student_id == student_id).order_by(HostelOuting.leave_at.desc()).limit(30)).scalars())


# --- Mess menu ---

def get_menu(db: Session, hostel_id: int) -> list[MessMenu]:
    return list(db.execute(select(MessMenu).where(MessMenu.hostel_id == hostel_id).order_by(MessMenu.day_of_week, MessMenu.meal)).scalars())


def set_menu(db: Session, hostel_id: int, user: User, data: MenuIn) -> list[MessMenu]:
    h = _hostel(db, hostel_id, user)
    db.execute(MessMenu.__table__.delete().where(MessMenu.hostel_id == h.id))
    seen = set()
    for slot in data.slots:
        key = (slot.day_of_week, slot.meal)
        if key in seen:
            raise _400(f"Duplicate slot: day {slot.day_of_week} {slot.meal.value}")
        seen.add(key)
        db.add(MessMenu(hostel_id=h.id, day_of_week=slot.day_of_week, meal=slot.meal, items=slot.items.strip()))
    db.commit()
    return get_menu(db, h.id)


# --- Complaints ---

def raise_complaint(db: Session, hostel: Hostel, actor: User, data: ComplaintIn) -> HostelComplaint:
    c = HostelComplaint(tenant_id=hostel.tenant_id, school_id=hostel.school_id, hostel_id=hostel.id,
                        student_id=data.student_id, category=data.category, description=data.description.strip(),
                        raised_by_user_id=actor.id)
    db.add(c)
    if hostel.warden_user_id and hostel.warden_user_id != actor.id:
        notify.staff_users(db, tenant_id=hostel.tenant_id, school_id=hostel.school_id, user_ids=[hostel.warden_user_id],
                           title=f"Hostel complaint ({data.category})", body=data.description[:500])
    db.commit()
    db.refresh(c)
    return c


def staff_complaint(db: Session, hostel_id: int, user: User, data: ComplaintIn) -> HostelComplaint:
    h = _hostel(db, hostel_id, user)
    if data.student_id:
        get_school_student(db, data.student_id, user.school_id)
    return raise_complaint(db, h, user, data)


def parent_complaint(db: Session, parent: User, student_id: int, data: ComplaintIn) -> HostelComplaint:
    s = require_linked_child(db, parent.id, student_id)
    h = _student_hostel(db, s.id)
    if h is None:
        raise _400("Your child doesn't live in the hostel")
    return raise_complaint(db, h, parent, data.model_copy(update={"student_id": s.id}))


def update_complaint(db: Session, complaint_id: int, user: User, data: ComplaintUpdate) -> HostelComplaint:
    c = db.get(HostelComplaint, complaint_id)
    if not c or c.school_id != user.school_id:
        raise _404("Complaint")
    _hostel(db, c.hostel_id, user)
    if data.status == ComplaintStatus.resolved and not (data.resolution or c.resolution):
        raise _400("Say how it was resolved")
    c.status = data.status
    if data.resolution:
        c.resolution = data.resolution
    c.resolved_at = datetime.now(timezone.utc) if data.status == ComplaintStatus.resolved else None
    if data.status == ComplaintStatus.resolved and c.raised_by_user_id:
        raiser = db.get(User, c.raised_by_user_id)
        if raiser and raiser.role == UserRole.parent and c.student_id:
            s = db.get(Student, c.student_id)
            notify.student_parents(db, s, "Hostel complaint resolved", f"{c.description[:120]}\n\nResolution: {c.resolution}")
    db.commit()
    db.refresh(c)
    return c


def complaint_to_read(db: Session, c: HostelComplaint) -> dict:
    s = db.get(Student, c.student_id) if c.student_id else None
    who = db.get(User, c.raised_by_user_id) if c.raised_by_user_id else None
    return {
        **{k: getattr(c, k) for k in ("id", "hostel_id", "student_id", "category", "description", "status", "resolution", "resolved_at", "created_at")},
        "student_name": s.full_name if s else None,
        "raised_by_name": who.full_name if who else None,
    }


def list_complaints(db: Session, hostel_id: int, user: User, *, open_only: bool = True) -> list[HostelComplaint]:
    h = _hostel(db, hostel_id, user)
    stmt = select(HostelComplaint).where(HostelComplaint.hostel_id == h.id)
    if open_only:
        stmt = stmt.where(HostelComplaint.status != ComplaintStatus.resolved)
    return list(db.execute(stmt.order_by(HostelComplaint.created_at.desc()).limit(200)).scalars())


# --- Fees ---

def generate_fees(db: Session, user: User, data: HostelFeeGenerate) -> dict:
    _require_manager(user)
    head = db.get(FeeHead, data.fee_head_id)
    if not head or head.school_id != user.school_id:
        raise _404("Fee head")
    y, m = (int(x) for x in data.period.split("-"))
    first, last = date(y, m, 1), date(y, m, monthrange(y, m)[1])
    due = date(y, m, min(data.due_day, last.day))
    rows = db.execute(
        select(HostelAllocation, HostelRoom, Hostel)
        .join(HostelBed, HostelAllocation.bed_id == HostelBed.id)
        .join(HostelRoom, HostelBed.room_id == HostelRoom.id)
        .join(Hostel, HostelRoom.hostel_id == Hostel.id)
        .join(Student, HostelAllocation.student_id == Student.id)
        .where(
            HostelAllocation.school_id == user.school_id,
            Student.is_active.is_(True),
            HostelAllocation.start_date <= last,
            or_(HostelAllocation.end_date.is_(None), HostelAllocation.end_date >= first),
        )
    ).all()
    # One fee per student per month, at the room they ended the month in.
    latest: dict[int, tuple] = {}
    for a, r, h in rows:
        if a.student_id not in latest or a.start_date > latest[a.student_id][0].start_date:
            latest[a.student_id] = (a, r, h)
    billed = set(db.execute(select(StudentFee.student_id).where(
        StudentFee.school_id == user.school_id, StudentFee.source == FEE_SOURCE, StudentFee.period == data.period
    )).scalars())
    created = skipped = 0
    total = Decimal("0")
    for a, r, h in latest.values():
        amount = r.monthly_fee if r.monthly_fee is not None else h.monthly_fee
        if not amount or amount <= 0 or a.student_id in billed:
            skipped += 1
            continue
        db.add(StudentFee(
            tenant_id=user.tenant_id, school_id=user.school_id, student_id=a.student_id, fee_structure_id=None,
            source=FEE_SOURCE, source_id=a.id, fee_head_id=head.id, period=data.period, amount_due=amount,
            amount_paid=Decimal("0"), due_date=due, status=FeeStatus.pending, notes=f"Hostel: {h.name} room {r.room_no}",
        ))
        created += 1
        total += amount
    db.commit()
    return {"period": data.period, "created": created, "skipped": skipped, "total_amount": total}


# --- Parent view ---

def child_hostel(db: Session, parent_user_id: int, student_id: int) -> Optional[dict]:
    s = require_linked_child(db, parent_user_id, student_id)
    row = db.execute(
        select(HostelAllocation, HostelBed, HostelRoom, Hostel)
        .join(HostelBed, HostelAllocation.bed_id == HostelBed.id)
        .join(HostelRoom, HostelBed.room_id == HostelRoom.id)
        .join(Hostel, HostelRoom.hostel_id == Hostel.id)
        .where(HostelAllocation.student_id == s.id, HostelAllocation.end_date.is_(None))
    ).first()
    if not row:
        return None
    a, b, r, h = row
    warden = db.get(User, h.warden_user_id) if h.warden_user_id else None
    today = datetime.now(_tz(db, h.school_id)).date()
    menu = {m.meal.value: m.items for m in get_menu(db, h.id) if m.day_of_week == today.weekday()}
    att = db.execute(
        select(HostelAttendance).where(HostelAttendance.student_id == s.id, HostelAttendance.date >= today - timedelta(days=6))
        .order_by(HostelAttendance.date.desc(), HostelAttendance.session)
    ).scalars()
    return {
        "hostel_id": h.id, "hostel_name": h.name, "room_no": r.room_no, "bed_label": b.label, "since": a.start_date,
        "warden_name": warden.full_name if warden else None, "warden_phone": warden.phone if warden else None,
        "curfew": h.curfew, "menu_today": menu,
        "attendance_last_7_days": [{"date": x.date, "session": x.session.value, "status": x.status.value} for x in att],
    }
