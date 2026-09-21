"use client";

import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { date, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { AssetDetailDialog } from "./AssetDialogs";
import { ASSET_STATUS, Field, INV, Modal, useNewFlag, type Asset, type Assignment } from "./common";

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
  const stillOut = (list.data ?? []).filter((r) => !r.returned_on).length;

  const reload = () => {
    list.reload();
    assets.reload();
  };

  return (
    <>
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
      {/* Not wired: "Bulk assign" — the API records one asset event at a time. */}
      <Panel
        title="Allocation workspace"
        sub={`${openOnly ? "What is out right now, and with whom" : "Every assignment ever made"} · ${stillOut} still out${list.loading ? " · Loading…" : ""}`}
        flush
      >
        <DataTable
          columns={["Asset", "Asset code", "Current location", "New location", "New custodian", "Transfer date"]}
          rows={rows}
          onView={(i) => setAsset(shown[i].asset_id)}
          empty={list.loading ? "Loading assignments…" : openOnly ? "Nothing is out at the moment." : "Nothing has been assigned yet."}
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
    </>
  );
}
