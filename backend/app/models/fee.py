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
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import FeeStatus, LateFeeType
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class FeeHead(Base, PrimaryKeyMixin, TimestampMixin):
    """A fee category (Tuition, Transport, Lab, etc.)."""

    __tablename__ = "fee_heads"
    __table_args__ = (
        UniqueConstraint("school_id", "code", name="uq_fee_head_code_per_school"),
        Index("ix_fee_heads_school_id", "school_id"),
        Index("ix_fee_heads_tenant_id", "tenant_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    is_recurring: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
        comment="True = monthly auto-generation; False = one-time (e.g. admission)",
    )
    late_fee_type: Mapped[LateFeeType] = mapped_column(
        SAEnum(LateFeeType, name="late_fee_type"),
        default=LateFeeType.none,
        nullable=False,
    )
    late_fee_value: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0, nullable=False,
        comment="% if late_fee_type=percent; flat amount if fixed; 0 otherwise",
    )
    late_fee_after_days: Mapped[int] = mapped_column(
        SmallInteger, default=0, nullable=False,
        comment="Grace days past due_date before late fee kicks in",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class FeeStructure(Base, PrimaryKeyMixin, TimestampMixin):
    """Amount of a fee head for a specific class+academic year."""

    __tablename__ = "fee_structures"
    __table_args__ = (
        UniqueConstraint(
            "class_id", "fee_head_id", "academic_year_id",
            name="uq_fee_structure_per_class_head_year",
        ),
        Index("ix_fee_structures_school_id", "school_id"),
        Index("ix_fee_structures_tenant_id", "tenant_id"),
        Index("ix_fee_structures_class_id", "class_id"),
        Index("ix_fee_structures_fee_head_id", "fee_head_id"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    academic_year_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("academic_years.id", ondelete="CASCADE"), nullable=False
    )
    class_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("school_classes.id", ondelete="CASCADE"), nullable=False
    )
    fee_head_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("fee_heads.id", ondelete="RESTRICT"), nullable=False
    )

    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    due_day_of_month: Mapped[int] = mapped_column(
        SmallInteger, default=10, nullable=False,
        comment="1-31; used to compute due_date when generating monthly fees",
    )


class FeeStructureName(Base, PrimaryKeyMixin, TimestampMixin):
    """The name a school gives one class's fee structure for a year
    ("Grade 5 · Day scholar 2026-27"). The structure itself is still its
    lines in fee_structures; this only labels the set."""

    __tablename__ = "fee_structure_names"
    __table_args__ = (
        UniqueConstraint("school_id", "academic_year_id", "class_id", name="uq_fee_structure_name"),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    academic_year_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("academic_years.id", ondelete="CASCADE"), nullable=False
    )
    class_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("school_classes.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)


class StudentFee(Base, PrimaryKeyMixin, TimestampMixin):
    """A single fee line item for one student for one period.

    Recurring head: one row per period (YYYY-MM). One-time head: period='ONETIME'.
    Snapshot of amount at generation time; never auto-updated by changes to FeeStructure.
    """

    __audited__ = True
    __tablename__ = "student_fees"
    __table_args__ = (
        UniqueConstraint(
            "student_id", "fee_structure_id", "period",
            name="uq_student_fee_per_period",
        ),
        Index("ix_student_fees_school_id", "school_id"),
        Index("ix_student_fees_tenant_id", "tenant_id"),
        Index("ix_student_fees_student_id", "student_id"),
        Index("ix_student_fees_period", "period"),
        Index("ix_student_fees_status", "status"),
        Index(
            "uq_student_fee_per_source_period",
            "student_id", "source", "source_id", "period",
            unique=True,
            postgresql_where=text("source IS NOT NULL"),
        ),
    )

    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    # NULL for fees raised by other modules (transport, hostel, library fines);
    # those carry `source` + `source_id` instead.
    fee_structure_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("fee_structures.id", ondelete="RESTRICT"), nullable=True
    )
    source: Mapped[Optional[str]] = mapped_column(
        String(30), comment="Module that raised the fee: 'transport', 'hostel', ..."
    )
    source_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, comment="Row id in the source module, e.g. transport_assignments.id"
    )
    # Denormalized for fast filtering / display
    fee_head_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("fee_heads.id", ondelete="RESTRICT"), nullable=False
    )

    period: Mapped[str] = mapped_column(
        String(7), nullable=False,
        comment="'YYYY-MM' for recurring, 'ONETIME' for one-time",
    )
    amount_due: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)

    status: Mapped[FeeStatus] = mapped_column(
        SAEnum(FeeStatus, name="fee_status"),
        default=FeeStatus.pending,
        nullable=False,
    )

    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    payment_ref: Mapped[Optional[str]] = mapped_column(String(120))
    payment_mode: Mapped[Optional[str]] = mapped_column(String(40))
    notes: Mapped[Optional[str]] = mapped_column(String(300))

    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
