"use client";

import { useCallback, useEffect, useState } from "react";
import { IndianRupee, Layers, Receipt, Wallet } from "lucide-react";

import { BreakdownChart, ChartCard, ShareChart, TrendChart } from "@/components/charts/Charts";
import { CsvButton, ReportShell } from "@/components/reports/ReportShell";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, humanize, inr, td, tdStrong } from "@/components/ui/Field";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type Slice = { label: string; amount: string };
type Collection = {
  from_date: string;
  to_date: string;
  receipts: number;
  total: string;
  by_head: Slice[];
  by_class: Slice[];
  by_mode: Slice[];
  by_month: { month: string; amount: string }[];
};

/** One height for every control in the filter row. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

/** The same money, cut three ways.
 *
 *  Head, class and mode each answer a different question — what was charged
 *  for, which year group paid it, and how it arrived — and all three add up
 *  to the same total, which is what makes them worth showing side by side.
 */
export default function FeeCollectionReportPage() {
  const [data, setData] = useState<Collection | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<Collection>("/api/v1/school/analytics/fee-collection", {
        params: { from: from || undefined, to: to || undefined },
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [from, to]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const money = (rows: Slice[]) =>
    rows.map((r) => ({ label: humanize(r.label), amount: Number(r.amount) }));
  const compact = (v: number) =>
    v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`;

  const total = Number(data?.total ?? 0);
  const months = (data?.by_month ?? []).map((m) => ({ month: m.month, amount: Number(m.amount) }));
  const biggest = data?.by_head[0];

  return (
    <ReportShell
      title="Fee collection"
      subtitle="What was actually received in the window, and where it came from."
      error={error}
      actions={
        <CsvButton path="fee-collection.csv" query={{ from: from || undefined, to: to || undefined }} />
      }
    >
      {/* The window first — nothing below it is a figure until the period it
          covers has been chosen. */}
      <FilterBar>
        <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
          From
          <input
            type="date"
            aria-label="From"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={filterSelect}
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
          To
          <input
            type="date"
            aria-label="To"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={filterSelect}
          />
        </label>
        <Button variant="secondary" onClick={load}>
          Apply
        </Button>
      </FilterBar>

      <StatStrip
        stats={[
          {
            label: "Collected",
            value: data ? inr(data.total) : "—",
            note: data ? `${data.from_date} to ${data.to_date}` : undefined,
            icon: IndianRupee,
          },
          { label: "Receipts", value: data?.receipts ?? "—", icon: Receipt },
          {
            label: "Average receipt",
            value: data && data.receipts ? inr(total / data.receipts) : "—",
            note: data ? `across ${data.receipts} receipt(s)` : undefined,
            icon: Wallet,
          },
          {
            label: "Largest head",
            value: biggest ? humanize(biggest.label) : "—",
            note: biggest ? inr(biggest.amount) : undefined,
            icon: Layers,
          },
        ]}
      />

      <ChartCard
        title="Month by month"
        subtitle="Collections dated by the day the money was taken, not the day it fell due."
        empty={months.length === 0 && "Nothing has been collected in this window."}
      >
        <TrendChart
          data={months}
          x="month"
          series={[{ key: "amount", name: "Collected" }]}
          yFormatter={compact}
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="By fee head"
          subtitle="What the money was charged for."
          empty={!data?.by_head.length && "No receipts in this window."}
        >
          <BreakdownChart
            data={money(data?.by_head ?? [])}
            x="label"
            layout="vertical"
            series={[{ key: "amount", name: "Collected" }]}
            xFormatter={compact}
          />
        </ChartCard>

        <ChartCard
          title="By payment mode"
          subtitle="How it arrived — a cash-heavy school has a counting problem the others do not."
          empty={!data?.by_mode.length && "No receipts in this window."}
        >
          <ShareChart
            data={money(data?.by_mode ?? [])}
            nameKey="label"
            valueKey="amount"
            centreValue={data ? inr(data.total) : undefined}
            centreLabel="collected"
          />
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>By class</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {data ? `${data.from_date} to ${data.to_date}` : "The default window"}
            </p>
          </div>
        </CardHeader>
        <Table
          head={["Class", "Collected", "Share"]}
          empty={!data?.by_class.length && "No receipts in this window."}
        >
          {(data?.by_class ?? []).map((c) => (
            <tr key={c.label}>
              <td className={tdStrong}>{c.label}</td>
              <td className={td}>{inr(c.amount)}</td>
              <td className={td}>
                {total ? `${Math.round((Number(c.amount) / total) * 100)}%` : "—"}
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`${data?.by_class.length ?? 0} class(es) in scope`}
          right={data ? `${inr(data.total)} collected` : undefined}
        />
      </Card>
    </ReportShell>
  );
}
