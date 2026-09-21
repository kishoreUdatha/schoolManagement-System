"use client";

import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  IndianRupee,
  ReceiptText,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";

import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Field";
import { Hero, QuickActions, StatStrip } from "@/components/ui/Workspace";
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

const contentRow = "grid gap-5 lg:grid-cols-[minmax(0,1fr)_304px]";

const primaryLink =
  "inline-flex min-h-[40px] items-center justify-center gap-2 whitespace-nowrap rounded-[9px] bg-brand-600 px-4 py-2 text-xs font-extrabold text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300";
const secondaryLink =
  "inline-flex min-h-[40px] items-center justify-center gap-2 whitespace-nowrap rounded-[9px] border border-surface-control bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300";

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
    <div className="space-y-[18px]">
      <PageHeader
        title="School overview"
        subtitle="Daily snapshot of attendance, fees, exams, and notifications."
        actions={
          <Link href="/principal/reports" className={primaryLink}>
            Today&apos;s absentees
          </Link>
        }
      />

      {/* No name is in scope on this screen, so the band greets without one
          and spends its line on the figure a head teacher opens this page
          for: whether the school has been marked in today. */}
      <Hero
        eyebrow={data.current_academic_year_name ?? undefined}
        title="Good morning."
        action={
          <Link href="/principal/approvals" className={secondaryLink}>
            Approvals waiting
          </Link>
        }
      >
        {data.attendance.marked
          ? `${data.attendance.attendance_pct}% of the school is in today — ${data.attendance.present} present, ${data.attendance.absent} absent.`
          : `Attendance has not been marked${
              data.attendance.as_of_date ? ` for ${data.attendance.as_of_date}` : " yet"
            }.`}
      </Hero>

      {/* Headline counts */}
      <StatStrip
        stats={[
          {
            label: "Total students",
            value: data.counts.students_active.toLocaleString("en-IN"),
            icon: GraduationCap,
          },
          {
            label: "Total teachers",
            value: data.counts.teachers_active.toLocaleString("en-IN"),
            note: `+ ${data.counts.non_teaching_active} non-teaching`,
            icon: Users,
          },
          {
            label: "Today's attendance",
            value: data.attendance.marked
              ? `${data.attendance.attendance_pct}%`
              : "Not marked",
            note: data.attendance.marked
              ? `${data.attendance.present} present · ${data.attendance.absent} absent`
              : data.attendance.as_of_date ?? undefined,
            icon: CalendarCheck,
          },
          {
            label: "Exam performance",
            value: data.exam_performance.available
              ? `${data.exam_performance.average_pct}%`
              : "No exam yet",
            note: data.exam_performance.available
              ? `${data.exam_performance.exam_name} · ${data.exam_performance.pass_rate_pct}% pass`
              : data.exam_performance.note ?? undefined,
            icon: TrendingUp,
          },
        ]}
      />

      <QuickActions
        actions={[
          { label: "Reports", href: "/principal/reports", icon: BarChart3 },
          { label: "Approvals", href: "/principal/approvals", icon: ClipboardCheck },
          { label: "Exams", href: "/principal/exams", icon: GraduationCap },
          { label: "Applications", href: "/principal/applications", icon: FileCheck2 },
        ]}
      />

      {/* Fees, with the invoice counts beside them */}
      <div className={contentRow}>
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

        <Tile title="Invoices" icon={<ReceiptText className="h-4 w-4" />}>
          <KV label="Pending count" value={String(data.fees.pending_count)} />
          <KV label="Overdue count" value={String(data.fees.overdue_count)} />
        </Tile>
      </div>

      <div className={contentRow}>
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

      <div className={contentRow}>
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
      </div>

      <p className="text-xs text-ink-subtle">
        Generated {new Date(data.generated_at).toLocaleString()}.
      </p>
    </div>
  );
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
