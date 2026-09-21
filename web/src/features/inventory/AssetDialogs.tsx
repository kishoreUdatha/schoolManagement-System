"use client";

import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { ASSET_STATUS, Field, INV, Modal, ModalActions, orNull, today, type Asset, type AssetStatus, type StaffRow, type Supplier } from "./common";

type EventKind = "assigned" | "returned" | "moved" | "maintenance" | "repaired" | "disposed";

/** What can happen next to an asset in each state (as the old frontend offered). */
export const NEXT: Record<AssetStatus, [EventKind, string][]> = {
  in_store: [["assigned", "Assign / install"], ["moved", "Move"], ["maintenance", "Send for repair"], ["disposed", "Dispose"]],
  in_use: [["returned", "Return to store"], ["assigned", "Reassign"], ["moved", "Move"], ["maintenance", "Send for repair"]],
  under_repair: [["repaired", "Repaired"], ["disposed", "Dispose"]],
  disposed: [],
};

/** POST /inventory/assets. */
export function AssetCreateDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const suppliers = useApi<Supplier[]>(`${INV}/suppliers`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const supplier = orNull(f.get("supplier_id"));
    const body = {
      name: String(f.get("name") ?? "").trim(),
      asset_tag: orNull(f.get("asset_tag")),
      category: orNull(f.get("category")),
      serial_no: orNull(f.get("serial_no")),
      location: orNull(f.get("location")),
      purchase_date: orNull(f.get("purchase_date")),
      cost: orNull(f.get("cost")),
      supplier_id: supplier ? Number(supplier) : null,
      warranty_until: orNull(f.get("warranty_until")),
      notes: orNull(f.get("notes")),
    };
    setSaving(true);
    setError(null);
    try {
      const a = await api.post<Asset>(`${INV}/assets`, body);
      notify(`Registered ${a.name} as ${a.asset_tag}.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Register asset" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorNote>{error ?? suppliers.error}</ErrorNote>
        <div className="form-grid">
          <Field label="Asset name" required>
            <input name="name" required placeholder="Classroom projector" />
          </Field>
          <Field label="Asset code">
            <input name="asset_tag" placeholder="Leave blank to number automatically" />
          </Field>
          <Field label="Category">
            <input name="category" placeholder="Electronics, Furniture…" />
          </Field>
          <Field label="Serial no.">
            <input name="serial_no" />
          </Field>
          <Field label="Location">
            <input name="location" placeholder="Room 201" />
          </Field>
          <Field label="Purchased on">
            <input name="purchase_date" type="date" />
          </Field>
          <Field label="Cost (₹)">
            <input name="cost" type="number" min={0} step="0.01" />
          </Field>
          <Field label="Supplier">
            <select name="supplier_id" defaultValue="">
              <option value="">Not recorded</option>
              {suppliers.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Warranty until">
            <input name="warranty_until" type="date" />
          </Field>
          <Field label="Notes">
            <input name="notes" />
          </Field>
        </div>
        <ModalActions saving={saving} label="Register asset" onCancel={onClose} />
      </form>
    </Modal>
  );
}

/**
 * One asset: its details, its history (GET /inventory/assets/{id}) and the
 * next event it can take (POST /inventory/assets/{id}/events).
 * `only` narrows the event choices (e.g. maintenance and repaired).
 */
export function AssetDetailDialog({ assetId, onClose, onChanged, only }: { assetId: number; onClose: () => void; onChanged: () => void; only?: EventKind[] }) {
  const asset = useApi<Asset>(`${INV}/assets/${assetId}`);
  const staff = useApi<StaffRow[]>("/api/v1/school/directory/staff");
  const [kind, setKind] = useState<EventKind | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = asset.data;
  const choices = a ? NEXT[a.status].filter(([k]) => !only || only.includes(k)) : [];

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!kind) return;
    const f = new FormData(e.currentTarget);
    const to = orNull(f.get("to_user_id"));
    setSaving(true);
    setError(null);
    try {
      await api.post<Asset>(`${INV}/assets/${assetId}/events`, {
        kind,
        happened_on: orNull(f.get("happened_on")),
        to_user_id: to ? Number(to) : null,
        location: orNull(f.get("location")),
        cost: orNull(f.get("cost")),
        notes: orNull(f.get("notes")),
      });
      notify(`${a?.name ?? "Asset"}: ${choices.find(([k]) => k === kind)?.[1].toLowerCase() ?? "recorded"}.`);
      setKind("");
      asset.reload();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={a ? `${a.asset_tag} · ${a.name}` : "Asset"} onClose={onClose} wide>
      <ErrorNote>{error ?? asset.error}</ErrorNote>
      {!a ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <dl className="kv">
            {(
              [
                ["Status", ASSET_STATUS[a.status]],
                ["Category", a.category ?? "—"],
                ["Location", a.location ?? "—"],
                ["Custodian", a.assigned_to_name ?? "—"],
                ["Serial no.", a.serial_no ?? "—"],
                ["Cost", money(a.cost)],
                ["Supplier", a.supplier_name ?? "—"],
                ["Warranty until", a.warranty_until ? `${date(a.warranty_until)}${a.warranty_active ? "" : " (ended)"}` : "—"],
                ["Spent on repairs", money(a.maintenance_cost)],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {choices.length ? (
            <form onSubmit={submit} style={{ marginTop: 18 }}>
              <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {choices.map(([k, l]) => (
                  <button key={k} type="button" className={`btn ${kind === k ? "primary" : ""}`} onClick={() => setKind(k)}>
                    {l}
                  </button>
                ))}
              </div>
              {kind ? (
                <>
                  <div className="form-grid">
                    {kind === "assigned" ? (
                      <Field label="Custodian">
                        <select name="to_user_id" defaultValue="">
                          <option value="">— (location only)</option>
                          {staff.data?.map((s) => (
                            <option key={s.user_id} value={s.user_id}>
                              {s.full_name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : null}
                    {["assigned", "moved", "returned"].includes(kind) ? (
                      <Field label="Location" required={kind === "moved"}>
                        <input name="location" required={kind === "moved"} placeholder="Room 201" />
                      </Field>
                    ) : null}
                    {["maintenance", "repaired", "disposed"].includes(kind) ? (
                      <Field label="Cost (₹)">
                        <input name="cost" type="number" min={0} step="0.01" />
                      </Field>
                    ) : null}
                    <Field label="Date">
                      <input name="happened_on" type="date" defaultValue={today()} />
                    </Field>
                    <Field label="Notes" full>
                      <input name="notes" placeholder={kind === "maintenance" ? "What is wrong with it" : "Optional"} />
                    </Field>
                  </div>
                  {kind === "maintenance" && a.warranty_active ? <p className="muted small" style={{ marginTop: 10 }}>Still under warranty — the supplier may be paying.</p> : null}
                  <ModalActions saving={saving} label="Save" onCancel={() => setKind("")} />
                </>
              ) : null}
            </form>
          ) : null}
          <h3 style={{ margin: "22px 0 8px" }}>History</h3>
          {a.events?.length ? (
            a.events.map((ev) => (
              <div className="timeline-item" key={ev.id}>
                <span className="timeline-dot" />
                <div>
                  <h4>
                    {label(ev.kind)} <Badge>{date(ev.happened_on)}</Badge>
                  </h4>
                  <p>{[ev.to_user_name, ev.location, ev.cost ? money(ev.cost) : null, ev.notes, ev.recorded_by_name ? `by ${ev.recorded_by_name}` : null].filter(Boolean).join(" · ") || "—"}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">Nothing has been recorded against this asset yet.</p>
          )}
        </>
      )}
    </Modal>
  );
}
