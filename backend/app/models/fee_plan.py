"""What one child is charged, when it differs from their class.

A fee structure says what a class pays. A concession (app/models/accounts.py)
says how much to take off one child's bill. Between them they cover most of
what a school needs, and neither is replaced here.

What neither can do is name a different number. A concession subtracts, so
"this child's tuition is two thousand flat" has to be expressed as a discount
off whatever the class currently pays — which is a sum somebody has to
recompute by hand every time the class fee moves, and which silently becomes
wrong when nobody does. And a concession cannot add: a child taking music
lessons their class does not take has no line to discount.

So an assignment does exactly two things a concession cannot:

    it sets the amount for a head outright, and
    it charges a head the child's class has no structure for.

Concessions still apply on top. An assignment decides what the charge is; a
concession decides what comes off it. Keeping them apart means a school can
say "she pays the reduced boarding rate, and she also gets the staff-ward
discount" without either fact having to be folded into the other.
"""
from datetime import date as date_type
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class StudentFeeAssignment(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """One child's own amount for one fee head, for one academic year."""

    __audited__ = True
    __tablename__ = "student_fee_assignments"
    __table_args__ = (
        # One live answer per child per head per year. Two rows both claiming
        # to be the amount is the ambiguity this table exists to remove.
        UniqueConstraint(
            "student_id", "fee_head_id", "academic_year_id",
            name="uq_assignment_per_student_head_year",
        ),
        Index("ix_assignments_student", "student_id"),
        Index("ix_assignments_school_year", "school_id", "academic_year_id"),
    )

    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    fee_head_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("fee_heads.id", ondelete="CASCADE"), nullable=False
    )
    academic_year_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("academic_years.id", ondelete="CASCADE"), nullable=False
    )

    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # 'YYYY-MM' pins it to one month; 'ONETIME' charges once; blank means every
    # period the head is generated for, which is the usual case.
    period: Mapped[Optional[str]] = mapped_column(String(7))
    due_day_of_month: Mapped[int] = mapped_column(SmallInteger, default=10, nullable=False)

    # Required. An amount that differs from the class without a stated reason
    # is the thing nobody can explain to a parent two years later.
    reason: Mapped[str] = mapped_column(Text, nullable=False)

    starts_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    ends_on: Mapped[Optional[date_type]] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    approved_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
