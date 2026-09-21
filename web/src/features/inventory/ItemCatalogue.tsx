"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, INV, Modal, ModalActions, orNull, qty, useNewFlag, type Item } from "./common";

/** SCR-235, live: GET /inventory/items (q, category, low_only); add and edit an item. */
export function ItemCatalogue() {
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [adding, closeAdd] = useNewFlag();

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const all = useApi<Item[]>(`${INV}/items`);
  const list = useApi<Item[]>(`${INV}/items`, { q: search, category, low_only: status === "low" ? true : undefined });
  const categories = useMemo(() => [...new Set((all.data ?? []).map((i) => i.category).filter((c): c is string => !!c))].sort(), [all.data]);

  const items = (list.data ?? []).filter((i) => (status === "active" ? i.is_active : status === "inactive" ? !i.is_active : true));
  const rows: Row[] = items.map((i) => [
    { name: i.name, sub: i.location ?? undefined },
    i.sku,
    i.category ?? "—",
    i.unit,
    `${qty(i.on_hand)}${i.low_stock ? " · low" : ""}`,
    qty(i.reorder_level),
  ]);
  const value = items.reduce((n, i) => n + Number(i.stock_value ?? 0), 0);
  const low = items.filter((i) => i.low_stock).length;

  const saved = () => {
    list.reload();
    all.reload();
  };

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search item catalogue…" aria-label="Search items by name or SKU" />
        </div>
        <select aria-label="Filter category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="low">Below reorder level</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{list.error ?? all.error}</ErrorNote>
      <Panel
        title="All records"
        sub={`${items.length} item${items.length === 1 ? "" : "s"} · ${money(value)} in stock · ${low} below reorder level${list.loading ? " · Loading…" : ""}`}
        action={
          <button type="button" className="btn" data-columns="">
            <Icon name="grid" className="sm" />
            Columns
          </button>
        }
        flush
      >
        <DataTable
          columns={["Item", "SKU", "Category", "Unit", "Available", "Reorder level"]}
          rows={rows}
          onView={(i) => setEditing(items[i])}
          empty={list.loading ? "Loading items…" : search || category || status ? "No items match these filters." : "No items have been set up in the store yet."}
        />
      </Panel>
      {adding ? <ItemDialog existing={null} onClose={closeAdd} onSaved={() => (closeAdd(), saved())} /> : null}
      {editing ? <ItemDialog existing={editing} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), saved())} /> : null}
    </>
  );
}

/** POST /inventory/items, or PUT /inventory/items/{id} when editing. */
export function ItemDialog({ existing, onClose, onSaved }: { existing: Item | null; onClose: () => void; onSaved: () => void }) {
  const [sellable, setSellable] = useState(existing?.is_sellable ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: String(f.get("name") ?? "").trim(),
      sku: orNull(f.get("sku")),
      category: orNull(f.get("category")),
      unit: orNull(f.get("unit")) ?? "pcs",
      reorder_level: orNull(f.get("reorder_level")) ?? "0",
      is_sellable: sellable,
      sale_price: sellable ? orNull(f.get("sale_price")) : null,
      location: orNull(f.get("location")),
      description: orNull(f.get("description")),
      is_active: existing ? f.get("is_active") === "on" : true,
    };
    setSaving(true);
    setError(null);
    try {
      if (existing) await api.put(`${INV}/items/${existing.id}`, body);
      else await api.post(`${INV}/items`, body);
      notify(existing ? `${body.name} updated.` : `${body.name} added to the catalogue.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={existing ? `Edit ${existing.name}` : "Add item"} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <Field label="Item name" required>
            <input name="name" required defaultValue={existing?.name} placeholder="Enter item name" />
          </Field>
          <Field label="SKU">
            <input name="sku" defaultValue={existing?.sku} placeholder="Leave blank to number automatically" />
          </Field>
          <Field label="Category">
            <input name="category" defaultValue={existing?.category ?? ""} placeholder="Stationery, Uniform, Lab…" />
          </Field>
          <Field label="Unit">
            <input name="unit" defaultValue={existing?.unit ?? "pcs"} placeholder="pcs, box, litre" />
          </Field>
          <Field label="Reorder level">
            <input name="reorder_level" type="number" min={0} step="0.01" defaultValue={existing ? Number(existing.reorder_level) : 0} />
          </Field>
          <Field label="Location">
            <input name="location" defaultValue={existing?.location ?? ""} placeholder="Main store, Chemistry lab…" />
          </Field>
          <Field label="Description" full>
            <input name="description" defaultValue={existing?.description ?? ""} placeholder="Optional" />
          </Field>
          <label className="field full row" style={{ gap: 8 }}>
            <input type="checkbox" checked={sellable} onChange={(e) => setSellable(e.target.checked)} />
            <span>Sold at the school store</span>
          </label>
          {sellable ? (
            <Field label="Store price (₹)" required>
              <input name="sale_price" type="number" min={0} step="0.01" required defaultValue={existing?.sale_price ?? ""} />
            </Field>
          ) : null}
          {existing ? (
            <label className="field full row" style={{ gap: 8 }}>
              <input type="checkbox" name="is_active" defaultChecked={existing.is_active} />
              <span>Active</span>
            </label>
          ) : null}
        </div>
        {existing ? <p className="muted small" style={{ marginTop: 12 }}>{`On hand: ${qty(existing.on_hand)} ${existing.unit}. Stock changes are recorded as receipts and issues, not edited here.`}</p> : null}
        <ModalActions saving={saving} label={existing ? "Save changes" : "Add item"} onCancel={onClose} />
      </form>
    </Modal>
  );
}
