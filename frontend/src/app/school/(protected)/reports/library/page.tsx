"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BookOpen, Library, Percent, Undo2 } from "lucide-react";

import { BreakdownChart, ChartCard, TrendChart } from "@/components/charts/Charts";
import { SERIES } from "@/components/charts/theme";
import { ReportShell } from "@/components/reports/ReportShell";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, td, tdStrong } from "@/components/ui/Field";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { readableDate } from "@/lib/dates";

/** A control sized for the filter bar: the same height as everything else in
 *  the row, because the bar reads as one line rather than a stack of fields. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

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
  // The window the server actually answered with, not the one in the boxes —
  // an empty box means "use the default", and the strip should say which.
  const period = data
    ? `${readableDate(data.from_date)} – ${readableDate(data.to_date)}`
    : undefined;

  return (
    <ReportShell
      title="Library usage"
      subtitle="Books issued and returned over a period, and how much of the shelf is in use."
      error={error}
    >
      {/* The period comes first: on a report you choose the window before any
          of the figures below it mean anything. */}
      <FilterBar>
        <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
          From
          <input
            type="date"
            aria-label="From date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={filterSelect}
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
          To
          <input
            type="date"
            aria-label="To date"
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
            label: "Loans in scope",
            value: data?.issued ?? "—",
            note: period,
            icon: BookOpen,
          },
          {
            label: "Returned",
            value: data?.returned ?? "—",
            note: "In the same period",
            icon: Undo2,
          },
          {
            label: "Out now",
            value: data?.out_now ?? "—",
            note: data ? `Of ${data.copies} copies on the shelf` : undefined,
            icon: Library,
          },
          {
            label: "Shelf in use",
            value: data ? `${data.shelf_in_use}%` : "—",
            note: data ? `${data.out_now} of ${data.copies} copies` : undefined,
            icon: Percent,
          },
        ]}
      />

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
          <div>
            <CardTitle>Most borrowed titles</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {period ? `Loans between ${period}` : "Loans in the selected period"}
            </p>
          </div>
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
        <PanelFooter
          left={`Showing ${titles.length} title${titles.length === 1 ? "" : "s"}`}
          right={data ? `${data.issued} loan(s) in this period` : undefined}
        />
      </Card>
    </ReportShell>
  );
}
