from datetime import time
from typing import Optional

from sqlalchemy import BigInteger, Enum as SAEnum, ForeignKey, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import SchoolStatus, TenantStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, SoftDeleteMixin, TimestampMixin


class Tenant(Base, PrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500))
    address: Mapped[Optional[str]] = mapped_column(Text)
    contact_person: Mapped[Optional[str]] = mapped_column(String(120))
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_mobile: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[TenantStatus] = mapped_column(
        SAEnum(TenantStatus, name="tenant_status"),
        default=TenantStatus.active,
        nullable=False,
        index=True,
    )

    schools: Mapped[list["School"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


class School(Base, PrimaryKeyMixin, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "schools"

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500))
    address: Mapped[Optional[str]] = mapped_column(Text)
    timezone: Mapped[str] = mapped_column(String(60), default="Asia/Kolkata", nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="INR", nullable=False)
    status: Mapped[SchoolStatus] = mapped_column(
        SAEnum(SchoolStatus, name="school_status"),
        default=SchoolStatus.active,
        nullable=False,
    )

    # --- Branding (Story 21.1) ---
    brand_color: Mapped[Optional[str]] = mapped_column(String(7))  # '#RRGGBB'
    app_name: Mapped[Optional[str]] = mapped_column(String(60))

    # --- Profile fields (Story 2.1) ---
    principal_name: Mapped[Optional[str]] = mapped_column(String(160))
    phone_primary: Mapped[Optional[str]] = mapped_column(String(20))
    phone_secondary: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    # Comma-separated abbreviations: "MON,TUE,WED,THU,FRI" or "MON,TUE,WED,THU,FRI,SAT"
    working_days: Mapped[str] = mapped_column(
        String(40), default="MON,TUE,WED,THU,FRI,SAT", nullable=False
    )
    school_start_time: Mapped[Optional[time]] = mapped_column(Time)
    school_end_time: Mapped[Optional[time]] = mapped_column(Time)
    break_start_time: Mapped[Optional[time]] = mapped_column(Time)
    break_end_time: Mapped[Optional[time]] = mapped_column(Time)

    tenant: Mapped[Tenant] = relationship(back_populates="schools")
