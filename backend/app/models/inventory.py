from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AssetEventKind, AssetStatus, StockMoveKind, StorePayment
from app.database import Base
from app.models.base import PrimaryKeyMixin, TimestampMixin


class _School:
    tenant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    school_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False
    )


class Supplier(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Vendors for purchases and expenses."""

    __tablename__ = "suppliers"
    __table_args__ = (Index("ix_suppliers_school", "school_id"),)

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    contact_person: Mapped[Optional[str]] = mapped_column(String(120))
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    gstin: Mapped[Optional[str]] = mapped_column(String(15))
    address: Mapped[Optional[str]] = mapped_column(Text)
    # What they supply: "Stationery", "Lab equipment", "IT"
    category: Mapped[Optional[str]] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class InventoryItem(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Consumables and store stock (stationery, uniforms, lab chemicals...).
    Quantity on hand is the sum of StockMove rows."""

    __tablename__ = "inventory_items"
    __table_args__ = (
        UniqueConstraint("school_id", "sku", name="uq_inventory_item_sku"),
        Index("ix_inventory_items_school", "school_id"),
    )

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    sku: Mapped[str] = mapped_column(String(40), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(80))
    unit: Mapped[str] = mapped_column(String(20), default="pcs", nullable=False)
    reorder_level: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    is_sellable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sale_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    location: Mapped[Optional[str]] = mapped_column(String(80))
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class StockMove(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Stock ledger. `qty` is always positive; the kind says in or out."""

    __audited__ = True

    __tablename__ = "stock_moves"
    __table_args__ = (Index("ix_stock_moves_item_date", "item_id", "moved_on"),)

    item_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[StockMoveKind] = mapped_column(SAEnum(StockMoveKind, name="stock_move_kind"), nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    moved_on: Mapped[date] = mapped_column(Date, nullable=False)
    supplier_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("suppliers.id", ondelete="SET NULL")
    )
    reference: Mapped[Optional[str]] = mapped_column(String(80))  # invoice / challan no.
    issued_to: Mapped[Optional[str]] = mapped_column(String(160))  # department, lab, person
    # Where the stock went into (a receipt) or came out of / went to (an issue):
    # "Main store", "Science lab shelf 2".
    location: Mapped[Optional[str]] = mapped_column(String(80))
    store_sale_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("store_sales.id", ondelete="CASCADE")
    )
    notes: Mapped[Optional[str]] = mapped_column(String(300))
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class Asset(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """Durable items tracked one by one (projectors, computers, furniture)."""

    __audited__ = True

    __tablename__ = "assets"
    __table_args__ = (
        UniqueConstraint("school_id", "asset_tag", name="uq_asset_tag"),
        Index("ix_assets_school_status", "school_id", "status"),
    )

    asset_tag: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(80))
    serial_no: Mapped[Optional[str]] = mapped_column(String(80))
    location: Mapped[Optional[str]] = mapped_column(String(120))
    assigned_to_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    status: Mapped[AssetStatus] = mapped_column(SAEnum(AssetStatus, name="asset_status"), nullable=False)
    purchase_date: Mapped[Optional[date]] = mapped_column(Date)
    cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    supplier_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("suppliers.id", ondelete="SET NULL")
    )
    warranty_until: Mapped[Optional[date]] = mapped_column(Date)
    # How often this wants servicing. Null means nobody has said it needs
    # any, which is why an asset without one never appears on the due list
    # rather than appearing as overdue forever.
    service_every_days: Mapped[Optional[int]] = mapped_column(Integer)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class AssetEvent(Base, PrimaryKeyMixin, TimestampMixin):
    __tablename__ = "asset_events"
    __table_args__ = (Index("ix_asset_events_asset", "asset_id"),)

    asset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[AssetEventKind] = mapped_column(SAEnum(AssetEventKind, name="asset_event_kind"), nullable=False)
    happened_on: Mapped[date] = mapped_column(Date, nullable=False)
    to_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    location: Mapped[Optional[str]] = mapped_column(String(120))
    cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    notes: Mapped[Optional[str]] = mapped_column(String(300))
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class StoreSale(Base, PrimaryKeyMixin, TimestampMixin, _School):
    """School store bill: uniforms, books, stationery sold to a student."""

    __audited__ = True

    __tablename__ = "store_sales"
    __table_args__ = (
        UniqueConstraint("school_id", "bill_no", name="uq_store_bill_no"),
        Index("ix_store_sales_student", "student_id"),
    )

    bill_no: Mapped[str] = mapped_column(String(30), nullable=False)
    student_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("students.id", ondelete="SET NULL")
    )
    buyer_name: Mapped[Optional[str]] = mapped_column(String(160))  # walk-in buyer
    sold_on: Mapped[date] = mapped_column(Date, nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment: Mapped[StorePayment] = mapped_column(SAEnum(StorePayment, name="store_payment"), nullable=False)
    student_fee_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("student_fees.id", ondelete="SET NULL")
    )
    is_void: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sold_by_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )


class StoreSaleLine(Base, PrimaryKeyMixin):
    __tablename__ = "store_sale_lines"

    sale_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("store_sales.id", ondelete="CASCADE"), nullable=False
    )
    item_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False
    )
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
