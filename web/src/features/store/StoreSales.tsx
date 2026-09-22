"use client";

import { useRef, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { Field, isoToday, StudentPicker, sum } from "@/features/fees/common";
import { qty, useNewFlag } from "@/features/fees/extra";
import type { FeeHead, InventoryItem, PickedStudent } from "@/features/fees/types";
import { api, errorText } from "@/lib/api";
import { date, dateTime, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";

type StorePayment = "cash" | "upi" | "card" | "add_to_fees";

type Sale = {
  id: number;
  bill_no: string;
  student_id: number | null;
  student_name: string | null;
  buyer_name: string | null;
  sold_on: string;
  total: string;
  payment: StorePayment;
  is_void: boolean;
  sold_by_name: string | null;
  lines: { item_id: number; item_name: string; qty: string; unit_price: string; amount: string }[];
  created_at: string;
};

type Dashboard = { store_sales_today: string | number; store_sales_month: string | number; low_stock: { id: number }[] };

const PAYMENTS: [StorePayment, string][] = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["card", "Card"],
  ["add_to_fees", "Add to the student's fees"],
];
const payLabel = (p: string) => (p === "add_to_fees" ? "Added to fees" : (PAYMENTS.find(([k]) => k === p)?.[1] ?? p));
const buyer = (s: Sale) => s.student_name ?? s.buyer_name ?? "—";

/**
 * NEW-048, live. Sales: GET /school/inventory/store/sales?on= (one day, or
 * the latest 300 when no day is chosen), POST to sell (price and stock
 * come from the item; "add to fees" raises a charge under a fee head),
 * POST /{id}/void (stock goes back; a fee charge is waived unless paid).
 * Headline totals from GET /inventory/dashboard; sellable items from
 * GET /inventory/items?sellable_only=true.
 */
export function StoreSales() {
  const [day, setDay] = useState(isoToday());
  const [q, setQ] = useState("");
  const [selling, setSelling] = useNewFlag();
  const [viewing, setViewing] = useState<Sale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sales = useApi<Sale[]>("/api/v1/school/inventory/store/sales", { on: day });
  const dash = useApi<Dashboard>("/api/v1/school/inventory/dashboard");
  const items = useApi<InventoryItem[]>("/api/v1/school/inventory/items", { sellable_only: true });

  const all = sales.data ?? [];
  const shown = all.filter((s) => {
    const term = q.trim().toLowerCase();
    return !term || `${s.bill_no} ${buyer(s)} ${s.lines.map((l) => l.item_name).join(" ")}`.toLowerCase().includes(term);
  });
  const valid = all.filter((s) => !s.is_void);
  const sellable = (items.data ?? []).filter((i) => i.is_active && i.sale_price !== null);
  const d = dash.data;
  const stats = [
    { label: "Sold today", value: d ? money(d.store_sales_today) : "…", note: "Excluding void bills" },
    { label: "Sold this month", value: d ? money(d.store_sales_month) : "…", note: "Excluding void bills" },
    day
      ? { label: `Bills on ${date(day)}`, value: sales.data ? String(valid.length) : "…", note: sales.data ? `${money(sum(valid.map((s) => s.total)))} · ${all.length - valid.length} void` : "For the chosen day" }
      : { label: "Recent bills", value: sales.data ? String(all.length) : "…", note: "The latest bills, newest first" },
    { label: "Items for sale", value: items.data ? String(sellable.length) : "…", note: items.data ? `${sellable.filter((i) => Number(i.on_hand) <= 0).length} out of stock` : "Sellable stock" },
  ];

  const rows: Row[] = shown.map((s) => [
    s.bill_no,
    date(s.sold_on),
    { name: buyer(s), sub: s.student_id ? "Student" : undefined },
    s.lines.map((l) => `${l.item_name} × ${qty(l.qty)}`).join(", "),
    payLabel(s.payment),
    money(s.total),
    s.is_void ? "Void" : "Paid",
  ]);

  // One void at a time: a double-click must not return the stock twice.
  const voiding = useRef(false);
  const [voidingId, setVoidingId] = useState<number | null>(null);
  async function voidIt(s: Sale) {
    if (voiding.current) return;
    if (!window.confirm(`Void bill ${s.bill_no} for ${money(s.total)}? The items go back into stock${s.payment === "add_to_fees" ? " and the fee charge is waived" : ""}.`)) return;
    voiding.current = true;
    setVoidingId(s.id);
    setError(null);
    try {
      await api.post(`/api/v1/school/inventory/store/sales/${s.id}/void`);
      notify(`Bill ${s.bill_no} voided.`);
      setViewing(null);
      sales.reload();
      dash.reload();
      items.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      voiding.current = false;
      setVoidingId(null);
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bill, buyer or item…" aria-label="Search sales" />
        </div>
        <input type="date" aria-label="Sale date" value={day} max={isoToday()} onChange={(e) => setDay(e.target.value)} />
        <button type="button" className="btn" onClick={() => setDay(day ? "" : isoToday())}>
          {day ? "Show recent bills" : "Show today"}
        </button>
      </div>
      <ErrorNote>{error ?? sales.error ?? dash.error ?? items.error}</ErrorNote>
      <Panel title={day ? `Sales on ${date(day)}` : "Recent sales"} sub={`Uniforms, books and stationery sold at the school store${sales.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Bill no.", "Date", "Name", "Items", "Payment", "Total", "Status"]}
          rows={rows}
          actions={(i) => (
            <>
              <button type="button" className="btn" onClick={() => setViewing(shown[i])}>
                View
              </button>
              {!shown[i].is_void ? (
                <button type="button" className="btn danger" disabled={voidingId !== null} onClick={() => voidIt(shown[i])}>
                  Void
                </button>
              ) : null}
            </>
          )}
          empty={sales.loading ? "Loading sales…" : q ? "No bills match." : day ? "No sales on this day." : "No sales yet."}
        />
      </Panel>
      {viewing ? (
        <Dialog
          open
          title={`Bill ${viewing.bill_no}`}
          onClose={() => setViewing(null)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setViewing(null)}>
                Close
              </button>
              {!viewing.is_void ? (
                <button type="button" className="btn danger" disabled={voidingId !== null} onClick={() => voidIt(viewing)}>
                  Void bill
                </button>
              ) : null}
            </>
          }
        >
          <dl className="kv">
            <div>
              <dt>Sold to</dt>
              <dd>{buyer(viewing)}</dd>
            </div>
            <div>
              <dt>Sold</dt>
              <dd>{`${dateTime(viewing.created_at)}${viewing.sold_by_name ? ` · by ${viewing.sold_by_name}` : ""}`}</dd>
            </div>
            <div>
              <dt>Payment</dt>
              <dd>{payLabel(viewing.payment)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{viewing.is_void ? "Void" : "Paid"}</dd>
            </div>
          </dl>
          <div className="payment-lines">
            {viewing.lines.map((l) => (
              <div key={l.item_id}>
                <span>{`${l.item_name} × ${qty(l.qty)} @ ${money(l.unit_price)}`}</span>
                <span>{money(l.amount)}</span>
              </div>
            ))}
            <div className="sum">
              <span>Total</span>
              <span>{money(viewing.total)}</span>
            </div>
          </div>
        </Dialog>
      ) : null}
      {selling ? (
        <NewSale
          items={sellable}
          onClose={() => setSelling(false)}
          onSaved={() => {
            setSelling(false);
            setDay(isoToday());
            sales.reload();
            dash.reload();
            items.reload();
          }}
        />
      ) : null}
    </>
  );
}

type Line = { item_id: string; qty: string };

function NewSale({ items, onClose, onSaved }: { items: InventoryItem[]; onClose: () => void; onSaved: () => void }) {
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [payment, setPayment] = useState<StorePayment>("cash");
  const [headId, setHeadId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ item_id: "", qty: "1" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heads = useApi<FeeHead[]>(payment === "add_to_fees" ? "/api/v1/school/fees/heads" : null, { active_only: true });
  const byId = new Map(items.map((i) => [i.id, i]));
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = sum(lines.map((l) => (Number(byId.get(Number(l.item_id))?.sale_price) || 0) * (Number(l.qty) || 0)));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!student && !buyerName.trim()) {
      setError("Pick a student or enter the buyer's name.");
      return;
    }
    if (payment === "add_to_fees" && !student) {
      setError("Adding to fees needs a student.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<Sale>("/api/v1/school/inventory/store/sales", {
        student_id: student?.id ?? null,
        buyer_name: buyerName.trim() || null,
        payment,
        fee_head_id: payment === "add_to_fees" ? Number(headId) : null,
        lines: lines.map((l) => ({ item_id: Number(l.item_id), qty: l.qty })),
      });
      notify(`Bill ${r.bill_no}: ${money(r.total)}${payment === "add_to_fees" ? " added to the student's fees" : ` by ${payLabel(payment)}`}.`);
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
      title="New sale"
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : `Sell · ${money(total)}`}
          </button>
        </>
      }
    >
      <ErrorNote>{error ?? heads.error}</ErrorNote>
      <div className="form-grid">
        <StudentPicker value={student} onChange={setStudent} required={false} />
        <Field label={student ? "Buyer name (optional)" : "Buyer name"} required={!student}>
          <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} maxLength={160} placeholder={student ? "If a parent is buying" : "Who is buying"} />
        </Field>
        <Field label="Payment" required>
          <select value={payment} onChange={(e) => setPayment(e.target.value as StorePayment)}>
            {PAYMENTS.map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        {payment === "add_to_fees" ? (
          <Field label="Charge under fee head" required>
            <select value={headId} onChange={(e) => setHeadId(e.target.value)} required>
              <option value="">Select fee head</option>
              {heads.data?.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
      <div className="gap" />
      <h3 className="small strong">Items</h3>
      {lines.map((l, i) => {
        const it = byId.get(Number(l.item_id));
        return (
          <div className="form-grid three" key={i} style={{ marginTop: 10, alignItems: "end" }}>
            <Field label="Item" required>
              <select value={l.item_id} onChange={(e) => setLine(i, { item_id: e.target.value })} required>
                <option value="">Select item</option>
                {items.map((x) => (
                  <option key={x.id} value={x.id} disabled={Number(x.on_hand) <= 0}>
                    {`${x.name} · ${money(x.sale_price)} · ${qty(x.on_hand)} ${x.unit} in stock`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={it ? `Qty (${it.unit})` : "Qty"} required>
              <input type="number" min={0.01} step="any" max={it ? Number(it.on_hand) : undefined} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} required />
            </Field>
            <div className="row" style={{ gap: 8, alignItems: "center", minHeight: 40 }}>
              <strong>{it ? money((Number(it.sale_price) || 0) * (Number(l.qty) || 0)) : "—"}</strong>
              {lines.length > 1 ? (
                <button type="button" className="btn" aria-label={`Remove item ${i + 1}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  ×
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      <div className="gap" />
      <button type="button" className="btn" onClick={() => setLines([...lines, { item_id: "", qty: "1" }])}>
        <Icon name="plus" className="sm" />
        Add item
      </button>
      {!items.length ? <p className="muted small" style={{ marginTop: 12 }}>No items are marked for sale. Mark stock items as sellable with a price in the inventory first.</p> : null}
    </Dialog>
  );
}
