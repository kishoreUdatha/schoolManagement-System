"use client";

import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
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
      (!s || [x.name, x.contact_person, x.phone, x.email, x.gstin].some((v) => v?.toLowerCase().includes(s))) &&
      (status === "active" ? x.is_active : status === "inactive" ? !x.is_active : true),
  );
  // Not wired: the mock's "Category" column — suppliers carry no category; GSTIN is shown instead.
  const rows: Row[] = shown.map((x) => [x.name, x.contact_person ?? "—", x.phone ?? "—", x.email ?? "—", x.gstin ?? "—", x.is_active ? "Active" : "Inactive"]);
  const active = (list.data ?? []).filter((x) => x.is_active).length;

  return (
    <>
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
        title="All records"
        sub={`${list.data?.length ?? 0} supplier(s) · ${active} active${list.loading ? " · Loading…" : ""}`}
        action={
          <button type="button" className="btn" data-columns="">
            <Icon name="grid" className="sm" />
            Columns
          </button>
        }
        flush
      >
        <DataTable
          columns={["Supplier", "Contact", "Phone", "Email address", "GSTIN", "Status"]}
          rows={rows}
          onView={(i) => setEditing(shown[i])}
          empty={list.loading ? "Loading suppliers…" : s || status ? "No suppliers match these filters." : "No suppliers yet. Add the first one."}
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
