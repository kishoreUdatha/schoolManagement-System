"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { AssetCreateDialog, AssetDetailDialog } from "./AssetDialogs";
import { ASSET_STATUS, INV, useNewFlag, type Asset } from "./common";

/** SCR-239, live: GET /inventory/assets (q, status); register an asset; open one for its history or to edit it (PATCH /inventory/assets/{id}). */
export function AssetRegister() {
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [adding, closeAdd] = useNewFlag();

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  // Without a status the API leaves disposed assets out.
  const list = useApi<Asset[]>(`${INV}/assets`, { q: search, status });
  const categories = useMemo(() => [...new Set((list.data ?? []).map((a) => a.category).filter((c): c is string => !!c))].sort(), [list.data]);
  const shown = (list.data ?? []).filter((a) => !category || a.category === category);
  const rows: Row[] = shown.map((a) => [
    { name: a.name, sub: a.serial_no ? `Serial ${a.serial_no}` : undefined },
    a.asset_tag,
    a.category ?? "—",
    a.location ?? "—",
    a.assigned_to_name ?? "—",
    ASSET_STATUS[a.status],
  ]);
  const value = shown.reduce((n, a) => n + Number(a.cost ?? 0), 0);

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search asset register…" aria-label="Search by name, tag, serial or location" />
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
          <option value="">All statuses (not disposed)</option>
          <option value="in_use">In use</option>
          <option value="in_store">In store</option>
          <option value="under_repair">Under repair</option>
          <option value="disposed">Disposed</option>
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel
        title="All records"
        sub={`${shown.length} asset(s) · ${money(value)} at cost · open a row for its history${list.loading ? " · Loading…" : ""}`}
        action={
          <button type="button" className="btn" data-columns="">
            <Icon name="grid" className="sm" />
            Columns
          </button>
        }
        flush
      >
        <DataTable
          columns={["Asset", "Asset code", "Category", "Location", "Custodian", "Status"]}
          rows={rows}
          onView={(i) => setOpen(shown[i].id)}
          empty={list.loading ? "Loading assets…" : search || category || status ? "No assets match these filters." : "No assets have been registered yet."}
        />
      </Panel>
      {adding ? <AssetCreateDialog onClose={closeAdd} onSaved={() => (closeAdd(), list.reload())} /> : null}
      {open !== null ? <AssetDetailDialog assetId={open} editable onClose={() => setOpen(null)} onChanged={list.reload} /> : null}
    </>
  );
}
