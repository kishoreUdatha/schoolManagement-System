"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Users, Wallet } from "lucide-react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { SERIES, VERDICT } from "@/components/charts/theme";
import { CsvButton, ReportShell } from "@/components/reports/ReportShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, WarnBox, inr, td, tdStrong } from "@/components/ui/Field";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type Bucket = { label: string; amount: string };
type Defaulter = {
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  owed: string;
  items: number;
  oldest_days: number;
};
type Dues = {
  as_of: string;
  total: string;
  students_owing: number;
  buckets: Bucket[];
  defaulters: Defaulter[];
};

/** Older money is harder money, so the bucket decides the colour rather than
 *  the amount — a large bill raised last week is not the problem that a small
 *  one ignored since June is. */
const BUCKET_TONE: Record<string, string> = {
  "Not yet due": SERIES[7],
  "1-30 days": VERDICT.good,
  "31-60 days": VERDICT.fair,
  "61-90 days": SERIES[6],
  "Over 90 days": VERDICT.poor,
};

function ageTone(days: number): "emerald" | "amber" | "rose" | "neutral" {
  if (days <= 0) return "neutral";
  if (days <= 30) return "emerald";
  if (days <= 90) return "amber";
  return "rose";
}

export default function DuesReportPage() {
  const [data, setData] = useState<Dues | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Dues>("/api/v1/school/analytics/dues-ageing")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const buckets = (data?.buckets ?? []).map((b) => ({
    label: b.label,
    amount: Number(b.amount),
  }));
  const defaulters = data?.defaulters ?? [];
  const total = Number(data?.total ?? 0);
  const old = buckets.find((b) => b.label === "Over 90 days")?.amount ?? 0;
  const notYetDue = buckets.find((b) => b.label === "Not yet due")?.amount ?? 0;

  return (
    <ReportShell
      title="Dues and ageing"
      subtitle="Unpaid fees sorted by how long they have been overdue, and the families they sit with."
      error={error}
      actions={<CsvButton path="dues-ageing.csv" />}
    >
      {/* No filter bar: the ageing endpoint takes no window — every unpaid
          bill on the ledger is in scope, as of the date below. */}
      <StatStrip
        stats={[
          {
            label: "Outstanding",
            value: data ? inr(data.total) : "—",
            note: data ? `As of ${data.as_of}` : undefined,
            icon: Wallet,
          },
          {
            label: "Overdue",
            value: data ? inr(total - notYetDue) : "—",
            note: data ? `${inr(notYetDue)} not yet due` : undefined,
            icon: Clock,
          },
          {
            label: "Over 90 days",
            value: data ? inr(old) : "—",
            note: data ? "Oldest bucket on the ledger" : undefined,
            icon: AlertTriangle,
          },
          {
            label: "Families owing",
            value: data?.students_owing ?? "—",
            note: data ? `${defaulters.length} listed below` : undefined,
            icon: Users,
          },
        ]}
      />

      {old > 0 && (
        <WarnBox>
          {inr(old)} has been outstanding for more than ninety days. Money that old rarely
          arrives on its own — it is usually a family in difficulty or a bill nobody has
          mentioned, and either way it needs a conversation rather than another reminder.
        </WarnBox>
      )}

      <ChartCard
        title="How old the money is"
        subtitle="Every unpaid bill, bucketed by days past its due date."
        empty={total === 0 && "Nothing is outstanding."}
      >
        <BreakdownChart
          data={buckets}
          x="label"
          series={[{ key: "amount", name: "Outstanding" }]}
          colorBy={(row) => BUCKET_TONE[String(row.label)] ?? VERDICT.fair}
          xFormatter={(v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${Math.round(v / 1000)}k`)}
        />
      </ChartCard>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Who owes it</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {defaulters.length >= 50 ? "Largest 50" : `${defaulters.length} families`}
              {data ? ` · as of ${data.as_of}` : ""}
            </p>
          </div>
        </CardHeader>
        <Table
          head={["Admission no", "Student", "Owed", "Bills", "Oldest"]}
          empty={defaulters.length === 0 && "Nobody owes anything."}
        >
          {defaulters.map((d) => (
            <tr key={d.student_id}>
              <td className={td}>{d.admission_no}</td>
              <td className={tdStrong}>
                <Link href={`/school/students/${d.student_id}`} className="hover:underline">
                  {d.student_name}
                </Link>
                {d.section_label && (
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {d.section_label}
                  </span>
                )}
              </td>
              <td className={tdStrong}>{inr(d.owed)}</td>
              <td className={td}>{d.items}</td>
              <td className={td}>
                {d.oldest_days > 0 ? (
                  <Badge tone={ageTone(d.oldest_days)}>{d.oldest_days} days</Badge>
                ) : (
                  <span className="text-ink-subtle">Not yet due</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`Showing ${defaulters.length} of ${data?.students_owing ?? 0} family(ies)`}
          right={data ? `${inr(data.total)} outstanding` : undefined}
        />
      </Card>
    </ReportShell>
  );
}
