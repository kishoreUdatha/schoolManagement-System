"use client";

import { useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { date, label, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { BarList, INV, MOVE_LABEL, Tip, qty, type Move, type MoveKind, type Valuation } from "./common";

const PERIODS: [number, string][] = [
  [30, "Last 30 days"],
  [90, "Last 90 days"],
  [180, "Last 180 days"],
  [365, "Last year"],
  [730, "Last two years"],
];

/**
 * SCR-245, live: GET /analytics/inventory (valuation, categories, asset
 * states, low stock) and GET /inventory/moves?days= for the period. The
 * ledger takes a number of days, so the period is offered as those windows.
 */
export function StockReports() {
  const [days, setDays] = useState(90);
  const [kind, setKind] = useState("");
  const val = useApi<Valuation>("/api/v1/school/analytics/inventory");
  const moves = useApi<Move[]>(`${INV}/moves`, { days });

  const all = moves.data ?? [];
  const shown = kind ? all.filter((m) => m.kind === kind) : all;
  const kinds = [...new Set(all.map((m) => m.kind))].sort();
  const inQty = shown.filter((m) => m.direction > 0).reduce((n, m) => n + Number(m.qty), 0);
  const outQty = shown.filter((m) => m.direction < 0).reduce((n, m) => n + Number(m.qty), 0);
  const period = PERIODS.find(([d]) => d === days)?.[1] ?? `Last ${days} days`;
  const v = val.data;
  const n = (x: number | undefined) => (x === undefined ? "…" : x.toLocaleString("en-IN"));

  const stats = [
    { label: "Stock value", value: v ? money(Math.round(Number(v.stock_value))) : "…", note: v ? `${n(v.items)} item(s) tracked` : "Store items" },
    { label: "Asset value", value: v ? money(Math.round(Number(v.asset_value))) : "…", note: v ? `${n(v.assets)} asset(s) on the register` : "Asset register" },
    { label: "Movements in scope", value: n(moves.data ? shown.length : undefined), note: `${qty(inQty)} in · ${qty(outQty)} out` },
    { label: "Reporting period", value: period.replace("Last ", ""), note: kind ? MOVE_LABEL[kind as MoveKind] : "Every kind" },
  ];

  const assetCount = (v?.assets_by_status ?? []).reduce((s, x) => s + x.count, 0);
  const rows: Row[] = shown.map((m) => [
    date(m.moved_on),
    m.item_name,
    MOVE_LABEL[m.kind] ?? label(m.kind),
    `${m.direction > 0 ? "+" : "−"}${qty(m.qty)}`,
    m.unit_cost ? money(m.unit_cost) : "—",
    m.supplier_name || m.issued_to || "—",
  ]);

  return (
    <>
      <div className="filterbar">
        <select aria-label="Reporting period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {PERIODS.map(([d, l]) => (
            <option key={d} value={d}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Filter by movement kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Every kind</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {MOVE_LABEL[k] ?? label(k)}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{val.error ?? moves.error}</ErrorNote>
      <StatStrip items={stats} compact />
      {v && v.low_stock.length ? <Tip warn>{`${v.low_stock.length} item(s) are at or below their reorder level: ${v.low_stock.map((l) => `${l.name} (${qty(l.on_hand)} of ${qty(l.reorder_level)})`).join(", ")}.`}</Tip> : null}
      <div className="two-col" style={{ marginBottom: "20px" }}>
        <div>
          <Panel title="Stock value by category" sub="Priced at what the stock cost">
            {v?.by_category.length ? (
              <BarList rows={v.by_category.map((c) => ({ label: c.label, value: Number(c.value) }))} format={(x) => (x >= 100000 ? `₹${(x / 100000).toFixed(1)}L` : x >= 1000 ? `₹${Math.round(x / 1000)}k` : `₹${Math.round(x)}`)} />
            ) : (
              <p className="muted">{val.loading ? "Loading…" : "No stock has been received yet."}</p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Report scope">
            <dl className="kv">
              <div>
                <dt>Period</dt>
                <dd>{period}</dd>
              </div>
              <div>
                <dt>Movement kind</dt>
                <dd>{kind ? MOVE_LABEL[kind as MoveKind] : "Every kind"}</dd>
              </div>
              <div>
                <dt>Valuation</dt>
                <dd>Whole store, as of today</dd>
              </div>
              <div>
                <dt>Categories</dt>
                <dd>{v ? String(v.by_category.length) : "…"}</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Assets by state">
            {assetCount ? (
              <div className="bar-list">
                {v!.assets_by_status.map((s) => {
                  const p = Math.round((s.count / assetCount) * 100);
                  return (
                    <div key={s.label}>
                      <span>{`${label(s.label)} (${s.count})`}</span>
                      <div className="bar-track">
                        <i style={{ width: `${p}%` }} />
                      </div>
                      <strong>{`${p}%`}</strong>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted">{val.loading ? "Loading…" : "No assets have been registered yet."}</p>
            )}
          </Panel>
        </aside>
      </div>
      <Panel
        title="Detailed breakdown"
        sub={`${period} · ${shown.length} of ${all.length} movement(s)${moves.loading ? " · Loading…" : ""}`}
        action={
          <button type="button" className="btn" data-export="">
            <Icon name="download" className="sm" />
            CSV
          </button>
        }
        flush
      >
        <DataTable
          columns={["Date", "Item", "Kind", "Qty", "Unit cost", "Supplier or issued to"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          empty={moves.loading ? "Loading movements…" : "Nothing moved in this period."}
        />
      </Panel>
    </>
  );
}
