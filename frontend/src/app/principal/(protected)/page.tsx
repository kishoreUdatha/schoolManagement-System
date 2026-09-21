"use client";

import {
  Bell,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  IndianRupee,
  ReceiptText,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type Counts = {
  students_active: number;
  teachers_active: number;
  non_teaching_active: number;
  parents_active: number;
  classes_current_year: number;
  sections_current_year: number;
};

type FeesSummary = {
  pending_count: number;
  pending_outstanding: string;
  overdue_count: number;
  overdue_outstanding: string;
  paid_this_month: string;
};

type AttendanceSummary = {
  available: boolean;
  as_of_date: string | null;
  marked: number;
  present: number;
  absent: number;
  late: number;
  half_day: number;
  attendance_pct: number;
};

type HomeworkSummary = {
  available: boolean;
  total_homework: number;
  homework_with_submission: number;
  total_submissions: number;
  reviewed_submissions: number;
  submission_rate_pct: number;
  review_rate_pct: number;
};

type ExamPerformanceSummary = {
  available: boolean;
  exam_id: number | null;
  exam_name: string | null;
  marks_count: number;
  average_pct: number;
  pass_rate_pct: number;
  note: string | null;
};

type NotificationsSummary = {
  since: string;
  sent_count: number;
  total_recipients: number;
};

type Dashboard = {
  current_academic_year_name: string | null;
  counts: Counts;
  fees: FeesSummary;
  attendance: AttendanceSummary;
  homework: HomeworkSummary;
  exam_performance: ExamPerformanceSummary;
  notifications: NotificationsSummary;
  generated_at: string;
};

function formatINR(amount: string | number): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!isFinite(n)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function PrincipalDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Dashboard>("/api/v1/principal/dashboard")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  if (error) {
    return (
      <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
        {error}
      </div>
    );
  }
  if (!data) {
    return <div className="text-sm text-ink-muted">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">School overview</h1>
          {data.current_academic_year_name && (
            <Badge tone="brand">{data.current_academic_year_name}</Badge>
          )}
        </div>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Daily snapshot of attendance, fees, exams, and notifications.
        </p>
      </div>

      {/* Headline counts */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<GraduationCap className="h-4 w-4" />}
          label="Total students"
          value={data.counts.students_active.toLocaleString("en-IN")}
        />
        <StatTile
          icon={<Users className="h-4 w-4" />}
          label="Total teachers"
          value={data.counts.teachers_active.toLocaleString("en-IN")}
          hint={`+ ${data.counts.non_teaching_active} non-teaching`}
        />
        <StatTile
          icon={<CalendarCheck className="h-4 w-4" />}
          label="Today's attendance"
          value={
            data.attendance.marked
              ? `${data.attendance.attendance_pct}%`
              : "Not marked"
          }
          hint={
            data.attendance.marked
              ? `${data.attendance.present} present · ${data.attendance.absent} absent`
              : data.attendance.as_of_date ?? ""
          }
          link="/principal/reports"
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4" />}
          label="Exam performance"
          value={
            data.exam_performance.available
              ? `${data.exam_performance.average_pct}%`
              : "No exam yet"
          }
          hint={
            data.exam_performance.available
              ? `${data.exam_performance.exam_name} · ${data.exam_performance.pass_rate_pct}% pass`
              : data.exam_performance.note ?? ""
          }
        />
      </div>

      {/* Fees + notifications + homework */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Tile title="Fee collection" icon={<IndianRupee className="h-4 w-4" />}>
          <KV label="This month" value={formatINR(data.fees.paid_this_month)} />
          <KV
            label="Pending"
            value={formatINR(data.fees.pending_outstanding)}
            sub={`${data.fees.pending_count} invoice${data.fees.pending_count === 1 ? "" : "s"}`}
            tone="amber"
          />
          <KV
            label="Overdue"
            value={formatINR(data.fees.overdue_outstanding)}
            sub={`${data.fees.overdue_count} invoice${data.fees.overdue_count === 1 ? "" : "s"}`}
            tone="rose"
          />
        </Tile>

        <Tile title="Homework completion" icon={<BookOpen className="h-4 w-4" />}>
          <KV
            label="Homework posted (this month)"
            value={data.homework.total_homework.toLocaleString("en-IN")}
          />
          <KV
            label="Submission rate"
            value={`${data.homework.submission_rate_pct}%`}
            sub={`${data.homework.homework_with_submission} of ${data.homework.total_homework} got at least one submission`}
            tone="brand"
          />
          <KV
            label="Review rate"
            value={`${data.homework.review_rate_pct}%`}
            sub={`${data.homework.reviewed_submissions} of ${data.homework.total_submissions} reviewed`}
          />
        </Tile>

        <Tile title="Notifications sent" icon={<Bell className="h-4 w-4" />}>
          <KV
            label="Notices this month"
            value={data.notifications.sent_count.toLocaleString("en-IN")}
          />
          <KV
            label="Total recipients"
            value={data.notifications.total_recipients.toLocaleString("en-IN")}
            sub="Aggregate across all channels"
          />
        </Tile>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Tile title="Today" icon={<ClipboardCheck className="h-4 w-4" />}>
          <KV label="Present" value={String(data.attendance.present)} tone="emerald" />
          <KV label="Absent" value={String(data.attendance.absent)} tone="rose" />
          <KV label="Late" value={String(data.attendance.late)} tone="amber" />
          <KV label="Half day" value={String(data.attendance.half_day)} />
        </Tile>

        <Tile title="Roster" icon={<Users className="h-4 w-4" />}>
          <KV label="Classes" value={String(data.counts.classes_current_year)} />
          <KV label="Sections" value={String(data.counts.sections_current_year)} />
          <KV label="Parents on app" value={String(data.counts.parents_active)} />
        </Tile>

        <Tile title="Invoices" icon={<ReceiptText className="h-4 w-4" />}>
          <KV label="Pending count" value={String(data.fees.pending_count)} />
          <KV label="Overdue count" value={String(data.fees.overdue_count)} />
        </Tile>
      </div>

      <p className="text-xs text-ink-subtle">
        Generated {new Date(data.generated_at).toLocaleString()}.
      </p>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  hint,
  link,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  link?: string;
}) {
  const body = (
    <Card className="transition-colors hover:border-brand-500/30">
      <CardBody>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-subtle">
          <span className="text-brand-400">{icon}</span>
          {label}
        </div>
        <div className="mt-2 text-2xl font-semibold text-ink">{value}</div>
        {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
      </CardBody>
    </Card>
  );
  return link ? <Link href={link}>{body}</Link> : body;
}

function Tile({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-ink-subtle">
          <span className="text-brand-400">{icon}</span>
          {title}
        </div>
        <div className="space-y-3">{children}</div>
      </CardBody>
    </Card>
  );
}

function KV({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "amber" | "rose" | "emerald" | "brand";
}) {
  const valueTone =
    tone === "amber"
      ? "text-warning"
      : tone === "rose"
      ? "text-danger"
      : tone === "emerald"
      ? "text-success"
      : tone === "brand"
      ? "text-brand-300"
      : "text-ink";
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs text-ink-muted">{label}</div>
        {sub && <div className="mt-0.5 text-[11px] text-ink-subtle">{sub}</div>}
      </div>
      <div className={`text-base font-semibold ${valueTone}`}>{value}</div>
    </div>
  );
}
