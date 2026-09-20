import secrets
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import (
    BoardingStatus,
    FeeStatus,
    TransportDirection,
    TripDirection,
    TripStatus,
)
from app.core.scoping import get_school_student, require_linked_child, section_labels
from app.models.fee import FeeHead, StudentFee
from app.models.student import Student
from app.models.transport import (
    TransportAssignment,
    TransportCrew,
    TransportRoute,
    TransportStop,
    Trip,
    TripBoarding,
    Vehicle,
    VehicleLocation,
    VehicleLog,
)
from app.schemas.transport import (
    AssignmentCreate,
    AssignmentUpdate,
    BoardingBulk,
    CrewCreate,
    CrewUpdate,
    GpsPing,
    RouteCreate,
    RouteUpdate,
    StopIn,
    TransportFeeGenerate,
    TripCreate,
    TripUpdate,
    VehicleCreate,
    VehicleLogCreate,
    VehicleUpdate,
)


EXPIRY_WARNING_DAYS = 30
FEE_SOURCE = "transport"


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _scoped(db: Session, model, obj_id: int, school_id: int, what: str):
    obj = db.get(model, obj_id)
    if not obj or obj.school_id != school_id:
        raise _404(what)
    return obj


def _active_assignment_filter(on: date):
    return (
        TransportAssignment.start_date <= on,
        or_(TransportAssignment.end_date.is_(None), TransportAssignment.end_date >= on),
    )


# --- Crew ---

def create_crew(db: Session, tenant_id: int, school_id: int, data: CrewCreate) -> TransportCrew:
    c = TransportCrew(tenant_id=tenant_id, school_id=school_id, is_active=True, **data.model_dump())
    c.full_name = c.full_name.strip()
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def list_crew(db: Session, school_id: int) -> list[TransportCrew]:
    return list(
        db.execute(
            select(TransportCrew)
            .where(TransportCrew.school_id == school_id)
            .order_by(TransportCrew.is_active.desc(), TransportCrew.full_name)
        ).scalars()
    )


def update_crew(db: Session, crew_id: int, school_id: int, data: CrewUpdate) -> TransportCrew:
    c = _scoped(db, TransportCrew, crew_id, school_id, "Crew member")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


def delete_crew(db: Session, crew_id: int, school_id: int) -> None:
    c = _scoped(db, TransportCrew, crew_id, school_id, "Crew member")
    db.delete(c)  # vehicles/trips keep running; their FK is SET NULL
    db.commit()


# --- Vehicles ---

def _check_crew(db: Session, crew_id: Optional[int], school_id: int) -> None:
    if crew_id is not None:
        _scoped(db, TransportCrew, crew_id, school_id, "Crew member")


def _expiring(v: Vehicle, today: date) -> list[str]:
    soon = today + timedelta(days=EXPIRY_WARNING_DAYS)
    out = []
    for field, name in (
        ("insurance_expiry", "Insurance"),
        ("fitness_expiry", "Fitness certificate"),
        ("permit_expiry", "Permit"),
        ("pollution_expiry", "Pollution certificate"),
    ):
        d = getattr(v, field)
        if d and d <= soon:
            out.append(f"{name} {'expired' if d < today else 'expires'} {d.isoformat()}")
    return out


def vehicle_to_read_dict(db: Session, v: Vehicle) -> dict:
    driver = db.get(TransportCrew, v.driver_id) if v.driver_id else None
    conductor = db.get(TransportCrew, v.conductor_id) if v.conductor_id else None
    today = date.today()
    assigned = db.execute(
        select(func.count(TransportAssignment.id))
        .join(TransportRoute, TransportAssignment.route_id == TransportRoute.id)
        .where(TransportRoute.vehicle_id == v.id, *_active_assignment_filter(today))
    ).scalar_one()
    return {
        "id": v.id,
        "registration_no": v.registration_no,
        "label": v.label,
        "kind": v.kind,
        "capacity": v.capacity,
        "make_model": v.make_model,
        "driver_id": v.driver_id,
        "driver_name": driver.full_name if driver else None,
        "driver_phone": driver.phone if driver else None,
        "conductor_id": v.conductor_id,
        "conductor_name": conductor.full_name if conductor else None,
        "insurance_expiry": v.insurance_expiry,
        "fitness_expiry": v.fitness_expiry,
        "permit_expiry": v.permit_expiry,
        "pollution_expiry": v.pollution_expiry,
        "expiring_documents": _expiring(v, today),
        "gps_enabled": bool(v.gps_api_key),
        "last_lat": v.last_lat,
        "last_lng": v.last_lng,
        "last_speed_kmph": v.last_speed_kmph,
        "last_location_at": v.last_location_at,
        "assigned_students": assigned,
        "is_active": v.is_active,
    }


def create_vehicle(db: Session, tenant_id: int, school_id: int, data: VehicleCreate) -> Vehicle:
    _check_crew(db, data.driver_id, school_id)
    _check_crew(db, data.conductor_id, school_id)
    fields = data.model_dump()
    fields["registration_no"] = fields["registration_no"].strip().upper()
    v = Vehicle(tenant_id=tenant_id, school_id=school_id, is_active=True, **fields)
    db.add(v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Vehicle {fields['registration_no']} already exists",
        )
    db.refresh(v)
    return v


def list_vehicles(db: Session, school_id: int) -> list[Vehicle]:
    return list(
        db.execute(
            select(Vehicle)
            .where(Vehicle.school_id == school_id)
            .order_by(Vehicle.is_active.desc(), Vehicle.label, Vehicle.registration_no)
        ).scalars()
    )


def get_vehicle(db: Session, vehicle_id: int, school_id: int) -> Vehicle:
    return _scoped(db, Vehicle, vehicle_id, school_id, "Vehicle")


def update_vehicle(db: Session, vehicle_id: int, school_id: int, data: VehicleUpdate) -> Vehicle:
    v = get_vehicle(db, vehicle_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    if "driver_id" in updates:
        _check_crew(db, updates["driver_id"], school_id)
    if "conductor_id" in updates:
        _check_crew(db, updates["conductor_id"], school_id)
    if updates.get("registration_no"):
        updates["registration_no"] = updates["registration_no"].strip().upper()
    for k, val in updates.items():
        setattr(v, k, val)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Registration number already in use"
        )
    db.refresh(v)
    return v


def delete_vehicle(db: Session, vehicle_id: int, school_id: int) -> None:
    v = get_vehicle(db, vehicle_id, school_id)
    in_use = db.execute(
        select(TransportRoute.name).where(
            TransportRoute.vehicle_id == v.id, TransportRoute.is_active.is_(True)
        )
    ).scalars().first()
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vehicle is assigned to route '{in_use}'. Reassign the route first.",
        )
    db.delete(v)
    db.commit()


def rotate_gps_key(db: Session, vehicle_id: int, school_id: int) -> str:
    v = get_vehicle(db, vehicle_id, school_id)
    v.gps_api_key = secrets.token_urlsafe(32)
    db.commit()
    return v.gps_api_key


def add_vehicle_log(
    db: Session, vehicle_id: int, school_id: int, actor_user_id: int, data: VehicleLogCreate
) -> VehicleLog:
    v = get_vehicle(db, vehicle_id, school_id)
    log = VehicleLog(vehicle_id=v.id, recorded_by_user_id=actor_user_id, **data.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def list_vehicle_logs(db: Session, vehicle_id: int, school_id: int) -> list[VehicleLog]:
    v = get_vehicle(db, vehicle_id, school_id)
    return list(
        db.execute(
            select(VehicleLog)
            .where(VehicleLog.vehicle_id == v.id)
            .order_by(VehicleLog.log_date.desc(), VehicleLog.id.desc())
        ).scalars()
    )


def delete_vehicle_log(db: Session, vehicle_id: int, log_id: int, school_id: int) -> None:
    v = get_vehicle(db, vehicle_id, school_id)
    log = db.get(VehicleLog, log_id)
    if not log or log.vehicle_id != v.id:
        raise _404("Log entry")
    db.delete(log)
    db.commit()


# --- GPS ---

def record_gps(db: Session, api_key: str, ping: GpsPing) -> Vehicle:
    v = db.execute(select(Vehicle).where(Vehicle.gps_api_key == api_key)).scalar_one_or_none()
    if not v or not v.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown device key")
    at = ping.recorded_at or datetime.now(timezone.utc)
    db.add(
        VehicleLocation(
            vehicle_id=v.id, lat=ping.lat, lng=ping.lng, speed_kmph=ping.speed_kmph, recorded_at=at
        )
    )
    # Late-arriving (buffered) pings go into history but don't rewind "last seen".
    if v.last_location_at is None or at >= v.last_location_at:
        v.last_lat, v.last_lng, v.last_speed_kmph, v.last_location_at = (
            ping.lat,
            ping.lng,
            ping.speed_kmph,
            at,
        )
    db.commit()
    return v


def location_history(
    db: Session, vehicle_id: int, school_id: int, on: date
) -> list[VehicleLocation]:
    v = get_vehicle(db, vehicle_id, school_id)
    start = datetime(on.year, on.month, on.day, tzinfo=timezone.utc)
    return list(
        db.execute(
            select(VehicleLocation)
            .where(
                VehicleLocation.vehicle_id == v.id,
                VehicleLocation.recorded_at >= start,
                VehicleLocation.recorded_at < start + timedelta(days=1),
            )
            .order_by(VehicleLocation.recorded_at)
        ).scalars()
    )


# --- Routes & stops ---

def _stop_counts(db: Session, route_id: int, on: date) -> dict[int, int]:
    return dict(
        db.execute(
            select(TransportAssignment.stop_id, func.count(TransportAssignment.id))
            .where(TransportAssignment.route_id == route_id, *_active_assignment_filter(on))
            .group_by(TransportAssignment.stop_id)
        ).all()
    )


def route_to_read_dict(db: Session, r: TransportRoute) -> dict:
    stops = db.execute(
        select(TransportStop).where(TransportStop.route_id == r.id).order_by(TransportStop.sequence)
    ).scalars().all()
    counts = _stop_counts(db, r.id, date.today())
    vehicle = db.get(Vehicle, r.vehicle_id) if r.vehicle_id else None
    return {
        "id": r.id,
        "name": r.name,
        "code": r.code,
        "vehicle_id": r.vehicle_id,
        "vehicle_label": (vehicle.label or vehicle.registration_no) if vehicle else None,
        "vehicle_capacity": vehicle.capacity if vehicle else None,
        "monthly_fee": r.monthly_fee,
        "is_active": r.is_active,
        "stops": [
            {
                "id": s.id,
                "name": s.name,
                "sequence": s.sequence,
                "pickup_time": s.pickup_time,
                "drop_time": s.drop_time,
                "monthly_fee": s.monthly_fee,
                "effective_fee": s.monthly_fee if s.monthly_fee is not None else r.monthly_fee,
                "lat": s.lat,
                "lng": s.lng,
                "student_count": counts.get(s.id, 0),
            }
            for s in stops
        ],
        "student_count": sum(counts.values()),
    }


def _check_vehicle(db: Session, vehicle_id: Optional[int], school_id: int) -> None:
    if vehicle_id is not None:
        get_vehicle(db, vehicle_id, school_id)


def _sync_stops(db: Session, route: TransportRoute, stops: list[StopIn]) -> None:
    existing = {
        s.id: s
        for s in db.execute(select(TransportStop).where(TransportStop.route_id == route.id)).scalars()
    }
    keep_ids = {s.id for s in stops if s.id is not None}
    unknown = keep_ids - existing.keys()
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stop ids {sorted(unknown)} don't belong to this route",
        )
    removed = set(existing) - keep_ids
    if removed:
        in_use = db.execute(
            select(TransportStop.name)
            .join(TransportAssignment, TransportAssignment.stop_id == TransportStop.id)
            .where(TransportStop.id.in_(removed), TransportAssignment.end_date.is_(None))
        ).scalars().first()
        if in_use:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Stop '{in_use}' still has students assigned. Move them first.",
            )
        for sid in removed:
            # Closed assignments may still point here — keep those stops' rows.
            referenced = db.execute(
                select(TransportAssignment.id).where(TransportAssignment.stop_id == sid)
            ).first()
            if referenced:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Stop '{existing[sid].name}' has assignment history and can't be removed; rename it instead.",
                )
            db.delete(existing[sid])
    for seq, s in enumerate(stops, start=1):
        fields = s.model_dump(exclude={"id"})
        fields["name"] = fields["name"].strip()
        if s.id is not None:
            row = existing[s.id]
            for k, v in fields.items():
                setattr(row, k, v)
            row.sequence = seq
        else:
            db.add(TransportStop(route_id=route.id, sequence=seq, **fields))


def create_route(db: Session, tenant_id: int, school_id: int, data: RouteCreate) -> TransportRoute:
    _check_vehicle(db, data.vehicle_id, school_id)
    r = TransportRoute(
        tenant_id=tenant_id,
        school_id=school_id,
        name=data.name.strip(),
        code=data.code.strip().upper(),
        vehicle_id=data.vehicle_id,
        monthly_fee=data.monthly_fee,
        is_active=True,
    )
    db.add(r)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"Route code {r.code} already exists"
        )
    if any(s.id is not None for s in data.stops):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New stops can't have ids")
    _sync_stops(db, r, data.stops)
    db.commit()
    db.refresh(r)
    return r


def list_routes(db: Session, school_id: int) -> list[TransportRoute]:
    return list(
        db.execute(
            select(TransportRoute)
            .where(TransportRoute.school_id == school_id)
            .order_by(TransportRoute.is_active.desc(), TransportRoute.code)
        ).scalars()
    )


def get_route(db: Session, route_id: int, school_id: int) -> TransportRoute:
    return _scoped(db, TransportRoute, route_id, school_id, "Route")


def update_route(db: Session, route_id: int, school_id: int, data: RouteUpdate) -> TransportRoute:
    r = get_route(db, route_id, school_id)
    updates = data.model_dump(exclude_unset=True, exclude={"stops"})
    if "vehicle_id" in updates:
        _check_vehicle(db, updates["vehicle_id"], school_id)
    if updates.get("code"):
        updates["code"] = updates["code"].strip().upper()
    if updates.get("is_active") is False:
        active = db.execute(
            select(func.count(TransportAssignment.id)).where(
                TransportAssignment.route_id == r.id, TransportAssignment.end_date.is_(None)
            )
        ).scalar_one()
        if active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{active} student(s) still use this route. Move them first.",
            )
    for k, v in updates.items():
        setattr(r, k, v)
    if data.stops is not None:
        _sync_stops(db, r, data.stops)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Route code already in use")
    db.refresh(r)
    return r


def delete_route(db: Session, route_id: int, school_id: int) -> None:
    r = get_route(db, route_id, school_id)
    used = db.execute(
        select(TransportAssignment.id).where(TransportAssignment.route_id == r.id)
    ).first()
    if used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Route has assignment history; deactivate it instead of deleting.",
        )
    db.delete(r)
    db.commit()


# --- Assignments ---

def _fee_for(stop: TransportStop, route: TransportRoute) -> Decimal:
    return stop.monthly_fee if stop.monthly_fee is not None else route.monthly_fee


def _assignment_rows(db: Session, *where) -> list[dict]:
    rows = db.execute(
        select(TransportAssignment, Student, TransportRoute, TransportStop)
        .join(Student, TransportAssignment.student_id == Student.id)
        .join(TransportRoute, TransportAssignment.route_id == TransportRoute.id)
        .join(TransportStop, TransportAssignment.stop_id == TransportStop.id)
        .where(*where)
        .order_by(TransportRoute.code, TransportStop.sequence, Student.full_name)
    ).all()
    labels = section_labels(db, {row[1].section_id for row in rows})
    return [
        {
            "id": a.id,
            "student_id": st.id,
            "student_name": st.full_name,
            "admission_no": st.admission_no,
            "section_label": labels.get(st.section_id),
            "route_id": r.id,
            "route_name": r.name,
            "stop_id": sp.id,
            "stop_name": sp.name,
            "pickup_time": sp.pickup_time,
            "drop_time": sp.drop_time,
            "direction": a.direction,
            "monthly_fee": _fee_for(sp, r),
            "start_date": a.start_date,
            "end_date": a.end_date,
        }
        for a, st, r, sp in rows
    ]


def list_assignments(
    db: Session,
    school_id: int,
    *,
    route_id: Optional[int] = None,
    stop_id: Optional[int] = None,
    include_ended: bool = False,
    search: Optional[str] = None,
) -> list[dict]:
    where = [TransportAssignment.school_id == school_id]
    if route_id:
        where.append(TransportAssignment.route_id == route_id)
    if stop_id:
        where.append(TransportAssignment.stop_id == stop_id)
    if not include_ended:
        where.append(TransportAssignment.end_date.is_(None))
    if search:
        like = f"%{search.strip()}%"
        where.append(or_(Student.full_name.ilike(like), Student.admission_no.ilike(like)))
    return _assignment_rows(db, *where)


def assign(
    db: Session, tenant_id: int, school_id: int, data: AssignmentCreate
) -> dict:
    student = get_school_student(db, data.student_id, school_id)
    if not student.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Student is inactive")
    route = get_route(db, data.route_id, school_id)
    if not route.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Route is inactive")
    stop = db.get(TransportStop, data.stop_id)
    if not stop or stop.route_id != route.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Stop doesn't belong to this route"
        )
    start = data.start_date or date.today()

    # Capacity is advisory for buses (they do two runs, siblings share seats),
    # so it's reported on the dashboard rather than blocking here.
    current = db.execute(
        select(TransportAssignment).where(
            TransportAssignment.student_id == student.id, TransportAssignment.end_date.is_(None)
        )
    ).scalar_one_or_none()
    if current:
        if current.start_date >= start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student already has an assignment starting on or after this date",
            )
        # Moving routes/stops: close the old one the day before the new start.
        current.end_date = start - timedelta(days=1)
        db.flush()

    a = TransportAssignment(
        tenant_id=tenant_id,
        school_id=school_id,
        student_id=student.id,
        route_id=route.id,
        stop_id=stop.id,
        direction=data.direction,
        start_date=start,
    )
    db.add(a)
    db.commit()
    return _assignment_rows(db, TransportAssignment.id == a.id)[0]


def update_assignment(db: Session, assignment_id: int, school_id: int, data: AssignmentUpdate) -> dict:
    """Correct a running assignment — the wrong stop was picked, or the child
    only rides home. Changing the route mid-term is a move, not a correction,
    so that still goes through a new assignment which closes this one."""
    a = _scoped(db, TransportAssignment, assignment_id, school_id, "Assignment")
    if a.end_date is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This assignment has ended — create a new one instead",
        )
    fields = data.model_dump(exclude_unset=True)
    if "stop_id" in fields:
        stop = db.get(TransportStop, fields["stop_id"])
        if not stop or stop.route_id != a.route_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="That stop isn't on this route — assign the child to the other route instead",
            )
        a.stop_id = stop.id
    if "direction" in fields:
        a.direction = fields["direction"]
    if "start_date" in fields:
        if fields["start_date"] > date.today():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="The start date is in the future"
            )
        a.start_date = fields["start_date"]
    db.commit()
    return _assignment_rows(db, TransportAssignment.id == a.id)[0]


def end_assignment(db: Session, assignment_id: int, school_id: int, end: Optional[date]) -> dict:
    a = _scoped(db, TransportAssignment, assignment_id, school_id, "Assignment")
    if a.end_date is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assignment already ended")
    end = end or date.today()
    if end < a.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="end_date is before the start date"
        )
    a.end_date = end
    db.commit()
    return _assignment_rows(db, TransportAssignment.id == a.id)[0]


# --- Trips ---

def _trip_students(db: Session, trip: Trip) -> list[dict]:
    wanted = (
        TransportDirection.both,
        TransportDirection.pickup if trip.direction == TripDirection.pickup else TransportDirection.drop,
    )
    rows = db.execute(
        select(Student, TransportStop)
        .join(TransportAssignment, TransportAssignment.student_id == Student.id)
        .join(TransportStop, TransportAssignment.stop_id == TransportStop.id)
        .where(
            TransportAssignment.route_id == trip.route_id,
            TransportAssignment.direction.in_(wanted),
            Student.is_active.is_(True),
            *_active_assignment_filter(trip.trip_date),
        )
    ).all()
    marks = {
        b.student_id: b
        for b in db.execute(select(TripBoarding).where(TripBoarding.trip_id == trip.id)).scalars()
    }
    labels = section_labels(db, {st.section_id for st, _ in rows})
    out = [
        {
            "student_id": st.id,
            "student_name": st.full_name,
            "section_label": labels.get(st.section_id),
            "stop_id": sp.id,
            "stop_name": sp.name,
            "stop_sequence": sp.sequence,
            "status": marks[st.id].status if st.id in marks else None,
            "marked_at": marks[st.id].marked_at if st.id in marks else None,
        }
        for st, sp in rows
    ]
    # Pickup runs follow the stop order; drop runs go in reverse.
    out.sort(
        key=lambda s: (
            s["stop_sequence"] if trip.direction == TripDirection.pickup else -s["stop_sequence"],
            s["student_name"],
        )
    )
    return out


def trip_to_read_dict(db: Session, t: Trip, *, with_students: bool = False) -> dict:
    route = db.get(TransportRoute, t.route_id)
    vehicle = db.get(Vehicle, t.vehicle_id) if t.vehicle_id else None
    driver = db.get(TransportCrew, t.driver_id) if t.driver_id else None
    students = _trip_students(db, t)
    d = {
        "id": t.id,
        "route_id": t.route_id,
        "route_name": route.name if route else "",
        "vehicle_id": t.vehicle_id,
        "vehicle_label": (vehicle.label or vehicle.registration_no) if vehicle else None,
        "driver_name": driver.full_name if driver else None,
        "trip_date": t.trip_date,
        "direction": t.direction,
        "status": t.status,
        "started_at": t.started_at,
        "ended_at": t.ended_at,
        "start_odometer_km": t.start_odometer_km,
        "end_odometer_km": t.end_odometer_km,
        "distance_km": (
            t.end_odometer_km - t.start_odometer_km
            if t.start_odometer_km is not None and t.end_odometer_km is not None
            else None
        ),
        "notes": t.notes,
        "expected": len(students),
        "boarded": sum(1 for s in students if s["status"] in (BoardingStatus.boarded, BoardingStatus.dropped)),
        "absent": sum(1 for s in students if s["status"] == BoardingStatus.absent),
    }
    if with_students:
        d["students"] = students
    return d


def create_trip(db: Session, tenant_id: int, school_id: int, data: TripCreate) -> Trip:
    route = get_route(db, data.route_id, school_id)
    vehicle = db.get(Vehicle, route.vehicle_id) if route.vehicle_id else None
    t = Trip(
        tenant_id=tenant_id,
        school_id=school_id,
        route_id=route.id,
        vehicle_id=route.vehicle_id,
        driver_id=vehicle.driver_id if vehicle else None,
        trip_date=data.trip_date,
        direction=data.direction,
        status=TripStatus.scheduled,
    )
    db.add(t)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A trip for this route, date and direction already exists",
        )
    db.refresh(t)
    return t


def generate_trips(db: Session, tenant_id: int, school_id: int, on: date) -> dict:
    """Create the day's pickup + drop trip sheets for every active route (idempotent)."""
    created = 0
    for route in db.execute(
        select(TransportRoute).where(
            TransportRoute.school_id == school_id, TransportRoute.is_active.is_(True)
        )
    ).scalars():
        for direction in TripDirection:
            exists = db.execute(
                select(Trip.id).where(
                    Trip.route_id == route.id, Trip.trip_date == on, Trip.direction == direction
                )
            ).first()
            if exists:
                continue
            create_trip(db, tenant_id, school_id, TripCreate(route_id=route.id, trip_date=on, direction=direction))
            created += 1
    return {"date": on, "created": created}


def list_trips(
    db: Session, school_id: int, *, on: Optional[date] = None, route_id: Optional[int] = None
) -> list[Trip]:
    stmt = select(Trip).where(Trip.school_id == school_id)
    if on:
        stmt = stmt.where(Trip.trip_date == on)
    if route_id:
        stmt = stmt.where(Trip.route_id == route_id)
    return list(db.execute(stmt.order_by(Trip.trip_date.desc(), Trip.route_id, Trip.direction)).scalars())


def get_trip(db: Session, trip_id: int, school_id: int) -> Trip:
    return _scoped(db, Trip, trip_id, school_id, "Trip")


_TRIP_FLOW = {
    TripStatus.scheduled: {TripStatus.in_progress, TripStatus.cancelled},
    TripStatus.in_progress: {TripStatus.completed, TripStatus.cancelled},
    TripStatus.completed: set(),
    TripStatus.cancelled: {TripStatus.scheduled},
}


def update_trip(db: Session, trip_id: int, school_id: int, data: TripUpdate) -> Trip:
    t = get_trip(db, trip_id, school_id)
    updates = data.model_dump(exclude_unset=True)
    new_status = updates.pop("status", None)
    if new_status and new_status != t.status:
        if new_status not in _TRIP_FLOW[t.status]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Can't move a {t.status.value} trip to {new_status.value}",
            )
        now = datetime.now(timezone.utc)
        if new_status == TripStatus.in_progress:
            t.started_at = now
        elif new_status == TripStatus.completed:
            t.ended_at = now
        t.status = new_status
    for k, v in updates.items():
        setattr(t, k, v)
    if (
        t.start_odometer_km is not None
        and t.end_odometer_km is not None
        and t.end_odometer_km < t.start_odometer_km
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End odometer can't be less than start odometer",
        )
    db.commit()
    db.refresh(t)
    return t


def mark_boarding(
    db: Session, trip_id: int, school_id: int, actor_user_id: int, data: BoardingBulk
) -> Trip:
    t = get_trip(db, trip_id, school_id)
    if t.status in (TripStatus.cancelled, TripStatus.completed):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Trip is {t.status.value}"
        )
    allowed = {s["student_id"] for s in _trip_students(db, t)}
    bad = [m.student_id for m in data.marks if m.student_id not in allowed]
    if bad:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Students {bad} aren't on this trip",
        )
    if t.direction == TripDirection.pickup and any(m.status == BoardingStatus.dropped for m in data.marks):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Use 'boarded' or 'absent' on pickup trips"
        )
    existing = {
        b.student_id: b
        for b in db.execute(select(TripBoarding).where(TripBoarding.trip_id == t.id)).scalars()
    }
    now = datetime.now(timezone.utc)
    for m in data.marks:
        row = existing.get(m.student_id)
        if row:
            row.status, row.marked_at, row.marked_by_user_id = m.status, now, actor_user_id
        else:
            db.add(
                TripBoarding(
                    trip_id=t.id,
                    student_id=m.student_id,
                    status=m.status,
                    marked_at=now,
                    marked_by_user_id=actor_user_id,
                )
            )
    if t.status == TripStatus.scheduled:
        t.status, t.started_at = TripStatus.in_progress, now
    db.commit()
    db.refresh(t)
    return t


# --- Fees ---

def generate_fees(
    db: Session, tenant_id: int, school_id: int, data: TransportFeeGenerate
) -> dict:
    """Raise one StudentFee per active assignment for the month (idempotent)."""
    head = db.get(FeeHead, data.fee_head_id)
    if not head or head.school_id != school_id:
        raise _404("Fee head")
    year, month = (int(x) for x in data.period.split("-"))
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    due = date(year, month, min(data.due_day, last.day))

    rows = db.execute(
        select(TransportAssignment, TransportStop, TransportRoute)
        .join(TransportStop, TransportAssignment.stop_id == TransportStop.id)
        .join(TransportRoute, TransportAssignment.route_id == TransportRoute.id)
        .join(Student, TransportAssignment.student_id == Student.id)
        .where(
            TransportAssignment.school_id == school_id,
            Student.is_active.is_(True),
            # Any overlap with the month counts as a month of service.
            TransportAssignment.start_date <= last,
            or_(TransportAssignment.end_date.is_(None), TransportAssignment.end_date >= first),
        )
    ).all()

    # One transport fee per student per month. A student who changed route
    # mid-month is billed for the assignment they ended the month on.
    latest: dict[int, tuple] = {}
    for a, stop, route in rows:
        cur = latest.get(a.student_id)
        if cur is None or a.start_date > cur[0].start_date:
            latest[a.student_id] = (a, stop, route)
    already_billed = set(
        db.execute(
            select(StudentFee.student_id).where(
                StudentFee.school_id == school_id,
                StudentFee.source == FEE_SOURCE,
                StudentFee.period == data.period,
            )
        ).scalars()
    )

    created = skipped = 0
    total = Decimal("0")
    for a, stop, route in latest.values():
        amount = _fee_for(stop, route)
        if amount <= 0 or a.student_id in already_billed:
            skipped += 1
            continue
        try:
            with db.begin_nested():
                db.add(
                    StudentFee(
                        tenant_id=tenant_id,
                        school_id=school_id,
                        student_id=a.student_id,
                        fee_structure_id=None,
                        source=FEE_SOURCE,
                        source_id=a.id,
                        fee_head_id=head.id,
                        period=data.period,
                        amount_due=amount,
                        amount_paid=Decimal("0"),
                        due_date=due,
                        status=FeeStatus.pending,
                        notes=f"Transport: {route.name} / {stop.name}",
                    )
                )
                db.flush()
            created += 1
            total += amount
        except IntegrityError:
            skipped += 1
    db.commit()
    return {"period": data.period, "created": created, "skipped": skipped, "total_amount": total}


# --- Dashboard ---

def dashboard(db: Session, school_id: int) -> dict:
    today = date.today()
    vehicles = list_vehicles(db, school_id)
    active_vehicles = [v for v in vehicles if v.is_active]
    routes = [r for r in list_routes(db, school_id) if r.is_active]
    students = db.execute(
        select(func.count(TransportAssignment.id)).where(
            TransportAssignment.school_id == school_id, *_active_assignment_filter(today)
        )
    ).scalar_one()
    trips = list_trips(db, school_id, on=today)

    expiring = []
    for v in active_vehicles:
        for msg in _expiring(v, today):
            expiring.append({"vehicle_id": v.id, "vehicle": v.label or v.registration_no, "message": msg})
    for c in list_crew(db, school_id):
        if c.is_active and c.license_expiry and c.license_expiry <= today + timedelta(days=EXPIRY_WARNING_DAYS):
            verb = "expired" if c.license_expiry < today else "expires"
            expiring.append({"crew_id": c.id, "vehicle": c.full_name, "message": f"Driving licence {verb} {c.license_expiry}"})

    overloaded = []
    for r in routes:
        if not r.vehicle_id:
            continue
        v = db.get(Vehicle, r.vehicle_id)
        n = sum(_stop_counts(db, r.id, today).values())
        if v and n > v.capacity:
            overloaded.append({"route_id": r.id, "route": r.name, "students": n, "capacity": v.capacity})

    return {
        "vehicles": len(active_vehicles),
        "active_routes": len(routes),
        "students_using_transport": students,
        "seats_total": sum(v.capacity for v in active_vehicles),
        "trips_today": len(trips),
        "trips_in_progress": sum(1 for t in trips if t.status == TripStatus.in_progress),
        "expiring_documents": expiring,
        "overloaded_routes": overloaded,
    }


# --- Parent view ---

def child_transport(db: Session, parent_user_id: int, student_id: int) -> Optional[dict]:
    student = require_linked_child(db, parent_user_id, student_id)
    today = date.today()
    row = db.execute(
        select(TransportAssignment, TransportRoute, TransportStop)
        .join(TransportRoute, TransportAssignment.route_id == TransportRoute.id)
        .join(TransportStop, TransportAssignment.stop_id == TransportStop.id)
        .where(TransportAssignment.student_id == student.id, *_active_assignment_filter(today))
    ).first()
    if not row:
        return None
    a, route, stop = row
    vehicle = db.get(Vehicle, route.vehicle_id) if route.vehicle_id else None
    driver = db.get(TransportCrew, vehicle.driver_id) if vehicle and vehicle.driver_id else None
    today_rows = db.execute(
        select(Trip, TripBoarding)
        .outerjoin(
            TripBoarding,
            (TripBoarding.trip_id == Trip.id) & (TripBoarding.student_id == student.id),
        )
        .where(Trip.route_id == route.id, Trip.trip_date == today)
        .order_by(Trip.direction)
    ).all()
    return {
        "route_name": route.name,
        "stop_name": stop.name,
        "pickup_time": stop.pickup_time,
        "drop_time": stop.drop_time,
        "direction": a.direction,
        "vehicle_label": vehicle.label if vehicle else None,
        "registration_no": vehicle.registration_no if vehicle else None,
        "driver_name": driver.full_name if driver else None,
        "driver_phone": driver.phone if driver else None,
        "last_lat": vehicle.last_lat if vehicle else None,
        "last_lng": vehicle.last_lng if vehicle else None,
        "last_location_at": vehicle.last_location_at if vehicle else None,
        "today": [
            {
                "direction": t.direction.value,
                "trip_status": t.status.value,
                "boarding_status": b.status.value if b else None,
                "marked_at": b.marked_at if b else None,
            }
            for t, b in today_rows
        ],
    }
