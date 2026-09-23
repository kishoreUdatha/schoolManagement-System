"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, isoToday, sum } from "./common";
import { qty, useNewFlag } from "./extra";
import type { Bill, InventoryItem, Payables, PurchaseOrderFull, Supplier } from "./types";

const ORDER_STATUS: [string, string][] = [
  ["draft", "Draft"],
  ["sent", "Sent"],
  ["part_received", "Part received"],
  ["received", "Received"],
  ["cancelled", "Cancelled"],
];
const orderStatus = (s: string) => ORDER_STATUS.find(([k]) => k === s)?.[1] ?? label(s);
const billStatus = (b: Bill) => (b.status === "unpaid" && b.due_on && b.due_on < isoToday() ? "Overdue" : label(b.status));

/**
 * NEW-047, live. Orders: GET /school/finance/orders (every order, with its
 * lines), POST to raise one, POST /orders/{id}/receive with each line's
 * received quantity (the total so far, not an increment). Bills:
 * GET /school/finance/bills, POST to record one, optionally against an
 * order. Headline figures from GET /finance/payables. Bills are paid on
 * SCR-169; suppliers are kept on SCR-168.
 */
export function PurchaseOrders() {
  const [tab, setTab] = useState<"orders" | "bills">("orders");
  const [newOrder, setNewOrder] = useNewFlag("order");
  const [newBill, setNewBill] = useNewFlag("bill");
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState("");
  const [unpaid, setUnpaid] = useState(false);
  const [viewing, setViewing] = useState<PurchaseOrderFull | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrderFull | null>(null);
  const [billFor, setBillFor] = useState<PurchaseOrderFull | null>(null);

  const suppliers = useApi<Supplier[]>("/api/v1/school/inventory/suppliers");
  const payables = useApi<Payables>("/api/v1/school/finance/payables");
  const orders = useApi<PurchaseOrderFull[]>("/api/v1/school/finance/orders", { supplier_id: supplierId, order_status: status });
  const allOrders = useApi<PurchaseOrderFull[]>("/api/v1/school/finance/orders");
  const bills = useApi<Bill[]>("/api/v1/school/finance/bills", { supplier_id: supplierId, unpaid_only: unpaid });

  useEffect(() => {
    if (newBill) setTab("bills");
  }, [newBill]);

  const reload = () => {
    orders.reload();
    allOrders.reload();
    bills.reload();
    payables.reload();
  };

  const open = (allOrders.data ?? []).filter((o) => o.status === "draft" || o.status === "sent" || o.status === "part_received");
  const p = payables.data;
  const stats = [
    { label: "Owed to suppliers", value: p ? money(p.total_outstanding) : "…", note: p ? `${p.suppliers_owed} supplier${p.suppliers_owed === 1 ? "" : "s"} with unpaid bills` : "Unpaid bills" },
    { label: "Overdue", value: p ? money(p.total_overdue) : "…", note: "Past the bill's due date" },
    { label: "Open orders", value: allOrders.data ? String(open.length) : "…", note: allOrders.data ? `${money(sum(open.map((o) => o.total)))} on order` : "Not yet received" },
    { label: "Not yet billed", value: allOrders.data ? money(sum((allOrders.data ?? []).filter((o) => o.status !== "cancelled").map((o) => o.unbilled))) : "…", note: "Ordered but no bill recorded" },
  ];

  const orderItems = orders.data ?? [];
  const orderRows: Row[] = orderItems.map((o) => [o.order_no, o.supplier_name ?? "—", date(o.ordered_on), date(o.expected_on), money(o.total), money(o.billed), orderStatus(o.status)]);
  const billItems = bills.data ?? [];
  const billRows: Row[] = billItems.map((b) => [b.bill_no, b.supplier_name ?? "—", date(b.billed_on), date(b.due_on), money(b.total), money(b.paid), money(b.outstanding), billStatus(b)]);
  const activeSuppliers = (suppliers.data ?? []).filter((s) => s.is_active);

  return (
    <>
      <StatStrip items={stats} compact />
      <nav className="module-tabs">
        <button type="button" className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>
          {"Purchase orders "}
          <span className="muted">{allOrders.data?.length ?? "…"}</span>
        </button>
        <button type="button" className={tab === "bills" ? "active" : ""} onClick={() => setTab("bills")}>
          {"Supplier bills "}
          <span className="muted">{bills.data && !supplierId && !unpaid ? bills.data.length : ""}</span>
        </button>
      </nav>
      <div className="filterbar">
        <select aria-label="Filter by supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">All suppliers</option>
          {suppliers.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {tab === "orders" ? (
          <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {ORDER_STATUS.map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        ) : (
          <select aria-label="Filter bills" value={unpaid ? "unpaid" : ""} onChange={(e) => setUnpaid(e.target.value === "unpaid")}>
            <option value="">All bills</option>
            <option value="unpaid">Unpaid only</option>
          </select>
        )}
      </div>
      <ErrorNote>{suppliers.error ?? payables.error ?? (tab === "orders" ? orders.error : bills.error)}</ErrorNote>
      {tab === "orders" ? (
        <Panel title="Purchase orders" sub={`Newest first${orders.loading ? " · Loading…" : ""}`} flush>
          <DataTable
            columns={["Order no.", "Supplier", "Ordered on", "Expected", "Total", "Billed", "Status"]}
            rows={orderRows}
            actions={(i) => {
              const o = orderItems[i];
              const receivable = o.status !== "received" && o.status !== "cancelled";
              return (
                <>
                  <button type="button" className="btn" onClick={() => setViewing(o)}>
                    View
                  </button>
                  {receivable ? (
                    <button type="button" className="btn" onClick={() => setReceiving(o)}>
                      Receive
                    </button>
                  ) : null}
                  {o.status !== "cancelled" && Number(o.unbilled) > 0 ? (
                    <button type="button" className="btn" onClick={() => setBillFor(o)}>
                      Bill
                    </button>
                  ) : null}
                </>
              );
            }}
            empty={orders.loading ? "Loading orders…" : supplierId || status ? "No orders match these filters." : undefined}
            emptyState={{
              title: "No purchase orders yet",
              note: "Raise an order with a supplier before receiving stock or billing against it.",
              action: (
                <button type="button" className="btn primary" onClick={() => setNewOrder(true)}>
                  Raise order
                </button>
              ),
            }}
          />
        </Panel>
      ) : (
        <Panel title="Supplier bills" sub={`Pay them on the purchase payment screen${bills.loading ? " · Loading…" : ""}`} flush>
          <DataTable
            columns={["Bill no.", "Supplier", "Billed on", "Due", "Total", "Paid", "Outstanding", "Status"]}
            rows={billRows}
            actions={(i) =>
              Number(billItems[i].outstanding) > 0 && billItems[i].status !== "cancelled" ? (
                <Link href={routeOf(169)} className="btn">
                  Pay
                </Link>
              ) : (
                <span className="muted small">—</span>
              )
            }
            empty={bills.loading ? "Loading bills…" : supplierId || unpaid ? "No bills match these filters." : undefined}
            emptyState={{
              title: "No supplier bills yet",
              note: "Record a bill against a purchase order, or on its own, to track what the school owes a supplier.",
              action: (
                <button type="button" className="btn primary" onClick={() => setNewBill(true)}>
                  Record bill
                </button>
              ),
            }}
          />
        </Panel>
      )}

      {viewing ? <OrderView order={viewing} onClose={() => setViewing(null)} /> : null}
      {receiving ? (
        <ReceiveDialog
          order={receiving}
          onClose={() => setReceiving(null)}
          onSaved={() => {
            setReceiving(null);
            reload();
          }}
        />
      ) : null}
      {newOrder ? (
        <OrderDialog
          suppliers={activeSuppliers}
          onClose={() => setNewOrder(false)}
          onSaved={() => {
            setNewOrder(false);
            reload();
          }}
        />
      ) : null}
      {newBill || billFor ? (
        <BillDialog
          suppliers={activeSuppliers}
          orders={allOrders.data ?? []}
          order={billFor}
          onClose={() => {
            setNewBill(false);
            setBillFor(null);
          }}
          onSaved={() => {
            setNewBill(false);
            setBillFor(null);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

function OrderView({ order: o, onClose }: { order: PurchaseOrderFull; onClose: () => void }) {
  const rows: Row[] = o.lines.map((l) => [l.description, qty(l.qty), money(l.unit_cost), money(l.line_total), qty(l.received_qty)]);
  return (
    <Dialog
      open
      wide
      title={`Order ${o.order_no}`}
      onClose={onClose}
      actions={
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <dl className="kv">
        <div>
          <dt>Supplier</dt>
          <dd>{o.supplier_name ?? "—"}</dd>
        </div>
        <div>
          <dt>Ordered · expected</dt>
          <dd>{`${date(o.ordered_on)} · ${date(o.expected_on)}`}</dd>
        </div>
        <div>
          <dt>Total · billed</dt>
          <dd>{`${money(o.total)} · ${money(o.billed)}`}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{orderStatus(o.status)}</dd>
        </div>
      </dl>
      {o.notes ? <p className="muted small" style={{ marginTop: 12 }}>{o.notes}</p> : null}
      <div className="gap" />
      <DataTable columns={["Item", "Qty", "Unit cost", "Line total", "Received"]} rows={rows} selectable={false} rowAction={false} />
    </Dialog>
  );
}

function ReceiveDialog({ order: o, onClose, onSaved }: { order: PurchaseOrderFull; onClose: () => void; onSaved: () => void }) {
  const [got, setGot] = useState<Record<number, string>>(() => Object.fromEntries(o.lines.map((l) => [l.id, String(Number(l.qty))])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<PurchaseOrderFull>(`/api/v1/school/finance/orders/${o.id}/receive`, { lines: o.lines.map((l) => ({ line_id: l.id, received_qty: got[l.id] || "0" })) });
      notify(`Order ${o.order_no}: ${orderStatus(r.status).toLowerCase()}.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title={`Receive order ${o.order_no}`}
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Save receipt"}
          </button>
        </>
      }
    >
      <p className="muted small" style={{ marginBottom: 14 }}>Enter how much of each line has arrived in total so far. The order becomes received when every line is complete.</p>
      <ErrorNote>{error}</ErrorNote>
      <div className="form-grid">
        {o.lines.map((l) => (
          <Field key={l.id} label={`${l.description} · ordered ${qty(l.qty)}, received ${qty(l.received_qty)}`}>
            <input type="number" min={0} max={Number(l.qty)} step="any" value={got[l.id] ?? ""} onChange={(e) => setGot({ ...got, [l.id]: e.target.value })} required />
          </Field>
        ))}
      </div>
    </Dialog>
  );
}

type Line = { item_id: string; description: string; qty: string; unit_cost: string };
const NO_LINE: Line = { item_id: "", description: "", qty: "1", unit_cost: "" };

function OrderDialog({ suppliers, onClose, onSaved }: { suppliers: Supplier[]; onClose: () => void; onSaved: () => void }) {
  const items = useApi<InventoryItem[]>("/api/v1/school/inventory/items");
  const [f, setF] = useState({ supplier_id: "", order_no: "", ordered_on: isoToday(), expected_on: "", status: "draft", notes: "" });
  const [lines, setLines] = useState<Line[]>([{ ...NO_LINE }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = sum(lines.map((l) => (Number(l.qty) || 0) * (Number(l.unit_cost) || 0)));

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<PurchaseOrderFull>("/api/v1/school/finance/orders", {
        supplier_id: Number(f.supplier_id),
        order_no: f.order_no.trim(),
        ordered_on: f.ordered_on || null,
        expected_on: f.expected_on || null,
        status: f.status,
        notes: f.notes.trim() || null,
        lines: lines.map((l) => ({ item_id: l.item_id ? Number(l.item_id) : null, description: l.description.trim(), qty: l.qty, unit_cost: l.unit_cost || "0" })),
      });
      notify(`Order ${r.order_no} raised for ${money(r.total)}.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title="Raise purchase order"
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : `Raise order · ${money(total)}`}
          </button>
        </>
      }
    >
      <ErrorNote>{error ?? items.error}</ErrorNote>
      <div className="form-grid">
        <Field label="Supplier" required>
          <select value={f.supplier_id} onChange={set("supplier_id")} required>
            <option value="">Select supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Order no." required>
          <input value={f.order_no} onChange={set("order_no")} minLength={1} maxLength={40} required placeholder="PO-2026-001" />
        </Field>
        <Field label="Ordered on">
          <input type="date" value={f.ordered_on} onChange={set("ordered_on")} />
        </Field>
        <Field label="Expected on">
          <input type="date" value={f.expected_on} min={f.ordered_on || undefined} onChange={set("expected_on")} />
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={set("status")}>
            <option value="draft">Draft</option>
            <option value="sent">Sent to supplier</option>
          </select>
        </Field>
        <Field label="Notes">
          <input value={f.notes} onChange={set("notes")} />
        </Field>
      </div>
      <div className="gap" />
      <h3 className="small strong">Lines</h3>
      {lines.map((l, i) => (
        <div className="form-grid three" key={i} style={{ marginTop: 10, alignItems: "end" }}>
          <Field label="Stock item">
            <select
              value={l.item_id}
              onChange={(e) => {
                const it = items.data?.find((x) => x.id === Number(e.target.value));
                setLine(i, { item_id: e.target.value, description: it && !l.description ? it.name : l.description });
              }}
            >
              <option value="">Not a stock item</option>
              {items.data
                ?.filter((x) => x.is_active)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {`${x.name} · ${x.sku}`}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Description" required>
            <input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} minLength={1} maxLength={300} required />
          </Field>
          <div className="row" style={{ gap: 8, alignItems: "end" }}>
            <Field label="Qty" required>
              <input type="number" min={0.01} step="any" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} required />
            </Field>
            <Field label="Unit cost (₹)" required>
              <input type="number" min={0} step="0.01" value={l.unit_cost} onChange={(e) => setLine(i, { unit_cost: e.target.value })} required />
            </Field>
            {lines.length > 1 ? (
              <button type="button" className="btn" aria-label={`Remove line ${i + 1}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                ×
              </button>
            ) : null}
          </div>
        </div>
      ))}
      <div className="gap" />
      <button type="button" className="btn" onClick={() => setLines([...lines, { ...NO_LINE }])}>
        <Icon name="plus" className="sm" />
        Add line
      </button>
    </Dialog>
  );
}

function BillDialog({ suppliers, orders, order, onClose, onSaved }: { suppliers: Supplier[]; orders: PurchaseOrderFull[]; order: PurchaseOrderFull | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    supplier_id: order ? String(order.supplier_id) : "",
    order_id: order ? String(order.id) : "",
    bill_no: "",
    billed_on: isoToday(),
    due_on: "",
    amount: order ? String(Number(order.unbilled)) : "",
    tax_amount: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const theirs = orders.filter((o) => String(o.supplier_id) === f.supplier_id && o.status !== "cancelled");

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<Bill>("/api/v1/school/finance/bills", {
        supplier_id: Number(f.supplier_id),
        order_id: f.order_id ? Number(f.order_id) : null,
        bill_no: f.bill_no.trim(),
        billed_on: f.billed_on,
        due_on: f.due_on || null,
        amount: f.amount,
        tax_amount: f.tax_amount || "0",
        notes: f.notes.trim() || null,
      });
      notify(`Bill ${r.bill_no} recorded: ${money(r.total)} owed to ${r.supplier_name ?? "the supplier"}.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      title={order ? `Bill for order ${order.order_no}` : "Record supplier bill"}
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Record bill"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <div className="form-grid">
        <Field label="Supplier" required>
          <select value={f.supplier_id} onChange={(e) => setF({ ...f, supplier_id: e.target.value, order_id: "" })} required>
            <option value="">Select supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Against order">
          <select value={f.order_id} onChange={set("order_id")} disabled={!f.supplier_id}>
            <option value="">No order</option>
            {theirs.map((o) => (
              <option key={o.id} value={o.id}>
                {`${o.order_no} · ${money(o.unbilled)} unbilled`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bill no." required>
          <input value={f.bill_no} onChange={set("bill_no")} minLength={1} maxLength={60} required />
        </Field>
        <Field label="Billed on" required>
          <input type="date" value={f.billed_on} onChange={set("billed_on")} required />
        </Field>
        <Field label="Due on">
          <input type="date" value={f.due_on} min={f.billed_on || undefined} onChange={set("due_on")} />
        </Field>
        <Field label="Amount before tax (₹)" required>
          <input type="number" min={0} step="0.01" value={f.amount} onChange={set("amount")} required />
        </Field>
        <Field label="Tax (₹)">
          <input type="number" min={0} step="0.01" value={f.tax_amount} onChange={set("tax_amount")} placeholder="0" />
        </Field>
        <Field label="Notes">
          <input value={f.notes} onChange={set("notes")} />
        </Field>
      </div>
    </Dialog>
  );
}
