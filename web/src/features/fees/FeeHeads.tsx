"use client";

import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field } from "./common";
import { ToggleRow, useNewFlag } from "./extra";
import type { FeeHead } from "./types";

type Form = { id: number; name: string; code: string; is_recurring: boolean; late_fee_type: FeeHead["late_fee_type"]; late_fee_value: string; late_fee_after_days: string; is_active: boolean };
const EMPTY: Form = { id: 0, name: "", code: "", is_recurring: true, late_fee_type: "none", late_fee_value: "0", late_fee_after_days: "0", is_active: true };

const lateFee = (h: FeeHead) =>
  h.late_fee_type === "none" || !Number(h.late_fee_value)
    ? "None"
    : `${h.late_fee_type === "percent" ? `${Number(h.late_fee_value)}%` : money(h.late_fee_value)} after ${h.late_fee_after_days} day${h.late_fee_after_days === 1 ? "" : "s"}`;

/**
 * NEW-040, live: GET /school/fees/heads, POST to add, PATCH /heads/{id} to
 * edit or (de)activate, DELETE /heads/{id}. The server refuses to delete a
 * head that a fee structure uses; deactivating it is the way out.
 */
export function FeeHeads() {
  const heads = useApi<FeeHead[]>("/api/v1/school/fees/heads");
  const [open, setOpen] = useNewFlag();
  const [f, setF] = useState<Form>(EMPTY);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const all = heads.data ?? [];
  const items = all.filter((h) => {
    const term = q.trim().toLowerCase();
    if (term && !`${h.name} ${h.code}`.toLowerCase().includes(term)) return false;
    if (status === "active" && !h.is_active) return false;
    if (status === "inactive" && h.is_active) return false;
    return true;
  });
  const n = (v: number) => (heads.data ? String(v) : "…");
  const stats = [
    { label: "Fee heads", value: n(all.length), note: "Defined for the school" },
    { label: "Active", value: n(all.filter((h) => h.is_active).length), note: "Can be charged" },
    { label: "Monthly", value: n(all.filter((h) => h.is_recurring).length), note: "Raised every month" },
    { label: "With a late fee", value: n(all.filter((h) => h.late_fee_type !== "none" && Number(h.late_fee_value) > 0).length), note: "Charged when paid late" },
  ];
  const rows: Row[] = items.map((h) => [h.name, h.code, h.is_recurring ? "Monthly" : "One-time", lateFee(h), h.is_active ? "Active" : "Inactive"]);

  function edit(h: FeeHead | null) {
    setFormError(null);
    setF(
      h
        ? { id: h.id, name: h.name, code: h.code, is_recurring: h.is_recurring, late_fee_type: h.late_fee_type, late_fee_value: String(Number(h.late_fee_value)), late_fee_after_days: String(h.late_fee_after_days), is_active: h.is_active }
        : EMPTY,
    );
    setOpen(true);
  }
  const close = () => {
    setOpen(false);
    setF(EMPTY);
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const body = {
      name: f.name.trim(),
      code: f.code.trim().toUpperCase(),
      is_recurring: f.is_recurring,
      late_fee_type: f.late_fee_type,
      late_fee_value: f.late_fee_type === "none" ? "0" : f.late_fee_value || "0",
      late_fee_after_days: f.late_fee_type === "none" ? 0 : Number(f.late_fee_after_days) || 0,
    };
    try {
      if (f.id) await api.patch(`/api/v1/school/fees/heads/${f.id}`, { ...body, is_active: f.is_active });
      else await api.post("/api/v1/school/fees/heads", body);
      notify(f.id ? "Fee head updated." : "Fee head added.");
      close();
      heads.reload();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function setActive(h: FeeHead, is_active: boolean) {
    setError(null);
    try {
      await api.patch(`/api/v1/school/fees/heads/${h.id}`, { is_active });
      notify(is_active ? `${h.name} is active again.` : `${h.name} deactivated. It will not be charged from now on.`);
      heads.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove(h: FeeHead) {
    if (!window.confirm(`Delete the fee head "${h.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.delete(`/api/v1/school/fees/heads/${h.id}`);
      notify("Fee head deleted.");
      heads.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or code…" aria-label="Search fee heads" />
        </div>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{error ?? heads.error}</ErrorNote>
      <Panel title="All fee heads" sub={`What the school charges for. Amounts per class are set in the fee structure.${heads.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Fee head", "Code", "Frequency", "Late fee", "Status"]}
          rows={rows}
          actions={(i) => (
            <>
              <button type="button" className="btn" onClick={() => edit(items[i])}>
                Edit
              </button>
              <button type="button" className="btn" onClick={() => setActive(items[i], !items[i].is_active)}>
                {items[i].is_active ? "Deactivate" : "Activate"}
              </button>
              <button type="button" className="btn danger" onClick={() => remove(items[i])}>
                Delete
              </button>
            </>
          )}
          empty={heads.loading ? "Loading fee heads…" : q || status ? "No fee heads match these filters." : "No fee heads yet. Add Tuition, Transport and the rest."}
        />
      </Panel>
      <Dialog
        open={open}
        title={f.id ? `Edit ${f.name || "fee head"}` : "Add fee head"}
        onClose={close}
        onSubmit={save}
        actions={
          <>
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : f.id ? "Save changes" : "Add fee head"}
            </button>
          </>
        }
      >
        <ErrorNote>{formError}</ErrorNote>
        <div className="form-grid">
          <Field label="Name" required>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} minLength={1} maxLength={120} required placeholder="Tuition fee" />
          </Field>
          <Field label="Code" required>
            <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} minLength={1} maxLength={30} required placeholder="TUITION" />
          </Field>
          <Field label="Frequency" required>
            <select value={f.is_recurring ? "1" : "0"} onChange={(e) => setF({ ...f, is_recurring: e.target.value === "1" })}>
              <option value="1">Monthly (raised when fees are generated)</option>
              <option value="0">One-time</option>
            </select>
          </Field>
          <Field label="Late fee">
            <select value={f.late_fee_type} onChange={(e) => setF({ ...f, late_fee_type: e.target.value as Form["late_fee_type"] })}>
              <option value="none">None</option>
              <option value="fixed">Fixed amount</option>
              <option value="percent">Percent of the due</option>
            </select>
          </Field>
          {f.late_fee_type !== "none" ? (
            <>
              <Field label={f.late_fee_type === "percent" ? "Late fee (%)" : "Late fee (₹)"} required>
                <input type="number" min={0} step="0.01" max={f.late_fee_type === "percent" ? 100 : undefined} value={f.late_fee_value} onChange={(e) => setF({ ...f, late_fee_value: e.target.value })} required />
              </Field>
              <Field label="Charged after (days late)" required>
                <input type="number" min={0} max={365} value={f.late_fee_after_days} onChange={(e) => setF({ ...f, late_fee_after_days: e.target.value })} required />
              </Field>
            </>
          ) : null}
        </div>
        {f.id ? <ToggleRow title="Active" note="An inactive head is not charged when fees are generated." checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} /> : null}
      </Dialog>
    </>
  );
}
