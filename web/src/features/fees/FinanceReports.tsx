"use client";

import { useState } from "react";
import { Chart } from "@/components/ui/Chart";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date, money, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { DownloadButton, isoToday, modeLabel, monthLabel, scaled } from "./common";
import { DateRange } from "./IncomeList";
import type { FinanceReport } from "./types";

/** 1 April of the current Indian financial year. */
function fyStart(): string {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04-01`;
}

/**
 * SCR-171, live: GET /school/finance/report?from=&to= — money received and
 * spent over a window, by fee type, mode, category and month. The CSV is the
 * fee-collection export, GET /school/analytics/fee-collection.csv.
 */
export function FinanceReports() {
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(isoToday());
  const [view, setView] = useState("");
  const rep = useApi<FinanceReport>("/api/v1/school/finance/report", { from, to });
  const r = rep.data;

  const stats = [
    { label: "Received", value: r ? money(r.received) : "…", note: r ? `Fee collections · ${r.receipts.toLocaleString("en-IN")} receipts` : "Fee collections" },
    { label: "Spent", value: r ? money(r.spent) : "…", note: "Expenses and supplier payments" },
    { label: "Net", value: r ? money(r.net) : "…", note: r && r.net < 0 ? "Spent more than received" : "Received less spent" },
    { label: "Fee types", value: r ? String(r.income_by_head.length) : "…", note: "With money received" },
  ];

  const months = (r?.by_month ?? []).slice(-6);
  const received = Number(r?.received ?? 0);
  const spent = Number(r?.spent ?? 0);
  // Income rows are fee types: billed in the period (expected), received in the period, still owed on those bills.
  const billed = new Map((r?.billed_by_head ?? []).map((b) => [b.label, b]));
  const incomeHeads = [...new Set([...(r?.billed_by_head ?? []).map((b) => b.label), ...(r?.income_by_head ?? []).map((x) => x.label)])];
  const receivedBy = new Map((r?.income_by_head ?? []).map((x) => [x.label, Number(x.amount)]));
  const rows: Row[] = [
    ...(view === "spend"
      ? []
      : incomeHeads.map((h) => {
          const b = billed.get(h);
          const got = receivedBy.get(h) ?? 0;
          return [h, "Income", b ? money(b.expected) : "—", money(got), b ? money(b.outstanding) : "—", b ? pct(b.collection_rate) : "—"];
        })),
    ...(view === "income" ? [] : (r?.spend_by_category ?? []).map((x) => [x.label, "Expenditure", "—", money(x.amount), "—", spent ? `${pct((Number(x.amount) / spent) * 100)} of spend` : "—"])),
  ];

  return (
    <>
      <div className="filterbar">
        <select aria-label="Show" value={view} onChange={(e) => setView(e.target.value)}>
          <option value="">Income and expenditure</option>
          <option value="income">Income only</option>
          <option value="spend">Expenditure only</option>
        </select>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>
      <ErrorNote>{rep.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <div className="two-col" style={{ marginBottom: "20px" }}>
        <div>
          <Panel
            title="Received by month"
            sub={months.length ? `${monthLabel(months[0].month)} – ${monthLabel(months[months.length - 1].month)}${(r?.by_month.length ?? 0) > 6 ? " · last six months of the period" : ""}` : "Selected period"}
            action={
              <div className="chart-key">
                <span>Received</span>
              </div>
            }
          >
            {months.length ? <Chart kind="line" labels={months.map((m) => monthLabel(m.month).slice(0, 3))} values={scaled(months.map((m) => Number(m.received)))} /> : <p className="muted small">{rep.loading ? "Loading…" : "Nothing received in this period."}</p>}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Report scope">
            <dl className="kv">
              <div>
                <dt>Date range</dt>
                <dd>{`${date(from)} – ${date(to)}`}</dd>
              </div>
              <div>
                <dt>Fee receipts</dt>
                <dd>{r ? r.receipts.toLocaleString("en-IN") : "…"}</dd>
              </div>
              <div>
                <dt>Group by</dt>
                <dd>Fee type and expense category</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Fees received by mode">
            <div className="bar-list">
              {(r?.income_by_mode ?? []).map((m) => {
                const share = received ? (Number(m.amount) / received) * 100 : 0;
                return (
                  <div key={m.label}>
                    <span>{modeLabel(m.label)}</span>
                    <div className="bar-track">
                      <i style={{ width: `${share}%` }} />
                    </div>
                    <strong>{`${Math.round(share)}%`}</strong>
                  </div>
                );
              })}
            </div>
            {r && !r.income_by_mode.length ? <p className="muted small">Nothing received.</p> : null}
          </Panel>
        </aside>
      </div>
      <Panel
        title="Detailed breakdown"
        sub={`${date(from)} – ${date(to)}`}
        action={
          <DownloadButton path={`/api/v1/school/analytics/fee-collection.csv?from=${from}&to=${to}`} filename={`fee-collection_${from}_${to}.csv`}>
            CSV
          </DownloadButton>
        }
        flush
      >
        {/* Expected and outstanding are the bills falling due in the period; the collection rate is paid ÷ billed on those bills. */}
        <DataTable columns={["Fee type / category", "Type", "Expected", "Received", "Outstanding", "Collection rate"]} rows={rows} selectable={false} rowAction={false} empty={rep.loading ? "Loading…" : "Nothing in this period."} />
      </Panel>
    </>
  );
}
