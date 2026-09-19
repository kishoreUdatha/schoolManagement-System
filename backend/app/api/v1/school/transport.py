from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.deps import SchoolAdminUser
from app.database import get_db
from app.schemas.transport import (
    AssignmentCreate,
    AssignmentEnd,
    AssignmentRead,
    BoardingBulk,
    CrewCreate,
    CrewRead,
    CrewUpdate,
    GpsKeyRead,
    LocationPoint,
    RouteCreate,
    RouteRead,
    RouteUpdate,
    TransportDashboard,
    TransportFeeGenerate,
    TransportFeeResult,
    TripCreate,
    TripDetail,
    TripRead,
    TripUpdate,
    VehicleCreate,
    VehicleLogCreate,
    VehicleLogRead,
    VehicleRead,
    VehicleUpdate,
)
from app.services import transport_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]


@router.get("/dashboard", response_model=TransportDashboard)
def dashboard(current_user: SchoolAdminUser, db: Db):
    return TransportDashboard.model_validate(svc.dashboard(db, current_user.school_id))


# --- Crew ---

@router.get("/crew", response_model=list[CrewRead])
def list_crew(current_user: SchoolAdminUser, db: Db):
    return [CrewRead.model_validate(c) for c in svc.list_crew(db, current_user.school_id)]


@router.post("/crew", response_model=CrewRead, status_code=status.HTTP_201_CREATED)
def create_crew(payload: CrewCreate, current_user: SchoolAdminUser, db: Db):
    return CrewRead.model_validate(
        svc.create_crew(db, current_user.tenant_id, current_user.school_id, payload)
    )


@router.patch("/crew/{crew_id}", response_model=CrewRead)
def update_crew(crew_id: int, payload: CrewUpdate, current_user: SchoolAdminUser, db: Db):
    return CrewRead.model_validate(svc.update_crew(db, crew_id, current_user.school_id, payload))


@router.delete("/crew/{crew_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_crew(crew_id: int, current_user: SchoolAdminUser, db: Db):
    svc.delete_crew(db, crew_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Vehicles ---

@router.get("/vehicles", response_model=list[VehicleRead])
def list_vehicles(current_user: SchoolAdminUser, db: Db):
    return [
        VehicleRead.model_validate(svc.vehicle_to_read_dict(db, v))
        for v in svc.list_vehicles(db, current_user.school_id)
    ]


@router.post("/vehicles", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
def create_vehicle(payload: VehicleCreate, current_user: SchoolAdminUser, db: Db):
    v = svc.create_vehicle(db, current_user.tenant_id, current_user.school_id, payload)
    return VehicleRead.model_validate(svc.vehicle_to_read_dict(db, v))


@router.get("/vehicles/{vehicle_id}", response_model=VehicleRead)
def get_vehicle(vehicle_id: int, current_user: SchoolAdminUser, db: Db):
    v = svc.get_vehicle(db, vehicle_id, current_user.school_id)
    return VehicleRead.model_validate(svc.vehicle_to_read_dict(db, v))


@router.patch("/vehicles/{vehicle_id}", response_model=VehicleRead)
def update_vehicle(vehicle_id: int, payload: VehicleUpdate, current_user: SchoolAdminUser, db: Db):
    v = svc.update_vehicle(db, vehicle_id, current_user.school_id, payload)
    return VehicleRead.model_validate(svc.vehicle_to_read_dict(db, v))


@router.delete("/vehicles/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(vehicle_id: int, current_user: SchoolAdminUser, db: Db):
    svc.delete_vehicle(db, vehicle_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/vehicles/{vehicle_id}/gps-key",
    response_model=GpsKeyRead,
    summary="Generate (or rotate) the key a GPS tracker uses to post locations",
)
def rotate_gps_key(vehicle_id: int, current_user: SchoolAdminUser, db: Db):
    key = svc.rotate_gps_key(db, vehicle_id, current_user.school_id)
    return GpsKeyRead(vehicle_id=vehicle_id, gps_api_key=key)


@router.get("/vehicles/{vehicle_id}/locations", response_model=list[LocationPoint])
def vehicle_locations(
    vehicle_id: int,
    current_user: SchoolAdminUser,
    db: Db,
    on: date = Query(default_factory=date.today),
):
    return [
        LocationPoint.model_validate(p, from_attributes=True)
        for p in svc.location_history(db, vehicle_id, current_user.school_id, on)
    ]


@router.get("/vehicles/{vehicle_id}/logs", response_model=list[VehicleLogRead])
def list_logs(vehicle_id: int, current_user: SchoolAdminUser, db: Db):
    return [
        VehicleLogRead.model_validate(l)
        for l in svc.list_vehicle_logs(db, vehicle_id, current_user.school_id)
    ]


@router.post(
    "/vehicles/{vehicle_id}/logs",
    response_model=VehicleLogRead,
    status_code=status.HTTP_201_CREATED,
)
def add_log(vehicle_id: int, payload: VehicleLogCreate, current_user: SchoolAdminUser, db: Db):
    return VehicleLogRead.model_validate(
        svc.add_vehicle_log(db, vehicle_id, current_user.school_id, current_user.id, payload)
    )


@router.delete("/vehicles/{vehicle_id}/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(vehicle_id: int, log_id: int, current_user: SchoolAdminUser, db: Db):
    svc.delete_vehicle_log(db, vehicle_id, log_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Routes ---

@router.get("/routes", response_model=list[RouteRead])
def list_routes(current_user: SchoolAdminUser, db: Db):
    return [
        RouteRead.model_validate(svc.route_to_read_dict(db, r))
        for r in svc.list_routes(db, current_user.school_id)
    ]


@router.post("/routes", response_model=RouteRead, status_code=status.HTTP_201_CREATED)
def create_route(payload: RouteCreate, current_user: SchoolAdminUser, db: Db):
    r = svc.create_route(db, current_user.tenant_id, current_user.school_id, payload)
    return RouteRead.model_validate(svc.route_to_read_dict(db, r))


@router.get("/routes/{route_id}", response_model=RouteRead)
def get_route(route_id: int, current_user: SchoolAdminUser, db: Db):
    r = svc.get_route(db, route_id, current_user.school_id)
    return RouteRead.model_validate(svc.route_to_read_dict(db, r))


@router.patch("/routes/{route_id}", response_model=RouteRead)
def update_route(route_id: int, payload: RouteUpdate, current_user: SchoolAdminUser, db: Db):
    r = svc.update_route(db, route_id, current_user.school_id, payload)
    return RouteRead.model_validate(svc.route_to_read_dict(db, r))


@router.delete("/routes/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route(route_id: int, current_user: SchoolAdminUser, db: Db):
    svc.delete_route(db, route_id, current_user.school_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Assignments ---

@router.get("/assignments", response_model=list[AssignmentRead])
def list_assignments(
    current_user: SchoolAdminUser,
    db: Db,
    route_id: Optional[int] = Query(None),
    stop_id: Optional[int] = Query(None),
    include_ended: bool = Query(False),
    search: Optional[str] = Query(None),
):
    return [
        AssignmentRead.model_validate(a)
        for a in svc.list_assignments(
            db,
            current_user.school_id,
            route_id=route_id,
            stop_id=stop_id,
            include_ended=include_ended,
            search=search,
        )
    ]


@router.post(
    "/assignments",
    response_model=AssignmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Assign (or move) a student to a route + stop",
)
def assign(payload: AssignmentCreate, current_user: SchoolAdminUser, db: Db):
    return AssignmentRead.model_validate(
        svc.assign(db, current_user.tenant_id, current_user.school_id, payload)
    )


@router.post("/assignments/{assignment_id}/end", response_model=AssignmentRead)
def end_assignment(
    assignment_id: int, payload: AssignmentEnd, current_user: SchoolAdminUser, db: Db
):
    return AssignmentRead.model_validate(
        svc.end_assignment(db, assignment_id, current_user.school_id, payload.end_date)
    )


# --- Trips ---

@router.get("/trips", response_model=list[TripRead])
def list_trips(
    current_user: SchoolAdminUser,
    db: Db,
    on: Optional[date] = Query(None),
    route_id: Optional[int] = Query(None),
):
    return [
        TripRead.model_validate(svc.trip_to_read_dict(db, t))
        for t in svc.list_trips(db, current_user.school_id, on=on, route_id=route_id)
    ]


@router.post("/trips", response_model=TripRead, status_code=status.HTTP_201_CREATED)
def create_trip(payload: TripCreate, current_user: SchoolAdminUser, db: Db):
    t = svc.create_trip(db, current_user.tenant_id, current_user.school_id, payload)
    return TripRead.model_validate(svc.trip_to_read_dict(db, t))


@router.post("/trips/generate", summary="Create today's (or a given day's) trip sheets for all active routes")
def generate_trips(
    current_user: SchoolAdminUser,
    db: Db,
    on: date = Query(default_factory=date.today),
):
    return svc.generate_trips(db, current_user.tenant_id, current_user.school_id, on)


@router.get("/trips/{trip_id}", response_model=TripDetail)
def get_trip(trip_id: int, current_user: SchoolAdminUser, db: Db):
    t = svc.get_trip(db, trip_id, current_user.school_id)
    return TripDetail.model_validate(svc.trip_to_read_dict(db, t, with_students=True))


@router.patch("/trips/{trip_id}", response_model=TripDetail)
def update_trip(trip_id: int, payload: TripUpdate, current_user: SchoolAdminUser, db: Db):
    t = svc.update_trip(db, trip_id, current_user.school_id, payload)
    return TripDetail.model_validate(svc.trip_to_read_dict(db, t, with_students=True))


@router.post("/trips/{trip_id}/boarding", response_model=TripDetail)
def mark_boarding(trip_id: int, payload: BoardingBulk, current_user: SchoolAdminUser, db: Db):
    t = svc.mark_boarding(db, trip_id, current_user.school_id, current_user.id, payload)
    return TripDetail.model_validate(svc.trip_to_read_dict(db, t, with_students=True))


# --- Fees ---

@router.post(
    "/fees/generate",
    response_model=TransportFeeResult,
    summary="Raise the month's transport fee for every student using transport",
)
def generate_fees(payload: TransportFeeGenerate, current_user: SchoolAdminUser, db: Db):
    return TransportFeeResult.model_validate(
        svc.generate_fees(db, current_user.tenant_id, current_user.school_id, payload)
    )
