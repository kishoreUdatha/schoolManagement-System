"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BellRing, CreditCard, IndianRupee, Layers, Receipt, Wallet } from "lucide-react";

import { BreakdownChart, ChartCard, TrendChart } from "@/components/charts/Charts";
import { SERIES, VERDICT } from "@/components/charts/theme";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, inr, td, tdStrong } from "@/components/ui/Field";
import { Hero, QuickActions, StatStrip } from "@/components/ui/Workspace";
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
type Dashboard = {
  collected_today: string;
  collected_this_month: string;
  raised_this_month: string;
  collection_rate: number;
  outstanding: string;
  students_owing: number;
  buckets: Bucket[];
  top_defaulters: Defaulter[];
  by_month: { month: string; amount: string }[];
};

/** Older money is harder money, so the bucket picks the colour rather than
 *  the size of it. */
const BUCKET_TONE: Record<string, string> = {
  "Not yet due": SERIES[7],
  "1-30 days": VERDICT.good,
  "31-60 days": VERDICT.fair,
  "61-90 days": SERIES[6],
  "Over 90 days": VERDICT.poor,
};

const compact = (v: number) =>
  v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`;

const primaryLink =
  "inline-flex min-h-[40px] items-center justify-center gap-2 whitespace-nowrap rounded-[9px] bg-brand-600 px-4 py-2 text-xs font-extrabold text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300";
const secondaryLink =
  "inline-flex min-h-[40px] items-center justify-center gap-2 whitespace-nowrap rounded-[9px] border border-surface-control bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300";

export default function FeeDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Dashboard>("/api/v1/school/finance/dashboard")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const buckets = (data?.buckets ?? []).map((b) => ({
    label: b.label,
    amount: Number(b.amount),
  }));
  const months = (data?.by_month ?? []).map((m) => ({
    month: m.month,
    amount: Number(m.amount),
  }));

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Fees"
        subtitle="What came in today and this month, and what is still owed."
        actions={
          <Link href="/school/fees" className={primaryLink}>
            Take a payment
          </Link>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {/* The band carries the month's headline; every number in it is one the
          strip below also shows, read as a sentence rather than a figure. */}
      <Hero
        eyebrow="This month"
        title={
          data ? `${inr(data.collected_this_month)} collected` : "Collections this month"
        }
        action={
          <Link href="/school/fees/dues" className={secondaryLink}>
            Chase dues
          </Link>
        }
      >
        {data
          ? `${data.collection_rate}% of what fell due. ${inr(
              data.outstanding
            )} is still owed by ${data.students_owing} family(ies).`
          : "Fetching the month's collections…"}
      </Hero>

      <StatStrip
        stats={[
          {
            label: "Collected today",
            value: data ? inr(data.collected_today) : "—",
            icon: IndianRupee,
          },
          {
            label: "Collected this month",
            value: data ? inr(data.collected_this_month) : "—",
            note: data ? `${data.collection_rate}% of what fell due` : undefined,
            icon: Receipt,
          },
          {
            label: "Outstanding",
            value: data ? inr(data.outstanding) : "—",
            note: data ? `${data.students_owing} family(ies)` : undefined,
            icon: Wallet,
          },
          {
            label: "Raised this month",
            value: data ? inr(data.raised_this_month) : "—",
            icon: Layers,
          },
        ]}
      />

      <QuickActions
        actions={[
          { label: "Outstanding dues", href: "/school/fees/dues", icon: Wallet },
          { label: "Fee structures", href: "/school/fees/structures", icon: Layers },
          { label: "Reminders", href: "/school/fees/reminders", icon: BellRing },
          { label: "Online payments", href: "/school/fees/online", icon: CreditCard },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Collections by month"
          subtitle="Dated by the day the money was taken, not the day it fell due."
          empty={months.length === 0 && "Nothing has been collected yet."}
        >
          <TrendChart
            data={months}
            x="month"
            series={[{ key: "amount", name: "Collected" }]}
            yFormatter={compact}
          />
        </ChartCard>

        <ChartCard
          title="How old the money is"
          subtitle="Every unpaid bill, bucketed by days past its due date."
          empty={buckets.every((b) => b.amount === 0) && "Nothing is outstanding."}
        >
          <BreakdownChart
            data={buckets}
            x="label"
            series={[{ key: "amount", name: "Outstanding" }]}
            colorBy={(row) => BUCKET_TONE[String(row.label)] ?? VERDICT.fair}
            xFormatter={compact}
          />
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Who owes the most</CardTitle>
          <Link
            href="/school/fees/dues"
            className="text-[13px] font-bold text-brand-600 hover:underline"
          >
            All dues
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Admission no", "Student", "Owed", "Bills", "Oldest"]}
            empty={
              (data?.top_defaulters.length ?? 0) === 0 && "Nobody owes anything."
            }
          >
            {(data?.top_defaulters ?? []).map((d) => (
              <tr key={d.student_id}>
                <td className={td}>{d.admission_no}</td>
                <td className={tdStrong}>
                  <Link
                    href={`/school/fees/ledger/${d.student_id}`}
                    className="hover:underline"
                  >
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
                    <Badge tone={d.oldest_days > 90 ? "rose" : d.oldest_days > 30 ? "amber" : "emerald"}>
                      {d.oldest_days} days
                    </Badge>
                  ) : (
                    <span className="text-ink-subtle">Not yet due</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
