"use client";

import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Dialog, Field } from "./common";
import type { Payables, Supplier } from "./types";

/**
 * SCR-168, live: suppliers from GET /school/inventory/suppliers (contact
 * details; POST/PUT to add or edit) joined to GET /school/finance/payables,
 * which works out what the school owes each from their bills less payments.
 */
export function Vendors() {
  const suppliers = useApi<Supplier[]>("/api/v1/school/inventory/suppliers");
  const payables = useApi<Payables>("/api/v1/school/finance/payables");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);

  const owed = new Map((payables.data?.suppliers ?? []).map((p) => [p.supplier_id, p]));
  const statusOf = (s: Supplier) => {
    const p = owed.get(s.id);
    if (!s.is_active) return "Inactive";
    if (p && Number(p.overdue) > 0) return "Overdue";
    if (p && Number(p.outstanding) > 0) return "Pending";
    return "Settled";
  };
  const items = (suppliers.data ?? []).filter((s) => {
    const term = q.trim().toLowerCase();
    if (term && !`${s.name} ${s.contact_person ?? ""} ${s.gstin ?? ""}`.toLowerCase().includes(term)) return false;
    return !status || statusOf(s) === status;
  });
  const rows: Row[] = items.map((s) => {
    const p = owed.get(s.id);
    return [s.name, s.gstin ? `GSTIN ${s.gstin}` : "—", s.contact_person ?? "—", s.phone ?? "—", p ? money(p.outstanding) : money(0), statusOf(s)];
  });
  const pd = payables.data;
  const count = (st: string) => (suppliers.data && payables.data ? suppliers.data.filter((s) => statusOf(s) === st).length.toLocaleString("en-IN") : "…");
  const stats = [
    { label: "Vendors", value: suppliers.data ? String(suppliers.data.filter((s) => s.is_active).length) : "…", note: suppliers.data ? `Active, of ${suppliers.data.length}` : "Active" },
    { label: "Owed", value: pd ? money(pd.total_outstanding) : "…", note: pd ? `To ${pd.suppliers_owed} vendor${pd.suppliers_owed === 1 ? "" : "s"}` : "Bills less payments" },
    { label: "Overdue", value: pd ? money(pd.total_overdue) : "…", note: "Past the bill's due date" },
    { label: "Overdue vendors", value: count("Overdue"), note: "Need paying first" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendors…" aria-label="Search records" />
        </div>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="Overdue">Overdue</option>
          <option value="Pending">Owed</option>
          <option value="Settled">Settled</option>
          <option value="Inactive">Inactive</option>
        </select>
        <button type="button" className="btn primary" onClick={() => setEditing("new")}>
          <Icon name="plus" className="sm" />
          Add vendor
        </button>
      </div>
      <ErrorNote>{suppliers.error ?? payables.error}</ErrorNote>
      <Panel flush>
        <DataTable
          columns={["Vendor", "Tax ID", "Contact", "Phone", "Outstanding", "Status"]}
          rows={rows}
          onView={(i) => setEditing(items[i])}
          empty={suppliers.loading ? "Loading vendors…" : q || status ? "No vendors match these filters." : undefined}
          emptyState={{
            title: "No vendors yet",
            note: "Add the suppliers the school buys from to raise purchase orders and track what is owed them.",
            action: (
              <button type="button" className="btn primary" onClick={() => setEditing("new")}>
                Add vendor
              </button>
            ),
          }}
        />
      </Panel>
      {editing ? (
        <VendorForm
          s={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            suppliers.reload();
            payables.reload();
          }}
        />
      ) : null}
    </>
  );
}

function VendorForm({ s, onClose, onSaved }: { s: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: s?.name ?? "", contact_person: s?.contact_person ?? "", phone: s?.phone ?? "", email: s?.email ?? "", gstin: s?.gstin ?? "", address: s?.address ?? "", is_active: s?.is_active ?? true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const t = (v: string) => v.trim() || null;
    const body = { name: f.name.trim(), contact_person: t(f.contact_person), phone: t(f.phone), email: t(f.email), gstin: t(f.gstin), address: t(f.address), is_active: f.is_active };
    try {
      if (s) await api.put(`/api/v1/school/inventory/suppliers/${s.id}`, body);
      else await api.post("/api/v1/school/inventory/suppliers", body);
      notify(s ? "Vendor updated." : "Vendor added.");
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title={s ? s.name : "Add vendor"} onClose={onClose}>
      <form onSubmit={save}>
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <Field label="Vendor name" required>
            <input value={f.name} onChange={set("name")} minLength={2} maxLength={160} required />
          </Field>
          <Field label="Contact person">
            <input value={f.contact_person} onChange={set("contact_person")} maxLength={120} />
          </Field>
          <Field label="Phone">
            <input type="tel" value={f.phone} onChange={set("phone")} maxLength={20} />
          </Field>
          <Field label="Email">
            <input type="email" value={f.email} onChange={set("email")} maxLength={255} />
          </Field>
          <Field label="GSTIN">
            <input value={f.gstin} onChange={set("gstin")} maxLength={15} />
          </Field>
          <Field label="Status">
            <select value={f.is_active ? "1" : "0"} onChange={(e) => setF({ ...f, is_active: e.target.value === "1" })}>
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </Field>
          <Field label="Address" full>
            <textarea value={f.address} onChange={set("address")} maxLength={1000} />
          </Field>
        </div>
        <div className="row actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : s ? "Save changes" : "Add vendor"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
