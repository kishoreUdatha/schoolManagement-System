"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, INV, Tip, orNull, qty, today, type Item, type Move, type Supplier } from "./common";

type Line = { item_id: string; qty: string; unit_cost: string };
type Failed = { line: number; item: string; why: string };
const blank = (): Line => ({ item_id: "", qty: "", unit_cost: "" });

/**
 * SCR-236, live: a delivery entered once. The backend has no receipt header,
 * so each line is its own POST /inventory/moves (kind "purchase"); a line
 * that fails does not undo the others, and the page says so.
 */
export function StockReceipt() {
  const suppliers = useApi<Supplier[]>(`${INV}/suppliers`);
  const items = useApi<Item[]>(`${INV}/items`);
  const recent = useApi<Move[]>(`${INV}/moves`, { days: 90 });
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [movedOn, setMovedOn] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<Failed[]>([]);
  const [error, setError] = useState<string | null>(null);

  const set = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, [k]: v } : l)));
  const filled = lines.filter((l) => l.item_id && Number(l.qty) > 0);
  const total = filled.reduce((n, l) => n + Number(l.qty) * Number(l.unit_cost || 0), 0);
  const supplier = suppliers.data?.find((s) => String(s.id) === supplierId);
  const itemOf = (id: string) => items.data?.find((x) => String(x.id) === id);
  const purchases = (recent.data ?? []).filter((m) => m.kind === "purchase").slice(0, 5);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!filled.length) {
      setError("Add at least one line with an item and a quantity.");
      return;
    }
    setSaving(true);
    setError(null);
    const bad: Failed[] = [];
    let ok = 0;
    for (const [i, l] of lines.entries()) {
      if (!l.item_id || !(Number(l.qty) > 0)) continue;
      try {
        await api.post(`${INV}/moves`, {
          item_id: Number(l.item_id),
          kind: "purchase",
          qty: l.qty,
          unit_cost: orNull(l.unit_cost),
          moved_on: movedOn || null,
          supplier_id: supplierId ? Number(supplierId) : null,
          reference: orNull(reference),
          notes: orNull(notes),
        });
        ok += 1;
      } catch (err) {
        bad.push({ line: i + 1, item: itemOf(l.item_id)?.name ?? `Item ${l.item_id}`, why: errorText(err) });
      }
    }
    setFailed(bad);
    setSaving(false);
    // Keep only the lines that did not go in, so they can be fixed and sent again.
    if (bad.length) setLines((ls) => ls.filter((_, n) => bad.some((b) => b.line === n + 1)));
    else {
      setLines([blank()]);
      setReference("");
      setNotes("");
    }
    if (ok) notify(bad.length ? `${ok} line(s) received; ${bad.length} did not go in.` : `${ok} line(s) received into stock.`);
    items.reload();
    recent.reload();
  }

  return (
    <div className="two-col">
      <div className="stack">
        <Panel title="Purchase summary">
          <dl className="kv">
            <div>
              <dt>Supplier</dt>
              <dd>{supplier?.name ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Purchase order</dt>
              <dd>{reference || "—"}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{money(total)}</dd>
            </div>
            <div>
              <dt>Lines</dt>
              <dd>{`${filled.length} of ${lines.length}`}</dd>
            </div>
          </dl>
        </Panel>
        <form id="receipt-form" className="panel" onSubmit={submit}>
          <div className="panel-head">
            <h2>Stock receipt details</h2>
          </div>
          <div className="panel-body">
            <ErrorNote>{error ?? suppliers.error ?? items.error}</ErrorNote>
            {failed.length ? (
              <Tip warn>
                {`${failed.length} line(s) did not go in and are still below; the others are already in stock. `}
                {failed.map((f) => `Line ${f.line} (${f.item}): ${f.why}`).join(" · ")}
              </Tip>
            ) : null}
            <div className="form-grid">
              <Field label="Supplier">
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Not recorded</option>
                  {suppliers.data
                    ?.filter((s) => s.is_active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Purchase order / invoice no.">
                <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Enter purchase order" />
              </Field>
              <Field label="Receipt date" required>
                <input type="date" required value={movedOn} onChange={(e) => setMovedOn(e.target.value)} />
              </Field>
              {/* Not wired: the mock's "Location" — a stock move has no location; it belongs to the item. */}
              <Field label="Notes">
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </Field>
              {lines.map((l, i) => {
                const it = itemOf(l.item_id);
                return (
                  <div key={i} className="full form-grid three" style={{ gridColumn: "1 / -1", alignItems: "end" }}>
                    <Field label={`Item${lines.length > 1 ? ` (line ${i + 1})` : ""}`} required>
                      <select value={l.item_id} onChange={(e) => set(i, "item_id", e.target.value)} required={i === 0}>
                        <option value="">{items.loading ? "Loading items…" : "Choose an item"}</option>
                        {items.data?.map((x) => (
                          <option key={x.id} value={x.id}>
                            {`${x.name} (${x.sku})`}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={it ? `Quantity (${it.unit})` : "Quantity"}>
                      <input type="number" min={0.01} step="0.01" value={l.qty} onChange={(e) => set(i, "qty", e.target.value)} placeholder="Enter quantity" />
                    </Field>
                    <Field label="Unit price (₹)" required={!!l.item_id}>
                      <div className="row" style={{ gap: 6 }}>
                        <input type="number" min={0} step="0.01" required={!!l.item_id} value={l.unit_cost} onChange={(e) => set(i, "unit_cost", e.target.value)} placeholder="Enter unit price" />
                        {lines.length > 1 ? (
                          <button type="button" className="btn" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}>
                            ✕
                          </button>
                        ) : null}
                      </div>
                    </Field>
                  </div>
                );
              })}
            </div>
            <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => setLines((ls) => [...ls, blank()])}>
              <Icon name="plus" className="sm" />
              Add a line
            </button>
          </div>
          <div className="form-footer">
            <span>Amounts in INR · each line is saved separately, so a problem with one does not undo the others</span>
            <button type="submit" className="btn primary" disabled={saving || !filled.length}>
              <Icon name="check" className="sm" />
              {saving ? "Receiving…" : "Receive stock"}
            </button>
          </div>
        </form>
      </div>
      <aside className="stack">
        <div className="payment-summary">
          <h3>Receipt value</h3>
          <div className="checkout-total">{money(total)}</div>
          <p className="stat-note">Quantity × unit price, before any tax</p>
          <div className="gap" />
          <dl className="kv">
            <div>
              <dt>Supplier</dt>
              <dd>{supplier?.name ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Units</dt>
              <dd>{qty(filled.reduce((n, l) => n + Number(l.qty), 0))}</dd>
            </div>
            <div>
              <dt>Received on</dt>
              <dd>{date(movedOn)}</dd>
            </div>
          </dl>
        </div>
        <Panel title="Recent receipts">
          {purchases.length ? (
            purchases.map((m) => (
              <div className="event-row" key={m.id}>
                <div className="event-content">
                  <h4>{`${m.item_name} · ${qty(m.qty)}`}</h4>
                  <p>{[date(m.moved_on), m.supplier_name, m.reference].filter(Boolean).join(" · ")}</p>
                </div>
                <strong className="small">{m.unit_cost ? money(Number(m.qty) * Number(m.unit_cost)) : "—"}</strong>
              </div>
            ))
          ) : (
            <p className="muted">{recent.loading ? "Loading…" : "No purchases received in the last 90 days."}</p>
          )}
        </Panel>
      </aside>
    </div>
  );
}
