"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, INV, Modal, ModalActions, orNull, useNewFlag, type Supplier } from "./common";

/** SCR-238, live: GET/POST /inventory/suppliers, PUT /inventory/suppliers/{id}. */
export function SupplierManagement() {
  const list = useApi<Supplier[]>(`${INV}/suppliers`);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [adding, closeAdd] = useNewFlag();

  // The endpoint takes no filters; the list is short, so narrow it here.
  const s = search.trim().toLowerCase();
  const shown = (list.data ?? []).filter(
    (x) =>
      (!s || [x.name, x.contact_person, x.phone, x.email, x.gstin, x.category].some((v) => v?.toLowerCase().includes(s))) &&
      (status === "active" ? x.is_active : status === "inactive" ? !x.is_active : true),
  );
  const rows: Row[] = shown.map((x) => [{ name: x.name, sub: x.gstin ? `GSTIN ${x.gstin}` : undefined }, x.category ?? "—", x.contact_person ?? "—", x.phone ?? "—", x.email ?? "—", x.is_active ? "Active" : "Inactive"]);
  const active = (list.data ?? []).filter((x) => x.is_active).length;
  const n = (v: number, ready: unknown) => (ready ? v.toLocaleString("en-IN") : "…");
  const stats = [
    { label: "Suppliers", value: n(list.data?.length ?? 0, list.data), note: "On record" },
    { label: "Active", value: n(active, list.data), note: "Can be bought from" },
    { label: "Inactive", value: n((list.data?.length ?? 0) - active, list.data), note: "Switched off" },
    { label: "Categories", value: n(new Set((list.data ?? []).map((x) => x.category).filter(Boolean)).size, list.data), note: "Kinds of supply" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search supplier management…" aria-label="Search suppliers" />
        </div>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel
        
        action={
          <button type="button" className="btn" data-columns="">
            <Icon name="grid" className="sm" />
            Columns
          </button>
        }
        flush
      >
        <DataTable
          columns={["Supplier", "Category", "Contact", "Phone", "Email address", "Status"]}
          rows={rows}
          onView={(i) => setEditing(shown[i])}
          empty={list.loading ? "Loading suppliers…" : s || status ? "No suppliers match these filters." : undefined}
          emptyState={{
            title: "No suppliers yet",
            note: "A supplier record is who purchases and repairs are booked against, with their contact and GSTIN on file.",
            action: (
              <Link href="/inventory-labs/supplier-management?new=1" className="btn primary" scroll={false}>
                <Icon name="plus" className="sm" />
                Add supplier
              </Link>
            ),
          }}
        />
      </Panel>
      {adding ? <SupplierDialog existing={null} onClose={closeAdd} onSaved={() => (closeAdd(), list.reload())} /> : null}
      {editing ? <SupplierDialog existing={editing} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), list.reload())} /> : null}
    </>
  );
}

function SupplierDialog({ existing, onClose, onSaved }: { existing: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: String(f.get("name") ?? "").trim(),
      contact_person: orNull(f.get("contact_person")),
      phone: orNull(f.get("phone")),
      email: orNull(f.get("email")),
      gstin: orNull(f.get("gstin"))?.toUpperCase() ?? null,
      address: orNull(f.get("address")),
      category: orNull(f.get("category")),
      is_active: existing ? f.get("is_active") === "on" : true,
    };
    setSaving(true);
    setError(null);
    try {
      if (existing) await api.put(`${INV}/suppliers/${existing.id}`, body);
      else await api.post(`${INV}/suppliers`, body);
      notify(existing ? "Supplier saved." : `${body.name} added.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={existing ? `Edit ${existing.name}` : "Add supplier"} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <Field label="Supplier name" required>
            <input name="name" required defaultValue={existing?.name} placeholder="Enter supplier name" />
          </Field>
          <Field label="Category">
            <input name="category" maxLength={80} defaultValue={existing?.category ?? ""} list="supplier-categories" placeholder="e.g. Stationery, Lab equipment" />
            <datalist id="supplier-categories">
              <option value="Stationery" />
              <option value="Lab equipment" />
              <option value="IT & electronics" />
              <option value="Furniture" />
              <option value="Sports" />
              <option value="Uniforms" />
              <option value="Maintenance" />
            </datalist>
          </Field>
          <Field label="Contact person">
            <input name="contact_person" defaultValue={existing?.contact_person ?? ""} />
          </Field>
          <Field label="Phone">
            <input name="phone" type="tel" defaultValue={existing?.phone ?? ""} />
          </Field>
          <Field label="Email address">
            <input name="email" type="email" defaultValue={existing?.email ?? ""} />
          </Field>
          <Field label="GSTIN">
            <input name="gstin" defaultValue={existing?.gstin ?? ""} maxLength={15} />
          </Field>
          <Field label="Address">
            <input name="address" defaultValue={existing?.address ?? ""} />
          </Field>
          {existing ? (
            <label className="field full row" style={{ gap: 8 }}>
              <input type="checkbox" name="is_active" defaultChecked={existing.is_active} />
              <span>Active</span>
            </label>
          ) : null}
        </div>
        <ModalActions saving={saving} label={existing ? "Save changes" : "Add supplier"} onCancel={onClose} />
      </form>
    </Modal>
  );
}
