from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import PayrollRunStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


def _money(nullable: bool = False, default=0):
    return mapped_column(Numeric(12, 2), default=default, nullable=nullable)


class PayrollSettings(Base, PrimaryKeyMixin, TimestampMixin):
    """Statutory rates per school. Defaults follow current Indian rules
    (EPF 12% on wages capped at ₹15,000; ESI 0.75% / 3.25% under ₹21,000)."""

    __tablename__ = "payroll_settings"

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    pf_employee_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("12"), nullable=False)
    pf_employer_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("12"), nullable=False)
    pf_wage_ceiling: Mapped[Decimal] = _money(default=Decimal("15000"))
    esi_employee_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.75"), nullable=False)
    esi_employer_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("3.25"), nullable=False)
    esi_gross_ceiling: Mapped[Decimal] = _money(default=Decimal("21000"))
    default_professional_tax: Mapped[Decimal] = _money(default=Decimal("200"))


class StaffSalary(Base, PrimaryKeyMixin, TimestampMixin):
    """Monthly salary structure for one staff member. A new row with a later
    effective_from records a revision; the latest one on or before the payroll
    month applies."""

    __audited__ = True

    __tablename__ = "staff_salaries"
    __table_args__ = (
        UniqueConstraint("staff_id", "effective_from", name="uq_staff_salary_effective"),
        Index("ix_staff_salaries_school", "school_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    staff_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False
    )
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)

    basic: Mapped[Decimal] = _money()
    da: Mapped[Decimal] = _money()
    hra: Mapped[Decimal] = _money()
    conveyance: Mapped[Decimal] = _money()
    special_allowance: Mapped[Decimal] = _money()
    other_allowance: Mapped[Decimal] = _money()

    pf_applicable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    esi_applicable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    professional_tax: Mapped[Optional[Decimal]] = _money(nullable=True, default=None)  # None = school default
    tds_monthly: Mapped[Decimal] = _money()

    bank_name: Mapped[Optional[str]] = mapped_column(String(120))
    bank_account_no: Mapped[Optional[str]] = mapped_column(String(34))
    bank_ifsc: Mapped[Optional[str]] = mapped_column(String(11))
    pan: Mapped[Optional[str]] = mapped_column(String(10))
    uan: Mapped[Optional[str]] = mapped_column(String(12))


class PayrollRun(Base, PrimaryKeyMixin, TimestampMixin):
    __audited__ = True

    __tablename__ = "payroll_runs"
    __table_args__ = (UniqueConstraint("school_id", "period", name="uq_payroll_run_period"),)

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    period: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    status: Mapped[PayrollRunStatus] = mapped_column(
        SAEnum(PayrollRunStatus, name="payroll_run_status"),
        default=PayrollRunStatus.draft,
        nullable=False,
    )
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    finalized_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    finalized_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    paid_on: Mapped[Optional[date]] = mapped_column(Date)
    payment_ref: Mapped[Optional[str]] = mapped_column(String(120))


class Payslip(Base, PrimaryKeyMixin, TimestampMixin):
    """One staff member's pay for one run. Amounts are snapshots; editing a
    salary structure later doesn't change finalized slips."""

    __tablename__ = "payslips"
    __table_args__ = (
        UniqueConstraint("run_id", "staff_id", name="uq_payslip_per_run_staff"),
        Index("ix_payslips_user", "user_id"),
    )

    run_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("payroll_runs.id", ondelete="CASCADE"), nullable=False
    )
    staff_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    salary_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("staff_salaries.id", ondelete="SET NULL")
    )

    days_in_month: Mapped[int] = mapped_column(nullable=False)
    lop_days: Mapped[Decimal] = mapped_column(Numeric(5, 1), default=0, nullable=False)
    lop_days_auto: Mapped[Decimal] = mapped_column(Numeric(5, 1), default=0, nullable=False)

    # Earned (pro-rated) components
    basic: Mapped[Decimal] = _money()
    da: Mapped[Decimal] = _money()
    hra: Mapped[Decimal] = _money()
    conveyance: Mapped[Decimal] = _money()
    special_allowance: Mapped[Decimal] = _money()
    other_allowance: Mapped[Decimal] = _money()
    bonus: Mapped[Decimal] = _money()
    gross: Mapped[Decimal] = _money()

    pf_employee: Mapped[Decimal] = _money()
    esi_employee: Mapped[Decimal] = _money()
    professional_tax: Mapped[Decimal] = _money()
    tds: Mapped[Decimal] = _money()
    other_deduction: Mapped[Decimal] = _money()
    total_deductions: Mapped[Decimal] = _money()
    net_pay: Mapped[Decimal] = _money()

    pf_employer: Mapped[Decimal] = _money()
    esi_employer: Mapped[Decimal] = _money()

    remarks: Mapped[Optional[str]] = mapped_column(String(300))
