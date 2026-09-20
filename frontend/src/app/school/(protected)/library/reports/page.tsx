"use client";

import { useCallback, useEffect, useState } from "react";

import { BreakdownChart, ChartCard, TrendChart } from "@/components/charts/Charts";
import { SERIES } from "@/components/charts/theme";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Select,
  Table,
  humanize,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Library report"
        subtitle="What was borrowed over a period, what came back, and what is owed."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Input
              type="date"
              label="From"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              type="date"
              label="To"
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
          label="Issued"
          value={usage?.issued ?? "—"}
          hint={usage ? `${shortDate(usage.from_date)} to ${shortDate(usage.to_date)}` : undefined}
        />
        <StatCard
          label="Returned"
          value={usage?.returned ?? "—"}
          hint={usage && stillOut > 0 ? `${stillOut} not back yet` : undefined}
          accent={stillOut > 0 ? "amber" : "emerald"}
        />
        <StatCard
          label="Out now"
          value={usage?.out_now ?? "—"}
          hint={usage ? `of ${usage.copies} copies` : undefined}
        />
        <StatCard
          label="Shelf in use"
          value={usage ? `${usage.shelf_in_use}%` : "—"}
        />
      </div>

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Fines owed"
          value={fines ? inr(fines.pending_amount) : "—"}
          hint={fines ? `${fines.pending} outstanding` : undefined}
          accent={fines && Number(fines.pending_amount) > 0 ? "rose" : "emerald"}
        />
        <StatCard label="Collected" value={fines ? inr(fines.collected_amount) : "—"} />
        <StatCard label="Waived" value={fines ? inr(fines.waived_amount) : "—"} />
        <StatCard label="Billed to fees" value={fines ? inr(fines.billed_amount) : "—"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fines</CardTitle>
          <Select
            aria-label="Fine status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Every state</option>
            <option value="pending">Pending</option>
            <option value="billed">Billed</option>
            <option value="paid">Paid</option>
            <option value="waived">Waived</option>
          </Select>
        </CardHeader>
        <CardBody className="p-0">
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
        </CardBody>
      </Card>
    </div>
  );
}
