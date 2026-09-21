"use client";

import {
  BarChart3,
  CalendarDays,
  GraduationCap,
  IndianRupee,
  Layers,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Field";
import { Hero, QuickActions, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";

type Counts = {
  students_active: number;
  teachers_active: number;
  non_teaching_active: number;
  parents_active: number;
  classes_current_year: number;
  sections_current_year: number;
};

type Fees = {
  pending_count: number;
  pending_outstanding: string;
  overdue_count: number;
  overdue_outstanding: string;
  paid_this_month: string;
};

type Admissions = {
  this_month_count: number;
  last_30_days_count: number;
};

type Holiday = {
  id: number;
  name: string;
  type: "national" | "school" | "vacation";
  start_date: string;
  end_date: string;
  days: number;
};

type Placeholder = { available: boolean; note: string };

type NoticeSummary = {
  id: number;
  title: string;
  audience: string;
  sent_at: string | null;
  recipient_count: number;
};

type UpcomingExam = {
  id: number;
  name: string;
  kind: string;
  start_date: string;
  end_date: string;
  is_published: boolean;
  papers_count: number;
};

type Dashboard = {
  current_academic_year_id: number | null;
  current_academic_year_name: string | null;
  counts: Counts;
  fees: Fees;
  admissions: Admissions;
  upcoming_holidays: Holiday[];
  latest_notices: NoticeSummary[];
  upcoming_exams: UpcomingExam[];
  attendance: Placeholder;
  homework: Placeholder;
  generated_at: string;
};

const inr = (n: string | number) =>
  `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const holidayTone = {
  national: "rose",
  school: "amber",
  vacation: "emerald",
} as const;

/** The mock's two content columns: the panel you read and the one you
 *  glance at, on the same baseline. */
const contentRow = "grid gap-5 lg:grid-cols-[minmax(0,1fr)_304px]";

/** A Link that carries a button's weight. Button itself renders a <button>,
 *  and a destination should be a link — openable in a new tab, and right
 *  under the cursor's middle click. */
const primaryLink =
  "inline-flex min-h-[40px] items-center justify-center gap-2 whitespace-nowrap rounded-[9px] bg-brand-600 px-4 py-2 text-xs font-extrabold text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300";
const secondaryLink =
  "inline-flex min-h-[40px] items-center justify-center gap-2 whitespace-nowrap rounded-[9px] border border-surface-control bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300";

export default function SchoolAdminDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = auth.getUser();

  useEffect(() => {
    api
      .get<Dashboard>("/api/v1/school/dashboard")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  if (error) {
    return (
      <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
    );
  }
  if (!data) {
    return <div className="text-sm text-ink-muted">Loading dashboard…</div>;
  }

  const overduePresent = data.fees.overdue_count > 0;
  const firstName = user?.full_name?.trim().split(/\s+/)[0];

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Dashboard"
        actions={
          <Link href="/school/students" className={primaryLink}>
            + Admit student
          </Link>
        }
      />

      {/* The welcome band says the one thing that cannot wait: whether any
          money is late. Both branches are figures the dashboard already
          fetched — the hero repeats them, it does not invent them. */}
      <Hero
        eyebrow={
          data.current_academic_year_name
            ? `${data.current_academic_year_name} academic year`
            : undefined
        }
        title={firstName ? `Good morning, ${firstName}` : "Good morning."}
        action={
          <Link href="/school/notices" className={secondaryLink}>
            Send a notice
          </Link>
        }
      >
        {overduePresent
          ? `${data.fees.overdue_count} fee record(s) are overdue — ${inr(
              data.fees.overdue_outstanding
            )} in all. Everything else on this page is on track.`
          : `Nothing is overdue. ${data.admissions.this_month_count} admission(s) this month and ${inr(
              data.fees.paid_this_month
            )} collected.`}
      </Hero>

      <StatStrip
        stats={[
          {
            label: "Active students",
            value: data.counts.students_active.toLocaleString("en-IN"),
            note: data.current_academic_year_name ?? "No current year set",
            icon: GraduationCap,
          },
          {
            label: "Teachers",
            value: data.counts.teachers_active.toLocaleString("en-IN"),
            note: `+ ${data.counts.non_teaching_active} non-teaching`,
            icon: Users,
          },
          {
            label: "Parents linked",
            value: data.counts.parents_active.toLocaleString("en-IN"),
            note: "Accounts on the parent app",
            icon: UsersRound,
          },
          {
            label: "Pending fees",
            value: inr(data.fees.pending_outstanding),
            note: overduePresent
              ? `${data.fees.overdue_count} overdue — ${inr(data.fees.overdue_outstanding)}`
              : `${data.fees.pending_count} record(s) pending`,
            icon: IndianRupee,
          },
        ]}
      />

      <QuickActions
        actions={[
          { label: "Fees", href: "/school/fees", icon: Wallet },
          { label: "Classes", href: "/school/classes", icon: Layers },
          { label: "Timetable", href: "/school/timetable", icon: CalendarDays },
          { label: "Reports", href: "/school/reports", icon: BarChart3 },
        ]}
      />

      <div className={contentRow}>
        <Card>
          <CardHeader>
            <CardTitle>Latest notices</CardTitle>
            <Link
              href="/school/notices"
              className="text-xs text-brand-700 hover:underline"
            >
              All notices →
            </Link>
          </CardHeader>
          <CardBody className="pt-0">
            {data.latest_notices.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No notices sent yet. Click <strong>Send a notice</strong> above.
              </p>
            ) : (
              <ul className="divide-y divide-surface-border text-sm">
                {data.latest_notices.map((n) => (
                  <li key={n.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-medium text-ink">{n.title}</div>
                      <div className="text-xs text-ink-muted">
                        {n.audience.replace("_", " ")} · {n.recipient_count}{" "}
                        recipient(s)
                      </div>
                    </div>
                    <span className="text-xs text-ink-muted">
                      {n.sent_at && new Date(n.sent_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>This month</CardTitle>
              <Link
                href="/school/students"
                className="text-xs text-brand-700 hover:underline"
              >
                View students
              </Link>
            </CardHeader>
            <CardBody className="space-y-2 pt-0 text-sm">
              <Row
                label="New admissions"
                value={String(data.admissions.this_month_count)}
              />
              <Row
                label="Last 30 days"
                value={String(data.admissions.last_30_days_count)}
              />
              <Row label="Fees collected" value={inr(data.fees.paid_this_month)} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Academic setup</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 pt-0 text-sm">
              <Row
                label="Classes"
                value={String(data.counts.classes_current_year)}
              />
              <Row
                label="Sections"
                value={String(data.counts.sections_current_year)}
              />
              <div className="flex flex-wrap gap-3 pt-1">
                <Link
                  href="/school/classes"
                  className="text-xs font-medium text-brand-700 hover:underline"
                >
                  Classes →
                </Link>
                <Link
                  href="/school/subjects"
                  className="text-xs font-medium text-brand-700 hover:underline"
                >
                  Subjects →
                </Link>
                <Link
                  href="/school/timetable"
                  className="text-xs font-medium text-brand-700 hover:underline"
                >
                  Timetable →
                </Link>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <div className={contentRow}>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming exams (next 7 days)</CardTitle>
            <Link
              href="/school/exams"
              className="text-xs text-brand-700 hover:underline"
            >
              All exams →
            </Link>
          </CardHeader>
          <CardBody className="pt-0">
            {data.upcoming_exams.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No exams scheduled in the next 7 days.
              </p>
            ) : (
              <ul className="divide-y divide-surface-border text-sm">
                {data.upcoming_exams.map((e) => (
                  <li key={e.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-medium text-ink">{e.name}</div>
                      <div className="text-xs text-ink-muted">
                        {e.kind.replace("_", " ")} · {e.papers_count} paper(s) ·{" "}
                        {e.start_date} → {e.end_date}
                      </div>
                    </div>
                    {e.is_published ? (
                      <Badge tone="emerald">published</Badge>
                    ) : (
                      <Badge tone="amber">draft</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming holidays</CardTitle>
            <Link
              href="/school/holidays"
              className="text-xs text-brand-700 hover:underline"
            >
              Calendar →
            </Link>
          </CardHeader>
          <CardBody className="pt-0">
            {data.upcoming_holidays.length === 0 ? (
              <p className="text-sm text-ink-muted">No upcoming holidays.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.upcoming_holidays.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">{h.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-ink-muted">
                        {h.start_date === h.end_date
                          ? h.start_date
                          : `${h.start_date} → ${h.end_date}`}
                      </span>
                      <Badge tone={holidayTone[h.type]}>{h.type}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-[13px] font-extrabold uppercase tracking-[0.6px] text-ink-muted">
          Coming soon
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <PlaceholderCard title="Today&apos;s attendance" note={data.attendance.note} />
          <PlaceholderCard title="Pending homework" note={data.homework.note} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-surface-border py-1.5 last:border-0">
      <span className="text-[12px] font-bold text-ink-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

function PlaceholderCard({ title, note }: { title: string; note: string }) {
  return (
    <Card className="border-dashed">
      <CardBody>
        <div className="text-sm font-medium text-ink-muted">{title}</div>
        <div className="mt-2 text-3xl font-bold text-ink-subtle">—</div>
        <div className="mt-1 text-xs text-ink-subtle">{note}</div>
      </CardBody>
    </Card>
  );
}
