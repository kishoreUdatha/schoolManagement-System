"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, INV, MOVE_LABEL, orNull, qty, today, type Item, type Move, type MoveKind } from "./common";

const KINDS: [MoveKind, string][] = [
  ["issue", "Issue from the store"],
  ["return_in", "Return to the store"],
  ["damage", "Damaged / written off"],
];

/**
 * SCR-237, live: POST /inventory/moves (issue, return_in, damage), with the
 * chosen item's balance and the recent issue/return register.
 * "Issued to" is free text on the backend, not a link to a person.
 */
export function StockIssue() {
  const items = useApi<Item[]>(`${INV}/items`);
  const [itemId, setItemId] = useState("");
  const [kind, setKind] = useState<MoveKind>("issue");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const register = useApi<Move[]>(`${INV}/moves`, { days: 90 });
  const ledger = useApi<Move[]>(itemId ? `${INV}/moves` : null, { item_id: itemId, days: 365 });

  const item = items.data?.find((x) => String(x.id) === itemId);
  const recent = (register.data ?? []).filter((m) => m.kind === "issue" || m.kind === "return_in" || m.kind === "damage").slice(0, 6);
  const itemOut = (ledger.data ?? []).filter((m) => m.kind === "issue").reduce((n, m) => n + Number(m.qty), 0);
  const itemBack = (ledger.data ?? []).filter((m) => m.kind === "return_in").reduce((n, m) => n + Number(m.qty), 0);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ on_hand?: string }>(`${INV}/moves`, {
        item_id: Number(itemId),
        kind,
        qty: String(f.get("qty") ?? ""),
        issued_to: orNull(f.get("issued_to")),
        location: orNull(f.get("location")),
        moved_on: orNull(f.get("moved_on")),
        reference: orNull(f.get("reference")),
        notes: orNull(f.get("notes")),
      });
      notify(`${MOVE_LABEL[kind]}: ${item?.name ?? "item"}${res?.on_hand !== undefined ? `, now ${qty(res.on_hand)} ${item?.unit ?? ""} on hand` : ""}.`);
      setFormKey((k) => k + 1);
      items.reload();
      register.reload();
      ledger.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="two-col">
      <form id="movement-form" key={formKey} className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? items.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                <Field label="Item" required>
                  <select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
                    <option value="">{items.loading ? "Loading items…" : "Choose an item"}</option>
                    {items.data?.map((x) => (
                      <option key={x.id} value={x.id}>
                        {`${x.name} — ${qty(x.on_hand)} ${x.unit} on hand`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Movement type" required>
                  <select value={kind} onChange={(e) => setKind(e.target.value as MoveKind)} required>
                    {KINDS.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={item ? `Quantity (${item.unit})` : "Quantity"} required>
                  <input type="number" name="qty" min={0.01} step="0.01" required placeholder="Enter quantity" />
                </Field>
                <Field label={kind === "issue" ? "Issued to" : kind === "return_in" ? "Returned by" : "Reported by"} required={kind === "issue"}>
                  <input name="issued_to" required={kind === "issue"} placeholder="Staff room, Class 5A, Mr. Rao" />
                </Field>
                <Field label="Location">
                  <input name="location" maxLength={80} placeholder={item?.location ? `e.g. ${item.location}` : "Main store, Lab shelf 2"} />
                </Field>
                <Field label="Date">
                  <input type="date" name="moved_on" defaultValue={today()} />
                </Field>
                <Field label="Reference">
                  <input name="reference" placeholder="Enter reference" />
                </Field>
                <Field label="Remarks" full>
                  <textarea name="notes" placeholder="Enter remarks" />
                </Field>
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="reset" className="btn" onClick={() => setItemId("")}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Record movement"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>{item ? item.name : "Inventory & labs"}</h3>
          {item ? (
            <dl className="kv">
              <div>
                <dt>On hand</dt>
                <dd>{`${qty(item.on_hand)} ${item.unit}`}</dd>
              </div>
              <div>
                <dt>Reorder level</dt>
                <dd>{qty(item.reorder_level)}</dd>
              </div>
              <div>
                <dt>Last 12 months</dt>
                <dd>{ledger.loading ? "…" : `${qty(itemOut)} issued · ${qty(itemBack)} returned`}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{item.low_stock ? "Below reorder level" : "In stock"}</dd>
              </div>
            </dl>
          ) : (
            <p>Choose an item to see what is on hand before it goes out.</p>
          )}
          <div className="gap" />
          <p>Names typed under &ldquo;Issued to&rdquo; are not linked to staff records.</p>
        </div>
        <Panel title="Recent issues & returns">
          {recent.length ? (
            recent.map((m) => (
              <div className="event-row" key={m.id}>
                <div className="event-content">
                  <h4>{`${m.item_name} · ${m.direction > 0 ? "+" : "−"}${qty(m.qty)}`}</h4>
                  <p>{[date(m.moved_on), MOVE_LABEL[m.kind], m.issued_to, m.location].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">{register.loading ? "Loading…" : "Nothing issued or returned in the last 90 days."}</p>
          )}
        </Panel>
      </aside>
    </div>
  );
}
