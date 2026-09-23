"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Chart } from "@/components/ui/Chart";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip, type Stat } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { useApi } from "@/lib/useApi";

/*
 * The report screens share one mock layout: filters, a stat strip, a chart
 * beside "Report scope" and "Summary", and a detailed breakdown table. This
 * kit fills that layout from live data; each report only works out its
 * figures.
 */

// ---------------------------------------------------------------- export

const EXPORT_EVENT = "bc:report-export";

/** The page-head export buttons. The page is a server component, so they
 *  ask the live report (below them) to download what it has loaded. */
export function ExportButtons({ labels = ["Export", "Export report"] }: { labels?: string[] }) {
  return (
    <>
      {labels.map((l, i) => (
        <button key={l} type="button" className={`btn ${i === labels.length - 1 ? "primary" : ""}`} onClick={() => window.dispatchEvent(new Event(EXPORT_EVENT))}>
          <Icon name="download" className="sm" />
          {l}
        </button>
      ))}
    </>
  );
}

/** Run `fn` when a page-head export button is pressed. */
export function useExport(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h = () => ref.current();
    window.addEventListener(EXPORT_EVENT, h);
    return () => window.removeEventListener(EXPORT_EVENT, h);
  }, []);
}

const cellText = (c: Row[number]) => {
  if (typeof c === "string") return c;
  if ("name" in c) return c.sub ? `${c.name} (${c.sub})` : c.name;
  return c.note ? `${c.text} (${c.note})` : c.text;
};

/** Download the rows on screen as a CSV file. */
export function downloadCsv(name: string, columns: string[], rows: Row[]) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [columns, ...rows.map((r) => r.map(cellText))].map((r) => r.map(esc).join(","));
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-${today()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- dates & numbers

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const today = () => iso(new Date());
export const monthStart = () => {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
};
/** "2026-09" -> "Sep 2026" */
export function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1] ?? m} ${y}`;
}
export const num = (v: number | string | null | undefined) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-IN"));
/** a as a share of b, 0 when b is 0. */
export const share = (a: number, b: number) => (b ? (a / b) * 100 : 0);

// ---------------------------------------------------------------- academic year

type Year = { id: number; name: string; is_current: boolean };

/** The school's academic years, defaulting to the current one. */
export function useYear() {
  const years = useApi<Year[]>("/api/v1/school/academic-years");
  const [yearId, setYearId] = useState<number | null>(null);
  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);
  const year = years.data?.find((y) => y.id === yearId);
  const picker = (
    <select aria-label="Academic year" value={yearId ?? ""} onChange={(e) => setYearId(Number(e.target.value))}>
      {years.data?.map((y) => (
        <option key={y.id} value={y.id}>{`${y.name}${y.is_current ? " (current)" : ""}`}</option>
      ))}
    </select>
  );
  return { yearId, year, years: years.data ?? [], picker, error: years.error };
}

// ---------------------------------------------------------------- pieces

export type Bar = { label: string; value: number; text: string };

/** The mock's `.bar-list`, widths relative to the largest value (or to 100 when `percent`). */
export function BarList({ bars, percent = false, empty = "Nothing to show yet." }: { bars: Bar[]; percent?: boolean; empty?: string }) {
  if (!bars.length) return <p className="muted">{empty}</p>;
  const max = percent ? 100 : Math.max(...bars.map((b) => b.value), 0);
  return (
    <div className="bar-list">
      {bars.map((b, i) => (
        <div key={b.label + i}>
          <span>{b.label}</span>
          <div className="bar-track">
            <i style={{ width: `${max ? Math.min(100, Math.max(0, (b.value / max) * 100)) : 0}%` }} />
          </div>
          <strong>{b.text}</strong>
        </div>
      ))}
    </div>
  );
}

export function Kv({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A labelled date input for the filter bar. */
export function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <input type="date" aria-label={label} title={label} value={value} onChange={(e) => onChange(e.target.value)} />;
}

// ---------------------------------------------------------------- the layout

export type ChartSpec =
  | { kind: "line"; title: string; sub: string; key: string; labels: string[]; values: number[] }
  | { kind: "bars"; title: string; sub: string; key?: string; bars: Bar[]; percent?: boolean; empty?: string };

export function ReportView({
  filters,
  stats,
  chart,
  scope,
  summary,
  summaryTitle = "Summary",
  table,
  error,
  loading,
}: {
  filters?: ReactNode;
  stats: Stat[];
  chart: ChartSpec;
  scope: [string, string][];
  summary: Bar[];
  summaryTitle?: string;
  table: { name: string; title?: string; sub?: string; columns: string[]; rows: Row[]; empty: string; onView?: (i: number) => void };
  error?: string | null;
  loading?: boolean;
}) {
  useExport(() => downloadCsv(table.name, table.columns, table.rows));
  return (
    <>
      {filters ? <div className="filterbar">{filters}</div> : null}
      <ErrorNote>{error}</ErrorNote>
      <StatStrip items={stats} compact />
      <div className="two-col" style={{ marginBottom: "20px" }}>
        <div>
          <Panel
            title={chart.title}
            sub={`${chart.sub}${loading ? " · Loading…" : ""}`}
            action={
              chart.key ? (
                <div className="chart-key">
                  <span>{chart.key}</span>
                </div>
              ) : undefined
            }
          >
            {chart.kind === "line" ? (
              chart.values.length ? (
                <Chart kind="line" labels={chart.labels.slice(-6)} values={chart.values.slice(-6)} />
              ) : (
                <p className="muted">{loading ? "Loading…" : "No data for this period yet."}</p>
              )
            ) : (
              <BarList bars={chart.bars} percent={chart.percent} empty={loading ? "Loading…" : chart.empty} />
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Report scope">
            <Kv rows={scope} />
          </Panel>
          <Panel title={summaryTitle}>
            <BarList bars={summary} percent empty={loading ? "Loading…" : "Nothing to summarise yet."} />
          </Panel>
        </aside>
      </div>
      <Panel
        title={table.title ?? "Detailed breakdown"}
        sub={table.sub ?? "Results for the selected filters"}
        action={
          <button type="button" className="btn" onClick={() => downloadCsv(table.name, table.columns, table.rows)}>
            <Icon name="download" className="sm" />
            CSV
          </button>
        }
        flush
      >
        <DataTable columns={table.columns} rows={table.rows} selectable={false} rowAction={Boolean(table.onView)} onView={table.onView} empty={loading ? "Loading…" : table.empty} />
      </Panel>
    </>
  );
}
