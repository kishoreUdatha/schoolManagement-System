"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  IndianRupee,
  Layers,
  Library,
  Percent,
  Receipt,
  RotateCcw,
  Wallet,
} from "lucide-react";

import { BreakdownChart, ChartCard, TrendChart } from "@/components/charts/Charts";
import { SERIES } from "@/components/charts/theme";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Table,
  humanize,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { shortDate } from "@/lib/dates";

type Usage = {
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

type Fine = {
  loan_id: number;
  accession_no: string;
  title: string;
  borrower_type: "student" | "staff";
  borrower_name: string;
  student_id: number | null;
  user_id: number | null;
  issued_on: string;
  due_on: string;
  returned_on: string | null;
  overdue_days: number;
  amount: string;
  status: string;
  note: string | null;
};

type Fines = {
  pending: number;
  pending_amount: string;
  collected_amount: string;
  waived_amount: string;
  billed_amount: string;
  fines: Fine[];
};

const FINE_TONE: Record<string, "emerald" | "amber" | "rose" | "neutral"> = {
  paid: "emerald",
  waived: "neutral",
  billed: "amber",
  pending: "rose",
  none: "neutral",
};

/** One height for every control in the filter row. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

/** Library usage over a window the librarian chooses.
 *
 *  The fines table is unwindowed on purpose — the endpoint takes no dates,
 *  and money still owed is owed whenever it was raised.
 */
export default function LibraryReportsPage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [fines, setFines] = useState<Fines | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<Usage>("/api/v1/school/analytics/library", {
        params: { from: from || undefined, to: to || undefined },
      })
      .then((r) => setUsage(r.data))
      .catch((e) => setError(apiError(e)));
  }, [from, to]);

  const loadFines = useCallback(() => {
    api
      .get<Fines>("/api/v1/school/library/fines", {
        params: { status: status || undefined },
      })
      .then((r) => setFines(r.data))
      .catch((e) => setError(apiError(e)));
  }, [status]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadFines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const months = usage?.by_month ?? [];
  const titles = (usage?.top_titles ?? []).map((t) => ({
    label: t.title,
    times: t.times,
  }));
  const stillOut = usage ? usage.issued - usage.returned : 0;

  const windowLabel = usage
    ? `${shortDate(usage.from_date)} to ${shortDate(usage.to_date)}`
    : "The default window";

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Library report"
        subtitle="What was borrowed over a period, what came back, and what is owed."
      />
      <ErrorBox>{error}</ErrorBox>

      {/* The window and the fine state both narrow what follows, so they are
          chosen here rather than tucked into the panels they govern. */}
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
        <select
          aria-label="Fine status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={filterSelect}
        >
          <option value="">Every state</option>
          <option value="pending">Pending</option>
          <option value="billed">Billed</option>
          <option value="paid">Paid</option>
          <option value="waived">Waived</option>
        </select>
      </FilterBar>

      <StatStrip
        stats={[
          {
            label: "Issued",
            value: usage?.issued ?? "—",
            note: usage ? windowLabel : undefined,
            icon: BookOpen,
          },
          {
            label: "Returned",
            value: usage?.returned ?? "—",
            note: usage && stillOut > 0 ? `${stillOut} not back yet` : undefined,
            icon: RotateCcw,
          },
          {
            label: "Out now",
            value: usage?.out_now ?? "—",
            note: usage ? `of ${usage.copies} copies` : undefined,
            icon: Library,
          },
          {
            label: "Shelf in use",
            value: usage ? `${usage.shelf_in_use}%` : "—",
            icon: Percent,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Issued and returned"
          subtitle="The gap between the two lines is books still out."
          empty={months.length === 0 && "Nothing has been borrowed in this window."}
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
          subtitle="Titles by how often they went out."
          empty={titles.length === 0 && "No loans in this window."}
          height={Math.max(240, titles.length * 32)}
        >
          <BreakdownChart
            data={titles}
            x="label"
            layout="vertical"
            series={[{ key: "times", name: "Times borrowed" }]}
          />
        </ChartCard>
      </div>

      {/* Fines answer a different question than usage and are deliberately
          unwindowed, so they carry their own summary rather than being read
          as part of the period above. */}
      <StatStrip
        stats={[
          {
            label: "Fines owed",
            value: fines ? inr(fines.pending_amount) : "—",
            note: fines ? `${fines.pending} outstanding` : undefined,
            icon: IndianRupee,
          },
          {
            label: "Collected",
            value: fines ? inr(fines.collected_amount) : "—",
            icon: Receipt,
          },
          {
            label: "Waived",
            value: fines ? inr(fines.waived_amount) : "—",
            icon: Wallet,
          },
          {
            label: "Billed to fees",
            value: fines ? inr(fines.billed_amount) : "—",
            icon: Layers,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Fines</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {status ? humanize(status) : "Every state"} · every fine on record, not
              only the window above.
            </p>
          </div>
        </CardHeader>
        <Table
          head={["Borrower", "Title", "Due", "Overdue", "Amount", "State"]}
          empty={(fines?.fines.length ?? 0) === 0 && "No fines have been raised."}
        >
          {(fines?.fines ?? []).map((f) => (
            <tr key={f.loan_id}>
              <td className={tdStrong}>
                {f.borrower_name}
                <span className="block text-[11px] font-normal text-ink-subtle">
                  {humanize(f.borrower_type)}
                </span>
              </td>
              <td className={td}>
                {f.title}
                <span className="block font-mono text-[11px] text-ink-subtle">
                  {f.accession_no}
                </span>
              </td>
              <td className={td}>{shortDate(f.due_on)}</td>
              <td className={td}>
                {f.overdue_days > 0 ? (
                  <Badge tone="rose">{f.overdue_days} days</Badge>
                ) : (
                  "—"
                )}
              </td>
              <td className={tdStrong}>{inr(f.amount)}</td>
              <td className={td}>
                <Badge tone={FINE_TONE[f.status] ?? "neutral"}>
                  {humanize(f.status)}
                </Badge>
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`Showing ${fines?.fines.length ?? 0} fine(s)`}
          right={fines ? `${inr(fines.pending_amount)} still owed` : undefined}
        />
      </Card>
    </div>
  );
}
