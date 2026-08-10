"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
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
      <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
    );
  }
  if (!data) {
    return <div className="text-sm text-slate-500">Loading dashboard…</div>;
  }

  const overduePresent = data.fees.overdue_count > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Good morning, {user?.full_name?.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Academic year:{" "}
            <strong>{data.current_academic_year_name ?? "— set a current year"}</strong>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickAction href="/school/students" label="+ Admit student" />
          <QuickAction href="/school/notices" label="Send notice" />
          <QuickAction href="/school/fees" label="View fees" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active students" value={data.counts.students_active} />
        <StatCard
          label="Teachers"
          value={data.counts.teachers_active}
          accent="emerald"
          hint={`+ ${data.counts.non_teaching_active} non-teaching`}
        />
        <StatCard
          label="Parents linked"
          value={data.counts.parents_active}
          accent="brand"
        />
        <StatCard
          label="Pending fees"
          value={inr(data.fees.pending_outstanding)}
          accent={overduePresent ? "amber" : "emerald"}
          hint={
            overduePresent
              ? `${data.fees.overdue_count} overdue — ${inr(
                  data.fees.overdue_outstanding
                )}`
              : `${data.fees.pending_count} record(s) pending`
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
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
          <CardBody className="space-y-2 text-sm">
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
          <CardBody className="space-y-2 text-sm">
            <Row
              label="Classes"
              value={String(data.counts.classes_current_year)}
            />
            <Row
              label="Sections"
              value={String(data.counts.sections_current_year)}
            />
            <div className="flex gap-3 pt-1">
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
          <CardBody>
            {data.upcoming_holidays.length === 0 ? (
              <p className="text-sm text-slate-500">No upcoming holidays.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.upcoming_holidays.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900">{h.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
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
        <CardBody>
          {data.latest_notices.length === 0 ? (
            <p className="text-sm text-slate-500">
              No notices sent yet. Click <strong>Send notice</strong> above.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.latest_notices.map((n) => (
                <li key={n.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium text-slate-900">{n.title}</div>
                    <div className="text-xs text-slate-500">
                      {n.audience.replace("_", " ")} · {n.recipient_count}{" "}
                      recipient(s)
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">
                    {n.sent_at && new Date(n.sent_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

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
        <CardBody>
          {data.upcoming_exams.length === 0 ? (
            <p className="text-sm text-slate-500">
              No exams scheduled in the next 7 days.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.upcoming_exams.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium text-slate-900">{e.name}</div>
                    <div className="text-xs text-slate-500">
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

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
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

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
    >
      {label}
    </Link>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

function PlaceholderCard({ title, note }: { title: string; note: string }) {
  return (
    <Card className="border-dashed">
      <CardBody>
        <div className="text-sm font-medium text-slate-500">{title}</div>
        <div className="mt-2 text-3xl font-bold text-slate-300">—</div>
        <div className="mt-1 text-xs text-slate-400">{note}</div>
      </CardBody>
    </Card>
  );
}
