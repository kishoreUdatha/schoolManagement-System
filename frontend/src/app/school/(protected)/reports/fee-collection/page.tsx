"use client";

import { useCallback, useEffect, useState } from "react";

import { BreakdownChart, ChartCard, ShareChart, TrendChart } from "@/components/charts/Charts";
import { CsvButton, DateRange, ReportShell } from "@/components/reports/ReportShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, humanize, inr, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
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
        <div className="flex flex-wrap items-end gap-2">
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} onApply={load} />
          <CsvButton path="fee-collection.csv" query={{ from: from || undefined, to: to || undefined }} />
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Collected" value={data ? inr(data.total) : "—"} accent="emerald" />
        <StatCard label="Receipts" value={data?.receipts ?? "—"} />
        <StatCard
          label="Average receipt"
          value={data && data.receipts ? inr(total / data.receipts) : "—"}
        />
        <StatCard
          label="Largest head"
          value={biggest ? humanize(biggest.label) : "—"}
          hint={biggest ? inr(biggest.amount) : undefined}
        />
      </div>

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
          <CardTitle>By class</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
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
        </CardBody>
      </Card>
    </ReportShell>
  );
}
