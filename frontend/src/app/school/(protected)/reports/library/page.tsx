"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BreakdownChart, ChartCard, TrendChart } from "@/components/charts/Charts";
import { SERIES } from "@/components/charts/theme";
import { DateRange, ReportShell } from "@/components/reports/ReportShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type LibraryUsage = {
  from_date: string;
  to_date: string;
  issued: number;
  returned: number;
  copies: number;
  out_now: number;
  shelf_in_use: number;
  by_month: { month: string; issued: number; returned: number }[];
  top_titles: { book_id: number; title: string; times: number }[];
};

/** How much of the library actually moves.
 *
 *  A shelf count says what was bought; this says what was read. The two
 *  numbers a librarian is asked for — issues over a period, and how much of
 *  the stock is in somebody's bag — are on top, with the titles that earn
 *  their place underneath.
 */
export default function LibraryUsageReportPage() {
  const [data, setData] = useState<LibraryUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = () =>
    api
      .get<LibraryUsage>("/api/v1/school/analytics/library", {
        params: { from: from || undefined, to: to || undefined },
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const months = data?.by_month ?? [];
  const titles = data?.top_titles ?? [];

  return (
    <ReportShell
      title="Library usage"
      subtitle="Books issued and returned over a period, and how much of the shelf is in use."
      error={error}
      actions={
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} onApply={load} />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Issued"
          value={data?.issued ?? "—"}
          hint={data ? `${data.from_date} to ${data.to_date}` : undefined}
        />
        <StatCard label="Returned" value={data?.returned ?? "—"} />
        <StatCard label="Out now" value={data?.out_now ?? "—"} />
        <StatCard
          label="Shelf in use"
          value={data ? `${data.shelf_in_use}%` : "—"}
          hint={data ? `${data.out_now} of ${data.copies} copies` : undefined}
        />
      </div>

      <ChartCard
        title="Issues and returns"
        subtitle="Where the two lines part, books have gone out and not come back."
        empty={months.length === 0 && "No loans have been recorded in this period."}
      >
        <TrendChart
          data={months}
          x="month"
          series={[
            { key: "issued", name: "Issued", color: SERIES[0] },
            { key: "returned", name: "Returned", color: SERIES[1] },
          ]}
        />
      </ChartCard>

      <ChartCard
        title="Most borrowed"
        subtitle="Titles by how often they have gone out in this period."
        height={Math.max(220, titles.length * 34 + 60)}
        empty={titles.length === 0 && "Nothing has been borrowed in this period."}
      >
        <BreakdownChart
          data={titles.map((t) => ({ title: t.title, times: t.times }))}
          x="title"
          layout="vertical"
          series={[{ key: "times", name: "Times borrowed" }]}
        />
      </ChartCard>

      <Card>
        <CardHeader>
          <CardTitle>Most borrowed titles</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Title", "Times borrowed"]}
            empty={titles.length === 0 && "Nothing has been borrowed in this period."}
          >
            {titles.map((t) => (
              <tr key={t.book_id}>
                <td className={tdStrong}>
                  <Link href="/school/library" className="text-brand-600 hover:underline">
                    {t.title}
                  </Link>
                </td>
                <td className={td}>{t.times}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>
    </ReportShell>
  );
}
