"use client";

import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { useApi } from "@/lib/useApi";
import { INV, Tip, qty, type Item, type Lab } from "./common";

/**
 * SCR-243, partly live. A lab's equipment is one free-text note on the lab
 * record (GET /labs); nothing counts it. What can be counted is store stock
 * (GET /inventory/items), listed here by where it is kept.
 */
export function LabEquipment() {
  const labs = useApi<Lab[]>("/api/v1/school/labs");
  const items = useApi<Item[]>(`${INV}/items`);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("");

  const locations = useMemo(() => [...new Set((items.data ?? []).map((i) => i.location).filter((l): l is string => !!l))].sort(), [items.data]);
  const s = search.trim().toLowerCase();
  const shown = (items.data ?? []).filter(
    (i) =>
      (!s || [i.name, i.sku, i.category].some((v) => v?.toLowerCase().includes(s))) &&
      (!location || i.location === location) &&
      (status === "low" ? i.low_stock : status === "ok" ? !i.low_stock : true),
  );
  const rows: Row[] = shown.map((i) => [
    { name: i.name, sub: i.sku },
    i.location ?? "—",
    qty(i.on_hand),
    i.unit,
    qty(i.reorder_level),
    i.low_stock ? "Below minimum" : "Active",
  ]);
  const withNotes = (labs.data ?? []).filter((l) => l.equipment);
  const n = (v: number, ready: unknown) => (ready ? v.toLocaleString("en-IN") : "…");
  const stats = [
    { label: "Labs", value: n((labs.data ?? []).filter((l) => l.is_active).length, labs.data), note: "Active" },
    { label: "Equipment noted", value: n(withNotes.length, labs.data), note: "Labs with a written list" },
    { label: "Stock items", value: n(items.data?.length ?? 0, items.data), note: "Consumables counted in store" },
    { label: "Below minimum", value: n((items.data ?? []).filter((i) => i.low_stock).length, items.data), note: "Need reordering" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lab equipment & consumables…" aria-label="Search stock items" />
        </div>
        <select aria-label="Filter by where it is kept" value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="">Every location</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="low">Below minimum stock</option>
          <option value="ok">Above minimum stock</option>
        </select>
      </div>
      <ErrorNote>{items.error ?? labs.error}</ErrorNote>
      <Tip>Lab equipment is a note on each lab, not a stock list — nothing counts microscopes. Consumables that need counting are store items; give them the lab as their location to list them here.</Tip>
      <Panel
        title="All records"
        sub={`${shown.length} stock item(s)${location ? ` kept at ${location}` : ""}${items.loading ? " · Loading…" : ""}`}
        action={
          <button type="button" className="btn" data-columns="">
            <Icon name="grid" className="sm" />
            Columns
          </button>
        }
        flush
      >
        <DataTable
          columns={["Equipment", "Location", "Available", "Unit", "Minimum stock", "Status"]}
          rows={rows}
          rowAction={false}
          empty={items.loading ? "Loading items…" : "No stock items match these filters."}
        />
      </Panel>
      <Panel title="Equipment recorded on each lab" sub={`${labs.data?.length ?? 0} lab(s)`}>
        {withNotes.length ? (
          withNotes.map((l) => (
            <div className="timeline-item" key={l.id}>
              <span className="timeline-dot">
                <Icon name="folder" />
              </span>
              <div>
                <h4>{`${l.name}${l.room_name ? ` · ${l.room_name}` : ""}`}</h4>
                <p style={{ whiteSpace: "pre-wrap" }}>{l.equipment}</p>
                {l.safety_notes ? <p className="muted small">{`Safety: ${l.safety_notes}`}</p> : null}
              </div>
            </div>
          ))
        ) : (
          <p className="muted">{labs.loading ? "Loading…" : labs.data?.length ? "No lab has its equipment written down yet." : "No labs have been set up yet."}</p>
        )}
      </Panel>
    </>
  );
}
