from datetime import date
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Date,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

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

    user: Mapped[User] = relationship()
