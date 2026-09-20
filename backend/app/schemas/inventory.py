from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.enums import AssetEventKind, AssetStatus, StockMoveKind, StorePayment


class SupplierIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    contact_person: Optional[str] = Field(None, max_length=120)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    gstin: Optional[str] = Field(None, pattern=r"^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$")
    address: Optional[str] = Field(None, max_length=1000)
    is_active: bool = True


class SupplierRead(SupplierIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class ItemIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    sku: Optional[str] = Field(None, max_length=40)  # auto if blank
    category: Optional[str] = Field(None, max_length=80)
    unit: str = Field("pcs", min_length=1, max_length=20)
    reorder_level: Decimal = Field(Decimal("0"), ge=0)
    is_sellable: bool = False
    sale_price: Optional[Decimal] = Field(None, ge=0)
    location: Optional[str] = Field(None, max_length=80)
    description: Optional[str] = Field(None, max_length=2000)
    is_active: bool = True

    @model_validator(mode="after")
    def _price(self):
        if self.is_sellable and self.sale_price is None:
            raise ValueError("Set a sale price for items sold in the store")
        return self


class ItemRead(ItemIn):
    id: int
    sku: str
    on_hand: Decimal
    low_stock: bool
    stock_value: Optional[Decimal] = None  # at average purchase cost


class StockMoveIn(BaseModel):
    item_id: int
    kind: StockMoveKind
    qty: Decimal = Field(..., gt=0)
    unit_cost: Optional[Decimal] = Field(None, ge=0)
    moved_on: Optional[date] = None
    supplier_id: Optional[int] = None
    reference: Optional[str] = Field(None, max_length=80)
    issued_to: Optional[str] = Field(None, max_length=160)
    notes: Optional[str] = Field(None, max_length=300)

    @model_validator(mode="after")
    def _check(self):
        if self.kind == StockMoveKind.sale:
            raise ValueError("Use the store to sell items")
        if self.kind == StockMoveKind.issue and not (self.issued_to or "").strip():
            raise ValueError("Say who the items were issued to")
        return self


class StockMoveRead(BaseModel):
    id: int
    item_id: int
    item_name: str
    kind: StockMoveKind
    direction: int  # +1 in, -1 out
    qty: Decimal
    unit_cost: Optional[Decimal] = None
    moved_on: date
    supplier_name: Optional[str] = None
    reference: Optional[str] = None
    issued_to: Optional[str] = None
    notes: Optional[str] = None
    recorded_by_name: Optional[str] = None
    balance_after: Optional[Decimal] = None


class AssetIn(BaseModel):
    asset_tag: Optional[str] = Field(None, max_length=40)  # auto if blank
    name: str = Field(..., min_length=1, max_length=160)
    category: Optional[str] = Field(None, max_length=80)
    serial_no: Optional[str] = Field(None, max_length=80)
    location: Optional[str] = Field(None, max_length=120)
    purchase_date: Optional[date] = None
    cost: Optional[Decimal] = Field(None, ge=0)
    supplier_id: Optional[int] = None
    warranty_until: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=2000)


class AssetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    category: Optional[str] = Field(None, max_length=80)
    serial_no: Optional[str] = Field(None, max_length=80)
    purchase_date: Optional[date] = None
    cost: Optional[Decimal] = Field(None, ge=0)
    supplier_id: Optional[int] = None
    warranty_until: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=2000)


class AssetEventIn(BaseModel):
    kind: AssetEventKind
    happened_on: Optional[date] = None
    to_user_id: Optional[int] = None
    location: Optional[str] = Field(None, max_length=120)
    cost: Optional[Decimal] = Field(None, ge=0)
    notes: Optional[str] = Field(None, max_length=300)


class AssetEventRead(BaseModel):
    id: int
    kind: AssetEventKind
    happened_on: date
    to_user_name: Optional[str] = None
    location: Optional[str] = None
    cost: Optional[Decimal] = None
    notes: Optional[str] = None
    recorded_by_name: Optional[str] = None


class AssetRead(BaseModel):
    id: int
    asset_tag: str
    name: str
    category: Optional[str] = None
    serial_no: Optional[str] = None
    location: Optional[str] = None
    assigned_to_user_id: Optional[int] = None
    assigned_to_name: Optional[str] = None
    status: AssetStatus
    purchase_date: Optional[date] = None
    cost: Optional[Decimal] = None
    supplier_name: Optional[str] = None
    warranty_until: Optional[date] = None
    warranty_active: bool = False
    maintenance_cost: Decimal = Decimal("0")
    notes: Optional[str] = None


class AssetDetail(AssetRead):
    events: list[AssetEventRead]


class SaleLineIn(BaseModel):
    item_id: int
    qty: Decimal = Field(..., gt=0)


class SaleIn(BaseModel):
    student_id: Optional[int] = None
    buyer_name: Optional[str] = Field(None, max_length=160)
    payment: StorePayment
    fee_head_id: Optional[int] = None  # required for add_to_fees
    lines: list[SaleLineIn] = Field(..., min_length=1, max_length=50)

    @model_validator(mode="after")
    def _check(self):
        if not self.student_id and not (self.buyer_name or "").strip():
            raise ValueError("Pick a student or enter the buyer's name")
        if self.payment == StorePayment.add_to_fees and (not self.student_id or not self.fee_head_id):
            raise ValueError("Adding to fees needs a student and a fee head")
        return self


class SaleLineRead(BaseModel):
    item_id: int
    item_name: str
    qty: Decimal
    unit_price: Decimal
    amount: Decimal


class SaleRead(BaseModel):
    id: int
    bill_no: str
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    buyer_name: Optional[str] = None
    sold_on: date
    total: Decimal
    payment: StorePayment
    is_void: bool
    sold_by_name: Optional[str] = None
    lines: list[SaleLineRead]
    created_at: datetime


class InventoryDashboard(BaseModel):
    items: int
    low_stock: list[dict]
    stock_value: Decimal
    assets: int
    assets_in_repair: int
    warranty_expiring: int
    store_sales_today: Decimal
    store_sales_month: Decimal


class AssignmentRead(BaseModel):
    """One spell of an asset being in someone's hands."""

    asset_id: int
    asset_tag: str
    asset_name: str
    event_id: int
    user_id: Optional[int]
    user_name: Optional[str]
    assigned_on: date
    returned_on: Optional[date]
    ended_by: Optional[str]
    location: Optional[str]
    notes: Optional[str]
