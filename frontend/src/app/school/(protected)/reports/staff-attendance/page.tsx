"use client";

import { useEffect, useState } from "react";

import { CalendarRange, Percent, TrendingDown, Users } from "lucide-react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { SERIES } from "@/components/charts/theme";
import { ReportShell, percentTone } from "@/components/reports/ReportShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { readableDate } from "@/lib/dates";

const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type StaffRow = {
  user_id: number;
  name: string;
  role: string;
  present: number;
  late: number;
  absent: number;
  on_leave: number;
  sick: number;
  holiday: number;
  marked: number;
  percent: number;
};
type StaffAttendance = {
  year: number;
  month: number;
  from_date: string;
  to_date: string;
  working_days: number;
  staff: StaffRow[];
};

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** A month of staff attendance per person, which is the shape the question
 *  is actually asked in — the daily register cannot answer "who has been
 *  away a lot lately". */
export default function StaffAttendanceReportPage() {
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<StaffAttendance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const [year, m] = month.split("-");
    setError(null);
    api
      .get<StaffAttendance>("/api/v1/school/analytics/staff-attendance", {
        params: { year: Number(year), month: Number(m) },
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [month]);

  const staff = data?.staff ?? [];
  const average = staff.length
    ? Math.round((staff.reduce((n, s) => n + s.percent, 0) / staff.length) * 10) / 10
    : null;
  const struggling = staff.filter((s) => s.percent < 90).length;

  // The month the server answered for, spelled out, and the days it covered.
  const monthName = data
    ? new Date(data.year, data.month - 1, 1).toLocaleDateString("en-GB", { month: "long" })
    : "—";
  const period = data
    ? `${readableDate(data.from_date)} – ${readableDate(data.to_date)}`
    : undefined;

  // Already sorted worst first by the API, so the ten who most need looking
  // at are simply the ten at the top.
  const lowest = staff.slice(0, 10).map((s) => ({
    name: s.name,
    Present: s.present,
    Late: s.late,
    Absent: s.absent,
    "On leave": s.on_leave,
    Sick: s.sick,
  }));

  return (
    <ReportShell
      title="Staff attendance"
      subtitle="A month at a time, per person. Holidays are not counted as days anybody failed to turn up."
      error={error}
    >
      {/* The month is chosen before anything is computed, so it sits above
          the figures rather than beside the title. */}
      <FilterBar>
        <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
          Month
          <input
            type="month"
            aria-label="Month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className={filterSelect}
          />
        </label>
      </FilterBar>

      <StatStrip
        stats={[
          {
            label: "Staff in scope",
            value: staff.length || "—",
            note: data ? `${data.working_days} working day(s)` : undefined,
            icon: Users,
          },
          {
            label: "Reporting period",
            value: monthName,
            note: period,
            icon: CalendarRange,
          },
          {
            label: "Average attendance",
            value: average === null ? "—" : `${average}%`,
            note: "Across everybody marked",
            icon: Percent,
          },
          {
            label: "Below 90%",
            value: staff.length ? struggling : "—",
            note: staff.length ? `Of ${staff.length} marked` : undefined,
            icon: TrendingDown,
          },
        ]}
      />

      <ChartCard
        title="The ten lowest"
        subtitle="Where the month went for the people furthest below the line."
        empty={lowest.length === 0 && "Nothing has been marked for this month yet."}
        height={Math.max(280, lowest.length * 34)}
      >
        <BreakdownChart
          data={lowest}
          x="name"
          layout="vertical"
          stacked
          series={[
            { key: "Present", name: "Present", color: SERIES[1] },
            { key: "Late", name: "Late", color: SERIES[2] },
            { key: "Absent", name: "Absent", color: SERIES[3] },
            { key: "On leave", name: "On leave", color: SERIES[4] },
            { key: "Sick", name: "Sick", color: SERIES[5] },
          ]}
        />
      </ChartCard>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Everybody</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {period ? `${monthName} · ${period}` : "The selected month"}
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Name", "Role", "Present", "Late", "Absent", "On leave", "Sick", "Marked", "Attendance"]}
            empty={staff.length === 0 && "Nothing has been marked for this month yet."}
          >
            {staff.map((s) => (
              <tr key={s.user_id}>
                <td className={tdStrong}>{s.name}</td>
                <td className={td}>{humanize(s.role)}</td>
                <td className={td}>{s.present}</td>
                <td className={td}>{s.late || "—"}</td>
                <td className={td}>{s.absent || "—"}</td>
                <td className={td}>{s.on_leave || "—"}</td>
                <td className={td}>{s.sick || "—"}</td>
                <td className={td}>{s.marked}</td>
                <td className={td}>
                  <Badge tone={percentTone(s.percent)}>{s.percent}%</Badge>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`Showing ${staff.length} member(s) of staff`}
          right={data ? `${data.working_days} working day(s) in ${monthName}` : undefined}
        />
      </Card>
    </ReportShell>
  );
}
