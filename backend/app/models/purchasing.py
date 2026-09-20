"""Money going out to suppliers: what was ordered, what was billed, what was paid.

Three records rather than one, because they happen at different times and any
of them can be the last one. An order with no bill is money committed; a bill
with no payment is money owed; a payment with no bill is money nobody can
account for, which is why a payment hangs off a bill rather than off a
supplier.

Nothing here stores a balance. What a supplier is owed is their bills less
their payments, computed when asked — a stored figure is a second opinion that
drifts the first time a payment is corrected.
"""
from datetime import date as date_type
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Date,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import BillStatus, MoneyMode, PurchaseOrderStatus
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class PurchaseOrder(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """What the school asked a supplier to send."""

    __audited__ = True
    __tablename__ = "purchase_orders"
    __table_args__ = (
        UniqueConstraint("school_id", "order_no", name="uq_purchase_order_no_per_school"),
        Index("ix_purchase_orders_supplier", "supplier_id"),
        Index("ix_purchase_orders_school_status", "school_id", "status"),
    )

    supplier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False
    )
    order_no: Mapped[str] = mapped_column(String(40), nullable=False)
    ordered_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    expected_on: Mapped[Optional[date_type]] = mapped_column(Date)
    status: Mapped[PurchaseOrderStatus] = mapped_column(
        SAEnum(PurchaseOrderStatus, name="purchase_order_status"),
        default=PurchaseOrderStatus.draft,
        nullable=False,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    # Kept in step with the lines by the service rather than typed, so the
    # header and the lines cannot disagree about what was ordered.
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    raised_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class PurchaseOrderLine(Base, PrimaryKeyMixin, TimestampMixin):
    """One thing on an order. Scoped through its order, like a mark's parts."""

    __tablename__ = "purchase_order_lines"
    __table_args__ = (Index("ix_po_lines_order", "order_id"),)

    order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False
    )
    # Not everything a school buys is stocked — a plumber's call-out has no
    # inventory item to point at.
    item_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("inventory_items.id", ondelete="SET NULL")
    )
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    received_qty: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)


class VendorBill(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """What a supplier asked to be paid."""

    __audited__ = True
    __tablename__ = "vendor_bills"
    __table_args__ = (
        UniqueConstraint("school_id", "supplier_id", "bill_no", name="uq_vendor_bill_no"),
        Index("ix_vendor_bills_supplier", "supplier_id"),
        Index("ix_vendor_bills_school_status", "school_id", "status"),
        Index("ix_vendor_bills_due", "school_id", "due_on"),
    )

    supplier_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False
    )
    # A bill may arrive without an order behind it, and an order may never be
    # billed. Neither is an error.
    order_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("purchase_orders.id", ondelete="SET NULL")
    )
    bill_no: Mapped[str] = mapped_column(String(60), nullable=False)
    billed_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    due_on: Mapped[Optional[date_type]] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    status: Mapped[BillStatus] = mapped_column(
        SAEnum(BillStatus, name="bill_status"),
        default=BillStatus.unpaid,
        nullable=False,
    )
    document_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("documents.id", ondelete="SET NULL")
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)


class VendorPayment(Base, _School, PrimaryKeyMixin, TimestampMixin):
    """Money actually sent, against one bill."""

    __audited__ = True
    __tablename__ = "vendor_payments"
    __table_args__ = (
        Index("ix_vendor_payments_bill", "bill_id"),
        Index("ix_vendor_payments_school_date", "school_id", "paid_on"),
    )

    bill_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("vendor_bills.id", ondelete="CASCADE"), nullable=False
    )
    paid_on: Mapped[date_type] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    mode: Mapped[MoneyMode] = mapped_column(
        SAEnum(MoneyMode, name="money_mode"), nullable=False
    )
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    paid_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
