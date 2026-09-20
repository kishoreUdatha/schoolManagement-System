"use client";

import { useCallback, useEffect, useState } from "react";

import { BreakdownChart, ChartCard, ShareChart, TrendChart } from "@/components/charts/Charts";
import { SERIES } from "@/components/charts/theme";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Table,
  humanize,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Slice = { label: string; amount: string };
type MonthRow = { month: string; received: string; spent: string; net: string };
type Report = {
  from_date: string;
  to_date: string;
  received: string;
  receipts: number;
  spent: string;
  net: string;
  income_by_head: Slice[];
  income_by_mode: Slice[];
  spend_by_category: Slice[];
  by_month: MonthRow[];
};

const compact = (v: number) =>
  Math.abs(v) >= 100000
    ? `${(v / 100000).toFixed(1)}L`
    : Math.abs(v) >= 1000
      ? `${Math.round(v / 1000)}k`
      : `${v}`;

/** Money in against money out.
 *
 *  Expenditure counts both halves of how a school pays for things — direct
 *  expenses and payments against supplier bills. Leaving either out would
 *  flatter the figure, which is the one thing a finance report must not do.
 */
export default function FinanceReportsPage() {
  const [data, setData] = useState<Report | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<Report>("/api/v1/school/finance/report", {
        params: { from: from || undefined, to: to || undefined },
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [from, to]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const months = (data?.by_month ?? []).map((m) => ({
    month: m.month,
    Received: Number(m.received),
    Spent: Number(m.spent),
  }));
  const spend = (data?.spend_by_category ?? []).map((s) => ({
    label: humanize(s.label),
    amount: Number(s.amount),
  }));
  const income = (data?.income_by_head ?? []).map((s) => ({
    label: humanize(s.label),
    amount: Number(s.amount),
  }));
  const surplus = Number(data?.net ?? 0) >= 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance reports"
        subtitle="What the school received and what it spent, over a window."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Input
              label="From"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              label="To"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <Button variant="secondary" onClick={load}>
              Apply
            </Button>
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Received"
          value={data ? inr(data.received) : "—"}
          hint={data ? `${data.receipts} receipt(s)` : undefined}
          accent="emerald"
        />
        <StatCard label="Spent" value={data ? inr(data.spent) : "—"} accent="amber" />
        <StatCard
          label={surplus ? "Surplus" : "Shortfall"}
          value={data ? inr(data.net) : "—"}
          accent={surplus ? "emerald" : "rose"}
        />
        <StatCard
          label="Window"
          value={data ? `${data.from_date} → ${data.to_date}` : "—"}
          accent="neutral"
        />
      </div>

      <ChartCard
        title="In and out, month by month"
        subtitle="Fee collections against expenses and supplier payments."
        empty={months.length === 0 && "Nothing has moved in this window."}
      >
        <TrendChart
          data={months}
          x="month"
          series={[
            { key: "Received", name: "Received", color: SERIES[1] },
            { key: "Spent", name: "Spent", color: SERIES[3] },
          ]}
          yFormatter={compact}
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Where the money went"
          subtitle="Expenses by category, and everything paid to suppliers."
          empty={spend.length === 0 && "Nothing has been spent in this window."}
          height={Math.max(220, spend.length * 32)}
        >
          <BreakdownChart
            data={spend}
            x="label"
            layout="vertical"
            series={[{ key: "amount", name: "Spent" }]}
            xFormatter={compact}
          />
        </ChartCard>

        <ChartCard
          title="How the money arrived"
          subtitle="Collections by payment mode."
          empty={
            (data?.income_by_mode.length ?? 0) === 0 &&
            "Nothing has been collected in this window."
          }
        >
          <ShareChart
            data={(data?.income_by_mode ?? []).map((s) => ({
              label: humanize(s.label),
              amount: Number(s.amount),
            }))}
            nameKey="label"
            valueKey="amount"
            centreValue={data ? inr(data.received) : undefined}
            centreLabel="received"
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Income by fee head</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <Table
              head={["Head", "Received", "Share"]}
              empty={income.length === 0 && "Nothing collected in this window."}
            >
              {income.map((s) => (
                <tr key={s.label}>
                  <td className={tdStrong}>{s.label}</td>
                  <td className={td}>{inr(s.amount)}</td>
                  <td className={td}>
                    {Number(data?.received ?? 0)
                      ? `${Math.round((s.amount / Number(data!.received)) * 100)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </Table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spend by category</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <Table
              head={["Category", "Spent", "Share"]}
              empty={spend.length === 0 && "Nothing spent in this window."}
            >
              {spend.map((s) => (
                <tr key={s.label}>
                  <td className={tdStrong}>{s.label}</td>
                  <td className={td}>{inr(s.amount)}</td>
                  <td className={td}>
                    {Number(data?.spent ?? 0)
                      ? `${Math.round((s.amount / Number(data!.spent)) * 100)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </Table>
          </CardBody>
        </Card>
      </div>

      <p className="text-[12px] text-ink-subtle">
        Fee collections are the only income this system records. Anything a
        school receives outside the fee ledger will not appear here.
      </p>
    </div>
  );
}
