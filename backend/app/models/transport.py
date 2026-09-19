from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import (
    BoardingStatus,
    CrewRole,
    TransportDirection,
    TripDirection,
    TripStatus,
    VehicleKind,
    VehicleLogKind,
)
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _SchoolScoped:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class TransportCrew(Base, PrimaryKeyMixin, TimestampMixin, _SchoolScoped):
    """Drivers, conductors and bus attendants. Most don't need a system login,
    so they're kept separate from Staff."""

    __tablename__ = "transport_crew"
    __table_args__ = (Index("ix_transport_crew_school_id", "school_id"),)

    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    role: Mapped[CrewRole] = mapped_column(
        SAEnum(CrewRole, name="crew_role"), nullable=False
    )
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    license_no: Mapped[Optional[str]] = mapped_column(String(40))
    license_expiry: Mapped[Optional[date]] = mapped_column(Date)
    address: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Vehicle(Base, PrimaryKeyMixin, TimestampMixin, _SchoolScoped):
    __audited__ = True

    __tablename__ = "vehicles"
    __table_args__ = (
        UniqueConstraint("school_id", "registration_no", name="uq_vehicle_reg_per_school"),
        Index("ix_vehicles_school_id", "school_id"),
    )

    registration_no: Mapped[str] = mapped_column(String(20), nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String(40))  # "Bus 7"
    kind: Mapped[VehicleKind] = mapped_column(
        SAEnum(VehicleKind, name="vehicle_kind"), default=VehicleKind.bus, nullable=False
    )
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    make_model: Mapped[Optional[str]] = mapped_column(String(80))
    driver_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("transport_crew.id", ondelete="SET NULL")
    )
    conductor_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("transport_crew.id", ondelete="SET NULL")
    )

    # Compliance documents — expiry dates drive the dashboard warnings.
    insurance_expiry: Mapped[Optional[date]] = mapped_column(Date)
    fitness_expiry: Mapped[Optional[date]] = mapped_column(Date)
    permit_expiry: Mapped[Optional[date]] = mapped_column(Date)
    pollution_expiry: Mapped[Optional[date]] = mapped_column(Date)

    # GPS: a tracker (or the driver's phone app) posts locations with this key.
    gps_api_key: Mapped[Optional[str]] = mapped_column(String(64), unique=True)
    last_lat: Mapped[Optional[float]] = mapped_column(Float)
    last_lng: Mapped[Optional[float]] = mapped_column(Float)
    last_speed_kmph: Mapped[Optional[float]] = mapped_column(Float)
    last_location_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class VehicleLog(Base, PrimaryKeyMixin, TimestampMixin):
    """Fuel fills, services and repairs."""

    __tablename__ = "vehicle_logs"
    __table_args__ = (Index("ix_vehicle_logs_vehicle", "vehicle_id", "log_date"),)

    vehicle_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[VehicleLogKind] = mapped_column(
        SAEnum(VehicleLogKind, name="vehicle_log_kind"), nullable=False
    )
    log_date: Mapped[date] = mapped_column(Date, nullable=False)
    odometer_km: Mapped[Optional[int]] = mapped_column(Integer)
    amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    litres: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2))
    vendor: Mapped[Optional[str]] = mapped_column(String(160))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class VehicleLocation(Base, PrimaryKeyMixin):
    """GPS breadcrumb trail for trip playback."""

    __tablename__ = "vehicle_locations"
    __table_args__ = (Index("ix_vehicle_locations_vehicle_time", "vehicle_id", "recorded_at"),)

    vehicle_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False
    )
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    speed_kmph: Mapped[Optional[float]] = mapped_column(Float)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class TransportRoute(Base, PrimaryKeyMixin, TimestampMixin, _SchoolScoped):
    __audited__ = True

    __tablename__ = "transport_routes"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_transport_route_code_per_school"),
        Index("ix_transport_routes_school_id", "school_id"),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    vehicle_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("vehicles.id", ondelete="SET NULL")
    )
    # Default monthly fee; a stop can override it (distance-based pricing).
    monthly_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class TransportStop(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "transport_stops"
    __table_args__ = (Index("ix_transport_stops_route", "route_id", "sequence"),)

    route_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("transport_routes.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    pickup_time: Mapped[Optional[time]] = mapped_column(Time)
    drop_time: Mapped[Optional[time]] = mapped_column(Time)
    monthly_fee: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    lat: Mapped[Optional[float]] = mapped_column(Float)
    lng: Mapped[Optional[float]] = mapped_column(Float)


class TransportAssignment(Base, PrimaryKeyMixin, TimestampMixin, _SchoolScoped):
    """A student using a route from a given stop. One active row per student;
    history is kept by closing (end_date) rather than deleting."""

    __audited__ = True

    __tablename__ = "transport_assignments"
    __table_args__ = (
        Index("ix_transport_assignments_school_id", "school_id"),
        Index("ix_transport_assignments_route", "route_id"),
        Index(
            "uq_transport_assignment_active_student",
            "student_id",
            unique=True,
            postgresql_where=text("end_date IS NULL"),
        ),
    )

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    route_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("transport_routes.id", ondelete="RESTRICT"), nullable=False
    )
    stop_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("transport_stops.id", ondelete="RESTRICT"), nullable=False
    )
    direction: Mapped[TransportDirection] = mapped_column(
        SAEnum(TransportDirection, name="transport_direction"),
        default=TransportDirection.both,
        nullable=False,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[date]] = mapped_column(Date)


class Trip(Base, PrimaryKeyMixin, TimestampMixin, _SchoolScoped):
    """One run of a route (morning pickup or afternoon drop) — the trip sheet."""

    __tablename__ = "transport_trips"
    __table_args__ = (
        UniqueConstraint("route_id", "trip_date", "direction", name="uq_trip_per_route_day_dir"),
        Index("ix_transport_trips_school_date", "school_id", "trip_date"),
    )

    route_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("transport_routes.id", ondelete="CASCADE"), nullable=False
    )
    vehicle_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("vehicles.id", ondelete="SET NULL")
    )
    driver_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("transport_crew.id", ondelete="SET NULL")
    )
    trip_date: Mapped[date] = mapped_column(Date, nullable=False)
    direction: Mapped[TripDirection] = mapped_column(
        SAEnum(TripDirection, name="trip_direction"), nullable=False
    )
    status: Mapped[TripStatus] = mapped_column(
        SAEnum(TripStatus, name="trip_status"), default=TripStatus.scheduled, nullable=False
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    start_odometer_km: Mapped[Optional[int]] = mapped_column(Integer)
    end_odometer_km: Mapped[Optional[int]] = mapped_column(Integer)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class TripBoarding(Base, PrimaryKeyMixin, TimestampMixin):
    """Boarding / drop attendance for one student on one trip."""

    __tablename__ = "transport_trip_boardings"
    __table_args__ = (
        UniqueConstraint("trip_id", "student_id", name="uq_trip_boarding_student"),
    )

    trip_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("transport_trips.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[BoardingStatus] = mapped_column(
        SAEnum(BoardingStatus, name="boarding_status"), nullable=False
    )
    marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    marked_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
