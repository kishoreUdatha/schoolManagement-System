"use client";

import { useEffect, useState } from "react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { SERIES } from "@/components/charts/theme";
import { ReportShell, percentTone } from "@/components/reports/ReportShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

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
      actions={
        <Input
          type="month"
          aria-label="Month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Working days" value={data?.working_days ?? "—"} />
        <StatCard label="Staff marked" value={staff.length || "—"} />
        <StatCard
          label="Average attendance"
          value={average === null ? "—" : `${average}%`}
          accent={average !== null && average >= 90 ? "emerald" : "amber"}
        />
        <StatCard
          label="Below 90%"
          value={staff.length ? struggling : "—"}
          accent={struggling ? "amber" : "emerald"}
        />
      </div>

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
          <CardTitle>Everybody</CardTitle>
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
      </Card>
    </ReportShell>
  );
}
