"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  Bus,
  CalendarCheck,
  CheckSquare,
  GraduationCap,
  IndianRupee,
  Library,
  Package,
  PieChart,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";

import { ChartCard, TrendChart } from "@/components/charts/Charts";
import { SERIES } from "@/components/charts/theme";
import { ReportShell } from "@/components/reports/ReportShell";
import { Card } from "@/components/ui/Card";
import { inr } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Overview = {
  students: number;
  staff: number;
  attendance_this_month: number;
  collected_this_month: string;
  outstanding: string;
  attendance_by_month: { month: string; percent: number }[];
  money_by_month: { month: string; collected: string; raised: string }[];
};

/** The index every other report hangs off, with the headline figures on top.
 *
 *  Grouped the way a school thinks about itself rather than the way the API
 *  is laid out: who is here, how they are doing, what the money did, and how
 *  the rest of the place is running.
 */
const GROUPS: { heading: string; reports: { href: string; label: string; blurb: string; icon: typeof Users }[] }[] = [
  {
    heading: "Who is in the school",
    reports: [
      { href: "/school/reports/strength", label: "Student strength", blurb: "Class and section rolls, against capacity and last year", icon: Users },
      { href: "/school/reports/demographics", label: "Demographics", blurb: "Gender, age and blood group, and how much is on file", icon: PieChart },
      { href: "/school/reports/admissions", label: "Admission funnel", blurb: "Applications by stage, and how many became students", icon: GraduationCap },
    ],
  },
  {
    heading: "How they are doing",
    reports: [
      { href: "/school/reports/attendance", label: "Attendance", blurb: "Daily absentees and class percentages", icon: CalendarCheck },
      { href: "/school/reports/chronic-absence", label: "Chronic absence", blurb: "Children below a threshold, school-wide", icon: CheckSquare },
      { href: "/school/reports/exams", label: "Exam analysis", blurb: "Pass rate, grade spread and the subjects that went wrong", icon: BarChart3 },
    ],
  },
  {
    heading: "Money",
    reports: [
      { href: "/school/reports/fee-collection", label: "Fee collection", blurb: "What came in, by head, class and mode", icon: IndianRupee },
      { href: "/school/reports/dues", label: "Dues and ageing", blurb: "How old the unpaid money is, and who owes it", icon: Wallet },
      { href: "/school/reports/inventory", label: "Stock and assets", blurb: "What the store is worth and what is running out", icon: Package },
    ],
  },
  {
    heading: "Running the place",
    reports: [
      { href: "/school/reports/staff-attendance", label: "Staff attendance", blurb: "A month per person, not a day at a time", icon: UserCheck },
      { href: "/school/reports/teachers", label: "Teacher activity", blurb: "Classes held, syllabus covered, marks entered", icon: GraduationCap },
      { href: "/school/reports/transport", label: "Transport", blurb: "Seats used against seats bought, route by route", icon: Bus },
      { href: "/school/reports/library", label: "Library usage", blurb: "Issues over time and what gets borrowed", icon: Library },
      { href: "/school/reports/notifications", label: "Notifications", blurb: "What was sent, and how much of it left the app", icon: Bell },
    ],
  },
];

export default function ReportsIndexPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Overview>("/api/v1/school/analytics/overview", { params: { months: 12 } })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const money = (data?.money_by_month ?? []).map((m) => ({
    month: m.month,
    Collected: Number(m.collected),
    Raised: Number(m.raised),
  }));
  const attendance = (data?.attendance_by_month ?? []).filter((m) => m.percent > 0);

  return (
    <ReportShell
      title="Reports"
      subtitle="The school in figures. Everything here reads; nothing here changes a record."
      error={error}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={data?.students ?? "—"} icon={Users} />
        <StatCard label="Staff" value={data?.staff ?? "—"} icon={UserCheck} />
        <StatCard
          label="Attendance this month"
          value={data ? `${data.attendance_this_month}%` : "—"}
          accent={data && data.attendance_this_month >= 85 ? "emerald" : "amber"}
          icon={CalendarCheck}
        />
        <StatCard
          label="Outstanding fees"
          value={data ? inr(data.outstanding) : "—"}
          hint={data ? `${inr(data.collected_this_month)} collected this month` : undefined}
          accent={data && Number(data.outstanding) > 0 ? "amber" : "emerald"}
          icon={IndianRupee}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Attendance"
          subtitle="Late counts as present, a half-day as half."
          empty={attendance.length === 0 && "No attendance has been marked yet."}
        >
          <TrendChart
            data={attendance}
            x="month"
            series={[{ key: "percent", name: "Attendance %" }]}
            yFormatter={(v) => `${v}%`}
          />
        </ChartCard>

        <ChartCard
          title="Fees raised and collected"
          subtitle="A gap that widens month on month is the one to chase."
          empty={money.length === 0 && "No fees have been raised yet."}
        >
          <TrendChart
            data={money}
            x="month"
            series={[
              { key: "Raised", name: "Raised", color: SERIES[7] },
              { key: "Collected", name: "Collected", color: SERIES[0] },
            ]}
            yFormatter={(v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${v / 1000}k`)}
          />
        </ChartCard>
      </div>

      {GROUPS.map((group) => (
        <div key={group.heading} className="space-y-3">
          <h2 className="text-[13px] font-extrabold uppercase tracking-[0.6px] text-ink-muted">
            {group.heading}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.reports.map((r) => (
              <Link key={r.href} href={r.href}>
                <Card className="h-full p-4 transition-colors hover:border-brand-300 hover:bg-surface-hover">
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600"
                      aria-hidden="true"
                    >
                      <r.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[15px] font-extrabold text-ink">{r.label}</div>
                      <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{r.blurb}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </ReportShell>
  );
}
