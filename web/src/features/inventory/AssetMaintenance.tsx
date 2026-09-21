"use client";

import { useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { date, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { AssetDetailDialog } from "./AssetDialogs";
import { ASSET_STATUS, Field, INV, Modal, Tip, daysUntil, useNewFlag, type Asset } from "./common";

const SOON = 30;

function warranty(a: Asset): string {
  const d = daysUntil(a.warranty_until);
  if (d === null) return "Not recorded";
  if (d < 0) return `Ended ${date(a.warranty_until)}`;
  if (d <= SOON) return `Ends in ${d} day${d === 1 ? "" : "s"}`;
  return `Until ${date(a.warranty_until)}`;
}

/**
 * SCR-241, live: GET /inventory/assets with repair spend and warranty, and
 * repairs logged as asset events (maintenance / repaired).
 */
export function AssetMaintenance() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [choosing, closeChoose] = useNewFlag();
  const list = useApi<Asset[]>(`${INV}/assets`, { status: status === "soon" ? "" : status });

  const s = search.trim().toLowerCase();
  const all = list.data ?? [];
  const shown = all
    .filter((a) => !s || [a.name, a.asset_tag, a.location, a.category].some((v) => v?.toLowerCase().includes(s)))
    .filter((a) => {
      if (status !== "soon") return true;
      const d = daysUntil(a.warranty_until);
      return d !== null && d >= 0 && d <= SOON;
    })
    // What is away being repaired comes first.
    .sort((a, b) => Number(b.status === "under_repair") - Number(a.status === "under_repair"));
  const expiring = all.filter((a) => {
    const d = daysUntil(a.warranty_until);
    return d !== null && d >= 0 && d <= SOON;
  });
  const inRepair = all.filter((a) => a.status === "under_repair").length;
  const spent = all.reduce((n, a) => n + Number(a.maintenance_cost || 0), 0);

  // Not wired: the mock's "Issue" and "Due date" columns — an asset has no service
  // schedule or open fault record; repair spend and warranty are what the register holds.
  const rows: Row[] = shown.map((a) => [
    { name: a.name, sub: a.asset_tag },
    a.location ?? "—",
    Number(a.maintenance_cost) > 0 ? money(a.maintenance_cost) : "—",
    a.assigned_to_name ?? "—",
    warranty(a),
    ASSET_STATUS[a.status],
  ]);

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search asset maintenance…" aria-label="Search assets" />
        </div>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses (not disposed)</option>
          <option value="under_repair">Under repair</option>
          <option value="in_use">In use</option>
          <option value="in_store">In store</option>
          <option value="soon">{`Warranty ending within ${SOON} days`}</option>
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      {expiring.length ? (
        <Tip warn>{`${expiring.length} asset(s) come out of warranty within ${SOON} days. A repair booked after that date is the school's bill rather than the supplier's.`}</Tip>
      ) : null}
      <Panel title="Records" sub={`${inRepair} under repair · ${money(spent)} spent on repairs so far${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Asset", "Location", "Spent on repairs", "Assigned to", "Warranty", "Status"]}
          rows={rows}
          onView={(i) => setOpen(shown[i].id)}
          empty={list.loading ? "Loading assets…" : s || status ? "No assets match these filters." : "No assets have been registered yet."}
        />
      </Panel>
      <Tip>There is no service schedule on an asset, so nothing here says when one is next due. Open an asset to log a repair or mark it back in service.</Tip>
      {choosing ? (
        <Modal title="Log maintenance" onClose={closeChoose}>
          <Field label="Asset" required>
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                setOpen(Number(e.target.value));
                closeChoose();
              }}
            >
              <option value="">Choose an asset</option>
              {all
                .filter((a) => a.status !== "disposed")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {`${a.asset_tag} · ${a.name} (${ASSET_STATUS[a.status]})`}
                  </option>
                ))}
            </select>
          </Field>
        </Modal>
      ) : null}
      {open !== null ? <AssetDetailDialog assetId={open} only={["maintenance", "repaired"]} onClose={() => setOpen(null)} onChanged={list.reload} /> : null}
    </>
  );
}
