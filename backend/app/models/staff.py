from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import EmploymentType
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin
from app.models.user import User


class Staff(Base, PrimaryKeyMixin, TimestampMixin):
    """HR profile for a teacher or non-teaching staff user.

    1:1 with User. Activation state is driven by User.is_active so login and
    HR record stay consistent.
    """

    __tablename__ = "staff"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_staff_user_id"),
        UniqueConstraint(
            "school_id", "employee_no", name="uq_staff_employee_no_per_school"
        ),
        Index("ix_staff_school_id", "school_id"),
        Index("ix_staff_tenant_id", "tenant_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    employee_no: Mapped[str] = mapped_column(String(40), nullable=False)
    branch_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("branches.id", ondelete="SET NULL")
    )
    designation: Mapped[Optional[str]] = mapped_column(String(120))
    joining_date: Mapped[Optional[date]] = mapped_column(Date)
    department_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("departments.id", ondelete="SET NULL")
    )
    department = relationship("Department", lazy="joined")

    # A one-line summary for the record; the evidence (each degree, its
    # certificate, who verified it) stays in staff_qualifications.
    qualification_summary: Mapped[Optional[str]] = mapped_column(String(200))
    experience_years: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 1))
    address: Mapped[Optional[str]] = mapped_column(Text)
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String(160))
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String(20))
    emergency_contact_relation: Mapped[Optional[str]] = mapped_column(String(60))
    employment_type: Mapped[Optional[EmploymentType]] = mapped_column(
        SAEnum(EmploymentType, name="employment_type")
    )
    reporting_manager_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("staff.id", ondelete="SET NULL")
    )

    # Workload limits the school sets for this person. Capacity is a number
    # the school chose, not one this code invents; teaching periods are still
    # counted off the timetable and never stored.
    max_periods_per_week: Mapped[Optional[int]] = mapped_column(SmallInteger)
    other_duty_periods: Mapped[Optional[int]] = mapped_column(SmallInteger)
    other_duties: Mapped[Optional[str]] = mapped_column(String(300))

    # Somebody signing the onboarding checklist off, once every task is ticked.
    onboarding_completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    onboarding_completed_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )

    user: Mapped[User] = relationship(foreign_keys=[user_id])
