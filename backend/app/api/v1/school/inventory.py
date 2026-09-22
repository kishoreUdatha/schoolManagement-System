from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import InventoryManager, SchoolAdminOrAccountant
from app.core.enums import AssetStatus
from app.database import get_db
from app.schemas.inventory import (
    AssignmentRead,
    AssetDetail,
    AssetEventIn,
    AssetIn,
    AssetRead,
    AssetUpdate,
    InventoryDashboard,
    ItemIn,
    ItemRead,
    SaleIn,
    SaleRead,
    StockMoveIn,
    StockMoveRead,
    SupplierIn,
    SupplierRead,
)
from app.services import inventory_service as svc


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Actor = SchoolAdminOrAccountant


@router.get("/dashboard", response_model=InventoryDashboard)
def dashboard(current_user: InventoryManager, db: Db):
    return InventoryDashboard.model_validate(svc.dashboard(db, current_user.school_id))


# --- Suppliers ---

@router.get("/suppliers", response_model=list[SupplierRead])
def suppliers(current_user: InventoryManager, db: Db):
    return [SupplierRead.model_validate(s) for s in svc.list_suppliers(db, current_user.school_id)]


@router.post("/suppliers", response_model=SupplierRead, status_code=status.HTTP_201_CREATED)
def create_supplier(payload: SupplierIn, current_user: InventoryManager, db: Db):
    return SupplierRead.model_validate(svc.save_supplier(db, current_user, payload))


@router.put("/suppliers/{supplier_id}", response_model=SupplierRead)
def update_supplier(supplier_id: int, payload: SupplierIn, current_user: InventoryManager, db: Db):
    return SupplierRead.model_validate(svc.save_supplier(db, current_user, payload, supplier_id))


# --- Items & stock ---

@router.get("/items", response_model=list[ItemRead])
def items(
    current_user: InventoryManager,
    db: Db,
    q: Optional[str] = Query(None),
    sellable_only: bool = Query(False),
    low_only: bool = Query(False),
    category: Optional[str] = Query(None),
):
    return [ItemRead.model_validate(i) for i in svc.list_items(db, current_user.school_id, q=q, sellable_only=sellable_only, low_only=low_only, category=category)]


@router.post("/items", response_model=ItemRead, status_code=status.HTTP_201_CREATED)
def create_item(payload: ItemIn, current_user: InventoryManager, db: Db):
    i = svc.save_item(db, current_user, payload)
    return ItemRead.model_validate(svc.item_to_read(i, svc.on_hand(db, [i.id]).get(i.id, 0), None))


@router.put("/items/{item_id}", response_model=ItemRead)
def update_item(item_id: int, payload: ItemIn, current_user: InventoryManager, db: Db):
    i = svc.save_item(db, current_user, payload, item_id)
    return ItemRead.model_validate(svc.item_to_read(i, svc.on_hand(db, [i.id]).get(i.id, 0), svc.avg_cost(db, [i.id]).get(i.id)))


@router.get("/moves", response_model=list[StockMoveRead], summary="Stock ledger (one item's full history, or the last N days)")
def moves(current_user: InventoryManager, db: Db, item_id: Optional[int] = Query(None), days: int = Query(90, ge=1, le=730)):
    return [StockMoveRead.model_validate(m) for m in svc.ledger(db, current_user.school_id, item_id=item_id, days=days)]


@router.post("/moves", status_code=status.HTTP_201_CREATED, summary="Receive, issue, return, write off or adjust stock")
def record_move(payload: StockMoveIn, current_user: InventoryManager, db: Db):
    m = svc.record_move(db, current_user, payload)
    return {"id": m.id, "on_hand": svc.on_hand(db, [m.item_id]).get(m.item_id, 0)}


# --- Assets ---

@router.get("/assets", response_model=list[AssetRead])
def assets(
    current_user: InventoryManager,
    db: Db,
    q: Optional[str] = Query(None),
    status_filter: Optional[AssetStatus] = Query(None, alias="status"),
    assigned_to: Optional[int] = Query(None),
):
    return [AssetRead.model_validate(svc.asset_to_read(db, a)) for a in svc.list_assets(db, current_user.school_id, q=q, status_=status_filter, assigned_to=assigned_to)]


@router.post("/assets", response_model=AssetDetail, status_code=status.HTTP_201_CREATED)
def create_asset(payload: AssetIn, current_user: InventoryManager, db: Db):
    return AssetDetail.model_validate(svc.asset_to_read(db, svc.create_asset(db, current_user, payload), with_events=True))


@router.get("/assignments", response_model=list[AssignmentRead],
            summary="Who has been given what, across every asset")
def assignments(
    current_user: InventoryManager,
    db: Db,
    user_id: Optional[int] = None,
    asset_id: Optional[int] = None,
    open_only: bool = False,
):
    return svc.list_assignments(
        db, current_user.school_id, user_id=user_id, asset_id=asset_id, open_only=open_only
    )


@router.get("/assignments/{event_id}", response_model=AssignmentRead)
def assignment(event_id: int, current_user: InventoryManager, db: Db):
    return svc.get_assignment(db, event_id, current_user.school_id)


@router.get("/assets/{asset_id}", response_model=AssetDetail)
def get_asset(asset_id: int, current_user: InventoryManager, db: Db):
    a = svc._scoped(db, svc.Asset, asset_id, current_user.school_id, "Asset")
    return AssetDetail.model_validate(svc.asset_to_read(db, a, with_events=True))


@router.patch("/assets/{asset_id}", response_model=AssetDetail)
def update_asset(asset_id: int, payload: AssetUpdate, current_user: InventoryManager, db: Db):
    return AssetDetail.model_validate(svc.asset_to_read(db, svc.update_asset(db, asset_id, current_user, payload), with_events=True))


@router.post("/assets/{asset_id}/events", response_model=AssetDetail, summary="Assign, return, move, send for repair, repaired, dispose")
def asset_event(asset_id: int, payload: AssetEventIn, current_user: InventoryManager, db: Db):
    return AssetDetail.model_validate(svc.asset_to_read(db, svc.asset_event(db, asset_id, current_user, payload), with_events=True))


# --- Store ---

@router.get("/store/sales", response_model=list[SaleRead])
def sales(current_user: InventoryManager, db: Db, on: Optional[date] = Query(None), student_id: Optional[int] = Query(None)):
    return [SaleRead.model_validate(svc.sale_to_read(db, s)) for s in svc.list_sales(db, current_user.school_id, on=on, student_id=student_id)]


@router.post("/store/sales", response_model=SaleRead, status_code=status.HTTP_201_CREATED)
def sell(payload: SaleIn, current_user: InventoryManager, db: Db):
    return SaleRead.model_validate(svc.sale_to_read(db, svc.sell(db, current_user, payload)))


@router.post("/store/sales/{sale_id}/void", response_model=SaleRead)
def void(sale_id: int, current_user: InventoryManager, db: Db):
    return SaleRead.model_validate(svc.sale_to_read(db, svc.void_sale(db, sale_id, current_user)))
