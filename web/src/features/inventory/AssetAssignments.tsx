"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { AssetDetailDialog } from "./AssetDialogs";
import { ASSET_STATUS, Field, INV, Modal, ModalActions, orNull, today, useNewFlag, type Asset, type Assignment, type StaffRow } from "./common";

/**
 * SCR-240, live: GET /inventory/assignments (open_only) — what is out and
 * with whom — and a transfer recorded as an asset event
 * (POST /inventory/assets/{id}/events: assigned, moved or returned).
 */
export function AssetAssignments() {
  const [openOnly, setOpenOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [asset, setAsset] = useState<number | null>(null);
  const [choosing, closeChoose] = useNewFlag();
  const [bulk, setBulk] = useState(false);

  const list = useApi<Assignment[]>(`${INV}/assignments`, { open_only: openOnly });
  const assets = useApi<Asset[]>(`${INV}/assets`);
  const assetById = useMemo(() => new Map((assets.data ?? []).map((a) => [a.id, a])), [assets.data]);

  const s = search.trim().toLowerCase();
  const shown = (list.data ?? []).filter((r) => !s || [r.asset_name, r.asset_tag, r.user_name, r.location].some((v) => v?.toLowerCase().includes(s)));
  const rows: Row[] = shown.map((r) => [
    { name: r.asset_name, sub: r.returned_on ? `Returned ${date(r.returned_on)}${r.ended_by ? ` · ${label(r.ended_by)}` : ""}` : "Still out" },
    r.asset_tag,
    assetById.get(r.asset_id)?.location ?? "—",
    r.location ?? "—",
    r.user_name ?? "—",
    date(r.assigned_on),
  ]);
  const out = (list.data ?? []).filter((r) => !r.returned_on);
  const stillOut = out.length;
  const byStatus = (st: Asset["status"]) => (assets.data ?? []).filter((a) => a.status === st).length;
  const n = (v: number, ready: unknown) => (ready ? v.toLocaleString("en-IN") : "…");
  const stats = [
    { label: "Out now", value: n(stillOut, list.data), note: "Assigned, not yet returned" },
    { label: "Custodians", value: n(new Set(out.map((r) => r.user_id ?? r.user_name).filter((v) => v !== null)).size, list.data), note: "Holding an asset" },
    { label: "In store", value: n(byStatus("in_store"), assets.data), note: "Free to assign" },
    { label: "Under repair", value: n(byStatus("under_repair"), assets.data), note: "Cannot be transferred" },
  ];

  const reload = () => {
    list.reload();
    assets.reload();
  };

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search asset assignment or transfer…" aria-label="Search assignments" />
        </div>
        <select aria-label="Filter status" value={openOnly ? "open" : "all"} onChange={(e) => setOpenOnly(e.target.value === "open")}>
          <option value="open">Still out</option>
          <option value="all">Every assignment, including returned</option>
        </select>
      </div>
      <ErrorNote>{list.error ?? assets.error}</ErrorNote>
      <Panel
        title="Allocation workspace"
        action={
          <button type="button" className="btn" onClick={() => setBulk(true)}>
            <Icon name="plus" className="sm" />
            Bulk assign
          </button>
        }
        sub={`${openOnly ? "What is out right now, and with whom" : "Every assignment ever made"} · ${stillOut} still out${list.loading ? " · Loading…" : ""}`}
        flush
      >
        <DataTable
          columns={["Asset", "Asset code", "Current location", "New location", "New custodian", "Transfer date"]}
          rows={rows}
          onView={(i) => setAsset(shown[i].asset_id)}
          empty={list.loading ? "Loading assignments…" : openOnly ? "Nothing is out at the moment." : undefined}
          emptyState={{
            title: "Nothing assigned yet",
            note: "An assignment records who is holding an asset, or where it has been moved, once one leaves the store.",
            action: (
              <Link href="/inventory-labs/asset-assignment-transfer?new=1" className="btn primary" scroll={false}>
                <Icon name="check" className="sm" />
                Transfer asset
              </Link>
            ),
          }}
        />
      </Panel>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>Each transfer is recorded on the asset&apos;s own history. Returning an asset to the store ends its assignment.</span>
      </div>
      {choosing ? (
        <Modal title="Transfer asset" onClose={closeChoose}>
          <Field label="Asset" required>
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                setAsset(Number(e.target.value));
                closeChoose();
              }}
            >
              <option value="">{assets.loading ? "Loading assets…" : "Choose an asset"}</option>
              {(assets.data ?? [])
                .filter((a) => a.status === "in_store" || a.status === "in_use")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {`${a.asset_tag} · ${a.name} (${ASSET_STATUS[a.status]}${a.location ? `, ${a.location}` : ""})`}
                  </option>
                ))}
            </select>
          </Field>
          <p className="muted small" style={{ marginTop: 10 }}>Assets under repair or disposed cannot be transferred.</p>
        </Modal>
      ) : null}
      {asset !== null ? <AssetDetailDialog assetId={asset} only={["assigned", "moved", "returned"]} onClose={() => setAsset(null)} onChanged={reload} /> : null}
      {bulk ? (
        <BulkAssign
          assets={(assets.data ?? []).filter((a) => a.status === "in_store")}
          onClose={() => setBulk(false)}
          onDone={() => {
            setBulk(false);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

/** Several store assets to one custodian or room at once: POST /inventory/assets/bulk-events. */
function BulkAssign({ assets, onClose, onDone }: { assets: Asset[]; onClose: () => void; onDone: () => void }) {
  const staff = useApi<StaffRow[]>("/api/v1/school/directory/staff");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = filter.trim().toLowerCase();
  const shown = assets.filter((a) => !q || [a.name, a.asset_tag, a.category].some((v) => v?.toLowerCase().includes(q)));
  const toggle = (id: number) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!picked.size) return setError("Tick the assets to assign.");
    const toUser = orNull(f.get("to_user_id"));
    const location = orNull(f.get("location"));
    if (!toUser && !location) return setError("Assign them to a staff member or a location.");
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<{ done: number[]; failed: { asset_id: number; error: string }[] }>(`${INV}/assets/bulk-events`, {
        asset_ids: [...picked],
        kind: "assigned",
        to_user_id: toUser ? Number(toUser) : null,
        location,
        happened_on: orNull(f.get("happened_on")),
        notes: orNull(f.get("notes")),
      });
      if (r.failed.length) {
        const tag = (id: number) => assets.find((a) => a.id === id)?.asset_tag ?? `#${id}`;
        setError(`${r.done.length} assigned; not assigned: ${r.failed.map((x) => `${tag(x.asset_id)} (${x.error})`).join("; ")}`);
        if (r.done.length) notify(`${r.done.length} asset(s) assigned.`);
        return;
      }
      notify(`${r.done.length} asset(s) assigned.`);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Bulk assign" onClose={onClose} wide>
      <form onSubmit={submit}>
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <Field label="Custodian">
            <select name="to_user_id" defaultValue="">
              <option value="">No one (a room or place)</option>
              {staff.data?.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location">
            <input name="location" maxLength={120} placeholder="Room 201" />
          </Field>
          <Field label="Date">
            <input type="date" name="happened_on" defaultValue={today()} />
          </Field>
          <Field label="Notes">
            <input name="notes" maxLength={300} />
          </Field>
          <Field label={`Assets in store · ${picked.size} ticked`} full>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name, code or category" />
          </Field>
        </div>
        <div style={{ maxHeight: 260, overflowY: "auto", marginTop: 8 }}>
          {shown.map((a) => (
            <label className="check-item" key={a.id}>
              <input type="checkbox" checked={picked.has(a.id)} onChange={() => toggle(a.id)} />
              <span>{`${a.asset_tag} · ${a.name}${a.location ? ` (${a.location})` : ""}`}</span>
            </label>
          ))}
          {!shown.length ? <p className="muted small">{assets.length ? "No assets match." : "Nothing is in the store to assign."}</p> : null}
        </div>
        <ModalActions saving={saving} label={`Assign ${picked.size || ""} asset(s)`} onCancel={onClose} />
      </form>
    </Modal>
  );
}
