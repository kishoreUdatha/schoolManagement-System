"""Inventory (consumables + store stock), fixed assets and the school store."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import AssetEventKind, AssetStatus, FeeStatus, StockMoveKind, StorePayment, UserRole
from app.core.scoping import get_school_student
from app.models.fee import FeeHead, StudentFee
from app.models.inventory import Asset, AssetEvent, InventoryItem, StockMove, StoreSale, StoreSaleLine, Supplier
from app.models.student import Student
from app.models.user import User
from app.schemas.inventory import AssetEventIn, AssetIn, AssetUpdate, ItemIn, SaleIn, StockMoveIn, SupplierIn


ZERO = Decimal("0")
IN_KINDS = (StockMoveKind.purchase, StockMoveKind.return_in, StockMoveKind.adjustment_in)
FEE_SOURCE = "store"


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _400(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


def _scoped(db: Session, model, obj_id: Optional[int], school_id: int, what: str):
    if obj_id is None:
        return None
    o = db.get(model, obj_id)
    if not o or o.school_id != school_id:
        raise _404(what)
    return o


def direction(kind: StockMoveKind) -> int:
    return 1 if kind in IN_KINDS else -1


_signed = case((StockMove.kind.in_(IN_KINDS), StockMove.qty), else_=-StockMove.qty)


# --- Suppliers ---

def list_suppliers(db: Session, school_id: int) -> list[Supplier]:
    return list(db.execute(select(Supplier).where(Supplier.school_id == school_id).order_by(Supplier.is_active.desc(), Supplier.name)).scalars())


def save_supplier(db: Session, user: User, data: SupplierIn, supplier_id: Optional[int] = None) -> Supplier:
    s = _scoped(db, Supplier, supplier_id, user.school_id, "Supplier") if supplier_id else Supplier(tenant_id=user.tenant_id, school_id=user.school_id)
    for k, v in data.model_dump().items():
        setattr(s, k, v)
    if supplier_id is None:
        db.add(s)
    db.commit()
    db.refresh(s)
    return s


# --- Items & stock ---

def on_hand(db: Session, item_ids: list[int]) -> dict[int, Decimal]:
    if not item_ids:
        return {}
    return dict(db.execute(
        select(StockMove.item_id, func.coalesce(func.sum(_signed), 0)).where(StockMove.item_id.in_(item_ids)).group_by(StockMove.item_id)
    ).all())


def avg_cost(db: Session, item_ids: list[int]) -> dict[int, Decimal]:
    rows = db.execute(
        select(StockMove.item_id, func.sum(StockMove.qty * StockMove.unit_cost), func.sum(StockMove.qty))
        .where(StockMove.item_id.in_(item_ids), StockMove.kind == StockMoveKind.purchase, StockMove.unit_cost.is_not(None))
        .group_by(StockMove.item_id)
    ).all()
    return {i: (v / q) for i, v, q in rows if q}


def item_to_read(i: InventoryItem, qty, cost: Optional[Decimal]) -> dict:
    qty = Decimal(qty or 0).quantize(Decimal("0.01"))
    d = {k: getattr(i, k) for k in ItemIn.model_fields}
    d.update(id=i.id, sku=i.sku, on_hand=qty, low_stock=i.is_active and qty <= i.reorder_level and i.reorder_level > 0,
             stock_value=(qty * cost).quantize(Decimal("0.01")) if cost is not None and qty > 0 else None)
    return d


def list_items(db: Session, school_id: int, *, q: Optional[str] = None, sellable_only: bool = False,
               low_only: bool = False, category: Optional[str] = None) -> list[dict]:
    stmt = select(InventoryItem).where(InventoryItem.school_id == school_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(InventoryItem.name.ilike(like), InventoryItem.sku.ilike(like)))
    if sellable_only:
        stmt = stmt.where(InventoryItem.is_sellable.is_(True), InventoryItem.is_active.is_(True))
    if category:
        stmt = stmt.where(InventoryItem.category == category)
    items = list(db.execute(stmt.order_by(InventoryItem.is_active.desc(), InventoryItem.name)).scalars())
    ids = [i.id for i in items]
    qty, cost = on_hand(db, ids), avg_cost(db, ids)
    out = [item_to_read(i, Decimal(qty.get(i.id, 0)), cost.get(i.id)) for i in items]
    return [o for o in out if o["low_stock"]] if low_only else out


def _next_sku(db: Session, school_id: int) -> str:
    n = db.execute(select(func.count(InventoryItem.id)).where(InventoryItem.school_id == school_id)).scalar_one()
    return f"ITM{n + 1:05d}"


def save_item(db: Session, user: User, data: ItemIn, item_id: Optional[int] = None) -> InventoryItem:
    i = _scoped(db, InventoryItem, item_id, user.school_id, "Item") if item_id else InventoryItem(tenant_id=user.tenant_id, school_id=user.school_id)
    fields = data.model_dump()
    sku = (fields.pop("sku") or "").strip().upper()
    for k, v in fields.items():
        setattr(i, k, v)
    if sku:
        i.sku = sku
    elif item_id is None:
        i.sku = _next_sku(db, user.school_id)
    if item_id is None:
        db.add(i)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"SKU {sku} is already used")
    db.refresh(i)
    return i


def _lock_item(db: Session, item_id: int, school_id: int) -> InventoryItem:
    i = db.execute(select(InventoryItem).where(InventoryItem.id == item_id).with_for_update()).scalar_one_or_none()
    if not i or i.school_id != school_id:
        raise _404("Item")
    return i


def record_move(db: Session, user: User, data: StockMoveIn, *, commit: bool = True) -> StockMove:
    item = _lock_item(db, data.item_id, user.school_id)
    _scoped(db, Supplier, data.supplier_id, user.school_id, "Supplier")
    if data.kind == StockMoveKind.purchase and data.unit_cost is None:
        raise _400("Enter the purchase cost per unit")
    if direction(data.kind) < 0:
        have = Decimal(on_hand(db, [item.id]).get(item.id, 0))
        if data.qty > have:
            raise _400(f"Only {have:g} {item.unit} of {item.name} in stock")
    m = StockMove(tenant_id=user.tenant_id, school_id=user.school_id, recorded_by_user_id=user.id,
                  **{**data.model_dump(), "moved_on": data.moved_on or date.today()})
    db.add(m)
    if commit:
        db.commit()
        db.refresh(m)
    else:
        db.flush()
    return m


def ledger(db: Session, school_id: int, *, item_id: Optional[int] = None, days: int = 90) -> list[dict]:
    stmt = select(StockMove).where(StockMove.school_id == school_id)
    if item_id:
        stmt = stmt.where(StockMove.item_id == item_id)
    else:
        stmt = stmt.where(StockMove.moved_on >= date.today() - timedelta(days=days))
    moves = list(db.execute(stmt.order_by(StockMove.moved_on, StockMove.id)).scalars())
    names = dict(db.execute(select(InventoryItem.id, InventoryItem.name).where(InventoryItem.id.in_({m.item_id for m in moves}))).all()) if moves else {}
    sups = dict(db.execute(select(Supplier.id, Supplier.name).where(Supplier.id.in_({m.supplier_id for m in moves if m.supplier_id}))).all()) if moves else {}
    users = dict(db.execute(select(User.id, User.full_name).where(User.id.in_({m.recorded_by_user_id for m in moves if m.recorded_by_user_id}))).all()) if moves else {}
    running: dict[int, Decimal] = {}
    out = []
    for m in moves:
        d = direction(m.kind)
        running[m.item_id] = running.get(m.item_id, ZERO) + d * m.qty
        out.append({
            "id": m.id, "item_id": m.item_id, "item_name": names.get(m.item_id, ""), "kind": m.kind, "direction": d,
            "qty": m.qty, "unit_cost": m.unit_cost, "moved_on": m.moved_on, "supplier_name": sups.get(m.supplier_id),
            "reference": m.reference, "issued_to": m.issued_to, "notes": m.notes,
            "recorded_by_name": users.get(m.recorded_by_user_id),
            "balance_after": running[m.item_id] if item_id else None,  # only meaningful for a full item history
        })
    return list(reversed(out))


# --- Assets ---

def _next_tag(db: Session, school_id: int) -> str:
    n = db.execute(select(func.count(Asset.id)).where(Asset.school_id == school_id)).scalar_one()
    return f"AST{n + 1:05d}"


def _check_user(db: Session, school_id: int, user_id: Optional[int]) -> Optional[User]:
    if user_id is None:
        return None
    u = db.get(User, user_id)
    if not u or u.school_id != school_id or u.role in (UserRole.parent, UserRole.student):
        raise _404("Staff member")
    return u


def create_asset(db: Session, user: User, data: AssetIn) -> Asset:
    _scoped(db, Supplier, data.supplier_id, user.school_id, "Supplier")
    fields = data.model_dump()
    tag = (fields.pop("asset_tag") or "").strip().upper() or _next_tag(db, user.school_id)
    a = Asset(tenant_id=user.tenant_id, school_id=user.school_id, asset_tag=tag, status=AssetStatus.in_store, **fields)
    db.add(a)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Asset tag {tag} is already used")
    db.refresh(a)
    return a


def update_asset(db: Session, asset_id: int, user: User, data: AssetUpdate) -> Asset:
    a = _scoped(db, Asset, asset_id, user.school_id, "Asset")
    updates = data.model_dump(exclude_unset=True)
    if "supplier_id" in updates:
        _scoped(db, Supplier, updates["supplier_id"], user.school_id, "Supplier")
    for k, v in updates.items():
        setattr(a, k, v)
    db.commit()
    db.refresh(a)
    return a


_TRANSITIONS = {
    AssetEventKind.assigned: ({AssetStatus.in_store, AssetStatus.in_use}, AssetStatus.in_use),
    AssetEventKind.returned: ({AssetStatus.in_use}, AssetStatus.in_store),
    AssetEventKind.moved: ({AssetStatus.in_store, AssetStatus.in_use}, None),
    AssetEventKind.maintenance: ({AssetStatus.in_store, AssetStatus.in_use}, AssetStatus.under_repair),
    AssetEventKind.repaired: ({AssetStatus.under_repair}, AssetStatus.in_store),
    AssetEventKind.disposed: ({AssetStatus.in_store, AssetStatus.under_repair}, AssetStatus.disposed),
}


def asset_event(db: Session, asset_id: int, user: User, data: AssetEventIn) -> Asset:
    a = _scoped(db, Asset, asset_id, user.school_id, "Asset")
    allowed_from, to_status = _TRANSITIONS[data.kind]
    if a.status not in allowed_from:
        raise _400(f"Can't mark an asset that's {a.status.value.replace('_', ' ')} as {data.kind.value}")
    if data.kind == AssetEventKind.assigned and not (data.to_user_id or data.location):
        raise _400("Assign it to a staff member or a location")
    if data.kind == AssetEventKind.moved and not data.location:
        raise _400("Where was it moved to?")
    target = _check_user(db, user.school_id, data.to_user_id)
    db.add(AssetEvent(asset_id=a.id, kind=data.kind, happened_on=data.happened_on or date.today(),
                      to_user_id=target.id if target else None, location=data.location, cost=data.cost,
                      notes=data.notes, recorded_by_user_id=user.id))
    if data.kind == AssetEventKind.assigned:
        a.assigned_to_user_id = target.id if target else None
        if data.location:
            a.location = data.location
    elif data.kind in (AssetEventKind.returned, AssetEventKind.disposed):
        a.assigned_to_user_id = None
        if data.location:
            a.location = data.location
    elif data.kind == AssetEventKind.moved:
        a.location = data.location
    if to_status:
        a.status = to_status
    db.commit()
    db.refresh(a)
    return a


def asset_to_read(db: Session, a: Asset, *, with_events: bool = False) -> dict:
    who = db.get(User, a.assigned_to_user_id) if a.assigned_to_user_id else None
    sup = db.get(Supplier, a.supplier_id) if a.supplier_id else None
    maint = db.execute(select(func.coalesce(func.sum(AssetEvent.cost), 0)).where(AssetEvent.asset_id == a.id)).scalar_one()
    d = {k: getattr(a, k) for k in ("id", "asset_tag", "name", "category", "serial_no", "location", "assigned_to_user_id",
                                     "status", "purchase_date", "cost", "warranty_until", "notes")}
    d.update(assigned_to_name=who.full_name if who else None, supplier_name=sup.name if sup else None,
             warranty_active=bool(a.warranty_until and a.warranty_until >= date.today()), maintenance_cost=maint)
    if with_events:
        evs = db.execute(select(AssetEvent).where(AssetEvent.asset_id == a.id).order_by(AssetEvent.happened_on.desc(), AssetEvent.id.desc())).scalars()
        d["events"] = []
        for e in evs:
            to = db.get(User, e.to_user_id) if e.to_user_id else None
            by = db.get(User, e.recorded_by_user_id) if e.recorded_by_user_id else None
            d["events"].append({"id": e.id, "kind": e.kind, "happened_on": e.happened_on, "to_user_name": to.full_name if to else None,
                                "location": e.location, "cost": e.cost, "notes": e.notes, "recorded_by_name": by.full_name if by else None})
    return d


def list_assets(db: Session, school_id: int, *, q: Optional[str] = None, status_: Optional[AssetStatus] = None,
                assigned_to: Optional[int] = None) -> list[Asset]:
    stmt = select(Asset).where(Asset.school_id == school_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Asset.name.ilike(like), Asset.asset_tag.ilike(like), Asset.serial_no.ilike(like), Asset.location.ilike(like)))
    if status_:
        stmt = stmt.where(Asset.status == status_)
    else:
        stmt = stmt.where(Asset.status != AssetStatus.disposed)
    if assigned_to:
        stmt = stmt.where(Asset.assigned_to_user_id == assigned_to)
    return list(db.execute(stmt.order_by(Asset.asset_tag)).scalars())


def list_assignments(db: Session, school_id: int, *, user_id: Optional[int] = None,
                     asset_id: Optional[int] = None, open_only: bool = False,
                     limit: int = 300) -> list[dict]:
    """Who has been given what, across every asset.

    An assignment isn't a row of its own — it is the "assigned" event plus
    whatever ended it (a return, a disposal, or being handed to someone else). This walks each asset's
    events in order and pairs them up, so the office can answer "what is out,
    and who has had this laptop?" without opening assets one at a time.
    """
    stmt = (
        select(AssetEvent, Asset)
        .join(Asset, Asset.id == AssetEvent.asset_id)
        .where(Asset.school_id == school_id)
        .order_by(AssetEvent.asset_id, AssetEvent.happened_on, AssetEvent.id)
    )
    if asset_id:
        stmt = stmt.where(AssetEvent.asset_id == asset_id)
    rows = list(db.execute(stmt))

    # a move only changes where the thing is, not who holds it
    ENDINGS = {AssetEventKind.returned, AssetEventKind.disposed}
    open_by_asset: dict[int, dict] = {}
    out: list[dict] = []
    for event, asset in rows:
        if event.kind == AssetEventKind.assigned:
            if event.asset_id in open_by_asset:  # reassigned without a return
                prev = open_by_asset.pop(event.asset_id)
                prev.update(returned_on=event.happened_on, ended_by="reassigned")
                out.append(prev)
            who = db.get(User, event.to_user_id) if event.to_user_id else None
            open_by_asset[event.asset_id] = {
                "asset_id": asset.id,
                "asset_tag": asset.asset_tag,
                "asset_name": asset.name,
                "event_id": event.id,
                "user_id": event.to_user_id,
                "user_name": who.full_name if who else None,
                "assigned_on": event.happened_on,
                "returned_on": None,
                "ended_by": None,
                "location": event.location,
                "notes": event.notes,
            }
        elif event.kind in ENDINGS and event.asset_id in open_by_asset:
            row = open_by_asset.pop(event.asset_id)
            row.update(returned_on=event.happened_on, ended_by=event.kind.value)
            out.append(row)
    out.extend(open_by_asset.values())

    if user_id:
        out = [r for r in out if r["user_id"] == user_id]
    if open_only:
        out = [r for r in out if r["returned_on"] is None]
    out.sort(key=lambda r: (r["returned_on"] is not None, r["assigned_on"]), reverse=True)
    return out[:limit]


def get_assignment(db: Session, event_id: int, school_id: int) -> dict:
    """One assignment, found by the event that started it."""
    event = db.get(AssetEvent, event_id)
    if not event or event.kind != AssetEventKind.assigned:
        raise _404("Assignment")
    asset = db.get(Asset, event.asset_id)
    if not asset or asset.school_id != school_id:
        raise _404("Assignment")
    for row in list_assignments(db, school_id, asset_id=asset.id, limit=1000):
        if row["event_id"] == event_id:
            return row
    raise _404("Assignment")


# --- Store ---

def _next_bill_no(db: Session, school_id: int, on: date) -> str:
    n = db.execute(
        select(func.count(StoreSale.id)).where(StoreSale.school_id == school_id, StoreSale.bill_no.like(f"ST{on:%y%m}-%"))
    ).scalar_one()
    return f"ST{on:%y%m}-{n + 1:04d}"


def sell(db: Session, user: User, data: SaleIn) -> StoreSale:
    student = get_school_student(db, data.student_id, user.school_id) if data.student_id else None
    head = None
    if data.payment == StorePayment.add_to_fees:
        head = db.get(FeeHead, data.fee_head_id)
        if not head or head.school_id != user.school_id:
            raise _404("Fee head")
    today = date.today()
    # Lock items in id order so two counters can't oversell or deadlock.
    merged: dict[int, Decimal] = {}
    for line in data.lines:
        merged[line.item_id] = merged.get(line.item_id, ZERO) + line.qty
    items = {iid: _lock_item(db, iid, user.school_id) for iid in sorted(merged)}
    stock = on_hand(db, list(items))
    lines = []
    for iid, qty in merged.items():
        it = items[iid]
        if not it.is_sellable or not it.is_active or it.sale_price is None:
            raise _400(f"{it.name} isn't sold in the store")
        have = Decimal(stock.get(iid, 0))
        if qty > have:
            raise _400(f"Only {have:g} {it.unit} of {it.name} in stock")
        lines.append((it, qty, it.sale_price, (qty * it.sale_price).quantize(Decimal("0.01"))))
    total = sum((l[3] for l in lines), ZERO)
    sale = None
    for _ in range(3):
        sale = StoreSale(tenant_id=user.tenant_id, school_id=user.school_id, bill_no=_next_bill_no(db, user.school_id, today),
                         student_id=student.id if student else None, buyer_name=(data.buyer_name or "").strip() or None,
                         sold_on=today, total=total, payment=data.payment, sold_by_user_id=user.id)
        try:
            with db.begin_nested():
                db.add(sale)
                db.flush()
            break
        except IntegrityError:
            continue
    for it, qty, price, amount in lines:
        db.add(StoreSaleLine(sale_id=sale.id, item_id=it.id, qty=qty, unit_price=price, amount=amount))
        db.add(StockMove(tenant_id=user.tenant_id, school_id=user.school_id, item_id=it.id, kind=StockMoveKind.sale,
                         qty=qty, unit_cost=None, moved_on=today, reference=sale.bill_no, store_sale_id=sale.id,
                         issued_to=student.full_name if student else sale.buyer_name, recorded_by_user_id=user.id))
    if head and student:
        sf = StudentFee(tenant_id=user.tenant_id, school_id=user.school_id, student_id=student.id, fee_structure_id=None,
                        source=FEE_SOURCE, source_id=sale.id, fee_head_id=head.id, period=today.strftime("%Y-%m"),
                        amount_due=total, amount_paid=ZERO, due_date=today + timedelta(days=15), status=FeeStatus.pending,
                        notes=f"Store bill {sale.bill_no}")
        db.add(sf)
        db.flush()
        sale.student_fee_id = sf.id
    db.commit()
    db.refresh(sale)
    return sale


def void_sale(db: Session, sale_id: int, user: User) -> StoreSale:
    sale = _scoped(db, StoreSale, sale_id, user.school_id, "Bill")
    if sale.is_void:
        raise _400("Bill is already void")
    if sale.student_fee_id:
        sf = db.get(StudentFee, sale.student_fee_id)
        if sf and sf.amount_paid > 0:
            raise _400("The fee for this bill has been (partly) paid; refund it before voiding")
        if sf:
            sf.status = FeeStatus.waived
            sf.notes = f"{sf.notes or ''} (bill voided)"[:300]
    for line in db.execute(select(StoreSaleLine).where(StoreSaleLine.sale_id == sale.id)).scalars():
        db.add(StockMove(tenant_id=sale.tenant_id, school_id=sale.school_id, item_id=line.item_id, kind=StockMoveKind.return_in,
                         qty=line.qty, moved_on=date.today(), reference=f"VOID {sale.bill_no}", recorded_by_user_id=user.id))
    sale.is_void = True
    db.commit()
    db.refresh(sale)
    return sale


def sale_to_read(db: Session, s: StoreSale) -> dict:
    st = db.get(Student, s.student_id) if s.student_id else None
    by = db.get(User, s.sold_by_user_id) if s.sold_by_user_id else None
    lines = db.execute(
        select(StoreSaleLine, InventoryItem.name).join(InventoryItem, StoreSaleLine.item_id == InventoryItem.id).where(StoreSaleLine.sale_id == s.id)
    ).all()
    return {
        **{k: getattr(s, k) for k in ("id", "bill_no", "student_id", "buyer_name", "sold_on", "total", "payment", "is_void", "created_at")},
        "student_name": st.full_name if st else None,
        "sold_by_name": by.full_name if by else None,
        "lines": [{"item_id": l.item_id, "item_name": n, "qty": l.qty, "unit_price": l.unit_price, "amount": l.amount} for l, n in lines],
    }


def list_sales(db: Session, school_id: int, *, on: Optional[date] = None, student_id: Optional[int] = None) -> list[StoreSale]:
    stmt = select(StoreSale).where(StoreSale.school_id == school_id)
    if on:
        stmt = stmt.where(StoreSale.sold_on == on)
    if student_id:
        stmt = stmt.where(StoreSale.student_id == student_id)
    return list(db.execute(stmt.order_by(StoreSale.id.desc()).limit(300)).scalars())


def dashboard(db: Session, school_id: int) -> dict:
    items = list_items(db, school_id)
    today = date.today()
    sales = lambda *w: db.execute(select(func.coalesce(func.sum(StoreSale.total), 0)).where(StoreSale.school_id == school_id, StoreSale.is_void.is_(False), *w)).scalar_one()  # noqa: E731
    return {
        "items": sum(1 for i in items if i["is_active"]),
        "low_stock": [{"id": i["id"], "name": i["name"], "on_hand": i["on_hand"], "reorder_level": i["reorder_level"], "unit": i["unit"]} for i in items if i["low_stock"]],
        "stock_value": sum((i["stock_value"] or ZERO for i in items), ZERO),
        "assets": db.execute(select(func.count(Asset.id)).where(Asset.school_id == school_id, Asset.status != AssetStatus.disposed)).scalar_one(),
        "assets_in_repair": db.execute(select(func.count(Asset.id)).where(Asset.school_id == school_id, Asset.status == AssetStatus.under_repair)).scalar_one(),
        "warranty_expiring": db.execute(select(func.count(Asset.id)).where(
            Asset.school_id == school_id, Asset.status != AssetStatus.disposed,
            Asset.warranty_until.between(today, today + timedelta(days=30)))).scalar_one(),
        "store_sales_today": sales(StoreSale.sold_on == today),
        "store_sales_month": sales(StoreSale.sold_on >= today.replace(day=1)),
    }
