"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  FileSearch,
  GraduationCap,
  UserPlus,
} from "lucide-react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { SERIES } from "@/components/charts/theme";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { Hero, QuickActions, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { daysLeft, shortDate } from "@/lib/dates";
import { stageTone } from "@/app/school/(protected)/admissions/types";
import type { AdmissionStage } from "@/app/school/(protected)/admissions/types";

type Stats = {
  total: number;
  by_stage: Record<string, number>;
  by_source: Record<string, number>;
  enrolled: number;
  lost: number;
  open: number;
  conversion_rate: number;
  follow_ups_due: number;
};
type Funnel = {
  by_status: Record<string, number>;
  total: number;
  in_progress: number;
  admitted: number;
};
type Enquiry = {
  id: number;
  student_name: string;
  parent_name: string;
  parent_phone: string;
  stage: AdmissionStage;
  next_follow_up_date: string | null;
  assigned_to_name: string | null;
};
type Application = {
  id: number;
  application_no: string;
  student_name: string;
  class_name: string | null;
  applying_for_class: string | null;
  status: string;
  documents_total: number;
  documents_verified: number;
  submitted_at: string | null;
};

const base = "/api/v1/school/admissions";

const primaryLink =
  "inline-flex min-h-[40px] items-center justify-center gap-2 whitespace-nowrap rounded-[9px] bg-brand-600 px-4 py-2 text-xs font-extrabold text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300";
const secondaryLink =
  "inline-flex min-h-[40px] items-center justify-center gap-2 whitespace-nowrap rounded-[9px] border border-surface-control bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300";

// The order a child actually moves through, so the funnel reads as a journey
// rather than as whatever order the database happened to group by.
const FUNNEL_ORDER = [
  "draft",
  "submitted",
  "verification",
  "assessment",
  "approved",
  "fee_pending",
  "admitted",
  "rejected",
  "withdrawn",
];

export default function AdmissionsDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [due, setDue] = useState<Enquiry[]>([]);
  const [inProgress, setInProgress] = useState<Application[]>([]);
  const [toAdmit, setToAdmit] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Stats>(`${base}/stats`).then((r) => setStats(r.data)).catch((e) => setError(apiError(e)));
    api
      .get<Funnel>(`${base}/applications/funnel`)
      .then((r) => setFunnel(r.data))
      .catch((e) => setError(apiError(e)));
    api
      .get<{ items: Enquiry[] }>(`${base}/enquiries`, {
        params: { follow_up_due: true, open_only: true, page_size: 100 },
      })
      .then((r) => setDue(r.data.items))
      .catch(() => setDue([]));

    // Two separate calls because the API filters by one status at a time, and
    // "sitting in the middle of the process" is two statuses.
    Promise.all([
      api.get<Application[]>(`${base}/applications`, { params: { status: "verification" } }),
      api.get<Application[]>(`${base}/applications`, { params: { status: "assessment" } }),
    ])
      .then(([v, a]) => setInProgress([...v.data, ...a.data]))
      .catch(() => setInProgress([]));

    // Approved but not admitted: a place offered that nobody has finished.
    Promise.all([
      api.get<Application[]>(`${base}/applications`, { params: { status: "approved" } }),
      api.get<Application[]>(`${base}/applications`, { params: { status: "fee_pending" } }),
    ])
      .then(([ap, fp]) => setToAdmit([...ap.data, ...fp.data]))
      .catch(() => setToAdmit([]));
  }, []);

  const funnelBars = funnel
    ? FUNNEL_ORDER.filter((s) => (funnel.by_status[s] ?? 0) > 0).map((s) => ({
        label: humanize(s),
        count: funnel.by_status[s] ?? 0,
      }))
    : [];

  const overdue = due.filter((e) => {
    const d = daysLeft(e.next_follow_up_date);
    return d !== null && d < 0;
  }).length;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Admissions"
        subtitle="Where every enquiry and application has got to, and what is waiting on the school."
        actions={
          <Link href="/school/admissions" className={primaryLink}>
            All enquiries
          </Link>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {/* The band leads on the only thing here that is time-bound: who has
          to be rung today. Both figures come from the calls already made. */}
      <Hero
        title={
          stats
            ? stats.follow_ups_due > 0
              ? `${stats.follow_ups_due} enquiry(ies) to chase today`
              : "Nothing is due to be chased today."
            : "Admissions today"
        }
        action={
          <Link href="/school/admissions/follow-ups" className={secondaryLink}>
            Open follow-ups
          </Link>
        }
      >
        {funnel && stats
          ? `${funnel.total} application(s) in all, ${funnel.in_progress} part way through, ${stats.enrolled} enrolled.${
              overdue ? ` ${overdue} follow-up(s) are already overdue.` : ""
            }`
          : "Fetching enquiries and applications…"}
      </Hero>

      <StatStrip
        stats={[
          {
            label: "Enquiries",
            value: stats?.total ?? "—",
            note: stats ? `${stats.open} still open` : undefined,
            icon: UserPlus,
          },
          {
            label: "Follow-ups due",
            value: stats?.follow_ups_due ?? "—",
            note: overdue ? `${overdue} already overdue` : undefined,
            icon: CalendarClock,
          },
          {
            label: "Applications",
            value: funnel?.total ?? "—",
            note: funnel ? `${funnel.in_progress} in progress` : undefined,
            icon: FileCheck2,
          },
          {
            label: "Conversion",
            value: stats ? `${stats.conversion_rate}%` : "—",
            note: stats ? `${stats.enrolled} enrolled, ${stats.lost} lost` : undefined,
            icon: GraduationCap,
          },
        ]}
      />

      <QuickActions
        actions={[
          { label: "Applications", href: "/school/admissions/applications", icon: FileCheck2 },
          { label: "Verification", href: "/school/admissions/verification", icon: FileSearch },
          { label: "Decisions", href: "/school/admissions/decisions", icon: CheckCircle2 },
          { label: "Assessments", href: "/school/admissions/assessments", icon: GraduationCap },
        ]}
      />

      <ChartCard
        title="Where the applications are"
        subtitle="Every application by the stage it has reached."
        empty={funnelBars.length === 0 && "No applications have been started yet."}
        height={Math.max(240, funnelBars.length * 40)}
      >
        <BreakdownChart
          data={funnelBars}
          x="label"
          layout="vertical"
          series={[{ key: "count", name: "Applications", color: SERIES[0] }]}
        />
      </ChartCard>

      <Card>
        <CardHeader>
          <CardTitle>Enquiries to chase</CardTitle>
          <Link href="/school/admissions/follow-ups" className="text-[12px] font-bold text-brand-600 hover:underline">
            All follow-ups
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Child", "Parent", "Stage", "Follow up", "Owner"]}
            empty={due.length === 0 && "Nothing is due to be chased today."}
          >
            {due.slice(0, 8).map((e) => {
              const d = daysLeft(e.next_follow_up_date);
              return (
                <tr key={e.id}>
                  <td className={tdStrong}>
                    <Link href={`/school/admissions/${e.id}`} className="hover:underline">
                      {e.student_name}
                    </Link>
                  </td>
                  <td className={td}>
                    {e.parent_name}
                    <span className="block text-[11px] text-ink-subtle">{e.parent_phone}</span>
                  </td>
                  <td className={td}>
                    <Badge tone={stageTone(e.stage)}>{humanize(e.stage)}</Badge>
                  </td>
                  <td className={td}>
                    {e.next_follow_up_date ? (
                      <Badge tone={d !== null && d < 0 ? "rose" : "amber"}>
                        {shortDate(e.next_follow_up_date)}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={td}>{e.assigned_to_name ?? "Nobody"}</td>
                </tr>
              );
            })}
          </Table>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Part way through</CardTitle>
            <Link href="/school/admissions/verification" className="text-[12px] font-bold text-brand-600 hover:underline">
              Verify documents
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            <Table
              head={["Application", "Child", "Stage", "Documents"]}
              empty={inProgress.length === 0 && "Nothing is waiting on checks."}
            >
              {inProgress.slice(0, 8).map((a) => (
                <tr key={a.id}>
                  <td className={td}>{a.application_no}</td>
                  <td className={tdStrong}>{a.student_name}</td>
                  <td className={td}>
                    <Badge tone={a.status === "assessment" ? "brand" : "amber"}>{humanize(a.status)}</Badge>
                  </td>
                  <td className={td}>
                    {a.documents_verified} of {a.documents_total}
                  </td>
                </tr>
              ))}
            </Table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Offered, not yet admitted</CardTitle>
            <Link href="/school/admissions/decisions" className="text-[12px] font-bold text-brand-600 hover:underline">
              Decisions
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            <Table
              head={["Application", "Child", "Class", "Status"]}
              empty={toAdmit.length === 0 && "Nobody is waiting to be admitted."}
            >
              {toAdmit.slice(0, 8).map((a) => (
                <tr key={a.id}>
                  <td className={td}>{a.application_no}</td>
                  <td className={tdStrong}>{a.student_name}</td>
                  <td className={td}>{a.class_name ?? a.applying_for_class ?? "—"}</td>
                  <td className={td}>
                    <Badge tone={a.status === "fee_pending" ? "amber" : "brand"}>{humanize(a.status)}</Badge>
                  </td>
                </tr>
              ))}
            </Table>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
