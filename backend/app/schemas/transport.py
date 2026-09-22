from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import (
    BoardingStatus,
    CrewRole,
    TransportDirection,
    TripDirection,
    TripStatus,
    VehicleKind,
    VehicleLogKind,
)


# --- Crew ---

class CrewCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=160)
    role: CrewRole
    phone: str = Field(..., min_length=6, max_length=20)
    license_no: Optional[str] = Field(None, max_length=40)
    license_expiry: Optional[date] = None
    address: Optional[str] = Field(None, max_length=2000)


class CrewUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=160)
    role: Optional[CrewRole] = None
    phone: Optional[str] = Field(None, min_length=6, max_length=20)
    license_no: Optional[str] = Field(None, max_length=40)
    license_expiry: Optional[date] = None
    address: Optional[str] = Field(None, max_length=2000)
    is_active: Optional[bool] = None


class CrewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    role: CrewRole
    phone: str
    license_no: Optional[str] = None
    license_expiry: Optional[date] = None
    address: Optional[str] = None
    is_active: bool


# --- Vehicles ---

class VehicleCreate(BaseModel):
    registration_no: str = Field(..., min_length=3, max_length=20)
    label: Optional[str] = Field(None, max_length=40)
    kind: VehicleKind = VehicleKind.bus
    capacity: int = Field(..., ge=1, le=200)
    make_model: Optional[str] = Field(None, max_length=80)
    driver_id: Optional[int] = None
    conductor_id: Optional[int] = None
    insurance_expiry: Optional[date] = None
    fitness_expiry: Optional[date] = None
    permit_expiry: Optional[date] = None
    pollution_expiry: Optional[date] = None


class VehicleUpdate(BaseModel):
    registration_no: Optional[str] = Field(None, min_length=3, max_length=20)
    label: Optional[str] = Field(None, max_length=40)
    kind: Optional[VehicleKind] = None
    capacity: Optional[int] = Field(None, ge=1, le=200)
    make_model: Optional[str] = Field(None, max_length=80)
    driver_id: Optional[int] = None
    conductor_id: Optional[int] = None
    insurance_expiry: Optional[date] = None
    fitness_expiry: Optional[date] = None
    permit_expiry: Optional[date] = None
    pollution_expiry: Optional[date] = None
    is_active: Optional[bool] = None


class VehicleRead(BaseModel):
    id: int
    registration_no: str
    label: Optional[str] = None
    kind: VehicleKind
    capacity: int
    make_model: Optional[str] = None
    driver_id: Optional[int] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    conductor_id: Optional[int] = None
    conductor_name: Optional[str] = None
    insurance_expiry: Optional[date] = None
    fitness_expiry: Optional[date] = None
    permit_expiry: Optional[date] = None
    pollution_expiry: Optional[date] = None
    expiring_documents: list[str] = []  # expired or due within 30 days
    gps_enabled: bool
    last_lat: Optional[float] = None
    last_lng: Optional[float] = None
    last_speed_kmph: Optional[float] = None
    last_location_at: Optional[datetime] = None
    assigned_students: int = 0
    is_active: bool


class GpsKeyRead(BaseModel):
    vehicle_id: int
    gps_api_key: str


class VehicleLogCreate(BaseModel):
    kind: VehicleLogKind
    log_date: date
    odometer_km: Optional[int] = Field(None, ge=0)
    amount: Optional[Decimal] = Field(None, ge=0)
    litres: Optional[Decimal] = Field(None, ge=0)
    vendor: Optional[str] = Field(None, max_length=160)
    notes: Optional[str] = Field(None, max_length=2000)


class VehicleLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vehicle_id: int
    kind: VehicleLogKind
    log_date: date
    odometer_km: Optional[int] = None
    amount: Optional[Decimal] = None
    litres: Optional[Decimal] = None
    vendor: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime


# --- Routes & stops ---

class StopIn(BaseModel):
    """A stop in a route's ordered stop list. `id` set = update existing."""

    id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=160)
    pickup_time: Optional[time] = None
    drop_time: Optional[time] = None
    monthly_fee: Optional[Decimal] = Field(None, ge=0)
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)


class RouteCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    code: str = Field(..., min_length=1, max_length=20)
    vehicle_id: Optional[int] = None
    monthly_fee: Decimal = Field(Decimal("0"), ge=0)
    distance_km: Optional[Decimal] = Field(None, ge=0, le=1000)
    stops: list[StopIn] = []


class RouteUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    vehicle_id: Optional[int] = None
    monthly_fee: Optional[Decimal] = Field(None, ge=0)
    distance_km: Optional[Decimal] = Field(None, ge=0, le=1000)
    is_active: Optional[bool] = None
    # When present, replaces the stop list (order = sequence). Stops that are
    # dropped but still have students assigned block the update.
    stops: Optional[list[StopIn]] = None


class StopRead(BaseModel):
    id: int
    name: str
    sequence: int
    pickup_time: Optional[time] = None
    drop_time: Optional[time] = None
    monthly_fee: Optional[Decimal] = None
    effective_fee: Decimal
    lat: Optional[float] = None
    lng: Optional[float] = None
    student_count: int = 0


class RouteRead(BaseModel):
    id: int
    name: str
    code: str
    vehicle_id: Optional[int] = None
    vehicle_label: Optional[str] = None
    vehicle_capacity: Optional[int] = None
    monthly_fee: Decimal
    distance_km: Optional[Decimal] = None
    # straight-line stop-to-stop length from the stops' coordinates, when set
    stops_distance_km: Optional[float] = None
    is_active: bool
    stops: list[StopRead]
    student_count: int


# --- Assignments ---

class AssignmentCreate(BaseModel):
    student_id: int
    route_id: int
    stop_id: int
    direction: TransportDirection = TransportDirection.both
    start_date: Optional[date] = None  # defaults to today


class AssignmentUpdate(BaseModel):
    """Correct a running assignment. The route is changed by assigning again."""

    stop_id: Optional[int] = None
    direction: Optional[TransportDirection] = None
    start_date: Optional[date] = None


class AssignmentRead(BaseModel):
    id: int
    student_id: int
    student_name: str
    admission_no: str
    section_label: Optional[str] = None
    route_id: int
    route_name: str
    stop_id: int
    stop_name: str
    pickup_time: Optional[time] = None
    drop_time: Optional[time] = None
    direction: TransportDirection
    monthly_fee: Decimal
    start_date: date
    end_date: Optional[date] = None


class AssignmentEnd(BaseModel):
    end_date: Optional[date] = None  # defaults to today


# --- Trips ---

class TripCreate(BaseModel):
    route_id: int
    trip_date: date
    direction: TripDirection


class TripUpdate(BaseModel):
    status: Optional[TripStatus] = None
    start_odometer_km: Optional[int] = Field(None, ge=0)
    end_odometer_km: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = Field(None, max_length=2000)

    @model_validator(mode="after")
    def _check(self):
        if (
            self.start_odometer_km is not None
            and self.end_odometer_km is not None
            and self.end_odometer_km < self.start_odometer_km
        ):
            raise ValueError("end_odometer_km must be >= start_odometer_km")
        return self


class BoardingMark(BaseModel):
    student_id: int
    status: BoardingStatus


class BoardingBulk(BaseModel):
    marks: list[BoardingMark] = Field(..., min_length=1)


class TripStudent(BaseModel):
    student_id: int
    student_name: str
    section_label: Optional[str] = None
    stop_id: int
    stop_name: str
    stop_sequence: int
    status: Optional[BoardingStatus] = None
    marked_at: Optional[datetime] = None


class TripRead(BaseModel):
    id: int
    route_id: int
    route_name: str
    vehicle_id: Optional[int] = None
    vehicle_label: Optional[str] = None
    driver_name: Optional[str] = None
    trip_date: date
    direction: TripDirection
    status: TripStatus
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    start_odometer_km: Optional[int] = None
    end_odometer_km: Optional[int] = None
    distance_km: Optional[int] = None
    notes: Optional[str] = None
    expected: int
    boarded: int
    absent: int


class TripDetail(TripRead):
    students: list[TripStudent]


# --- Fees, GPS, dashboard, parent ---

class TransportFeeGenerate(BaseModel):
    fee_head_id: int
    period: str = Field(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    due_day: int = Field(10, ge=1, le=31)


class TransportFeeResult(BaseModel):
    period: str
    created: int
    skipped: int
    total_amount: Decimal


class GpsPing(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    speed_kmph: Optional[float] = Field(None, ge=0, le=300)
    recorded_at: Optional[datetime] = None


class LocationPoint(BaseModel):
    lat: float
    lng: float
    speed_kmph: Optional[float] = None
    recorded_at: datetime


class TransportDashboard(BaseModel):
    vehicles: int
    active_routes: int
    students_using_transport: int
    seats_total: int
    trips_today: int
    trips_in_progress: int
    expiring_documents: list[dict]
    overloaded_routes: list[dict]


class ChildTransport(BaseModel):
    route_name: str
    stop_name: str
    pickup_time: Optional[time] = None
    drop_time: Optional[time] = None
    direction: TransportDirection
    vehicle_label: Optional[str] = None
    registration_no: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    last_lat: Optional[float] = None
    last_lng: Optional[float] = None
    last_location_at: Optional[datetime] = None
    today: list[dict] = []  # [{direction, trip_status, boarding_status, marked_at}]
