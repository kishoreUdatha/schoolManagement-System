"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { VERDICT } from "@/components/charts/theme";
import { CsvButton, DateRange, ReportShell, percentTone } from "@/components/reports/ReportShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select, Table, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type AbsentStudent = {
  student_id: number;
  admission_no: string;
  student_name: string;
  section_label: string | null;
  marked_days: number;
  present_days: number;
  absent_days: number;
  percent: number;
};
type ChronicAbsence = {
  from_date: string;
  to_date: string;
  below: number;
  min_days: number;
  count: number;
  students: AbsentStudent[];
};

/** Children whose attendance has slipped, across the whole school.
 *
 *  The monthly attendance report shows one section at a time, which is no
 *  use for finding the child nobody has noticed — they are one row in
 *  somebody else's register.
 */
export default function ChronicAbsenceReportPage() {
  const [data, setData] = useState<ChronicAbsence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [below, setBelow] = useState("75");
  const [minDays, setMinDays] = useState("10");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // The query the table was built from, so the CSV matches the screen rather
  // than whatever is sitting in the boxes unapplied.
  const [query, setQuery] = useState<Record<string, string | undefined>>({ below: "75", min_days: "10" });

  const load = useCallback((params: Record<string, string | undefined>) => {
    setQuery(params);
    api
      .get<ChronicAbsence>("/api/v1/school/analytics/chronic-absence", { params })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  useEffect(() => {
    load({ below, min_days: minDays });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = () =>
    load({ below, min_days: minDays, from: from || undefined, to: to || undefined });

  const students = data?.students ?? [];
  const worst = students.slice(0, 15).map((s) => ({
    name: s.student_name,
    percent: s.percent,
  }));

  const windowDays =
    data && data.from_date && data.to_date
      ? Math.round(
          (new Date(data.to_date).getTime() - new Date(data.from_date).getTime()) / 86_400_000
        )
      : null;

  return (
    <ReportShell
      title="Chronic absence"
      subtitle="Every child below the threshold, school-wide, with enough days marked for the figure to mean something."
      error={error}
      actions={<CsvButton path="chronic-absence.csv" query={query} />}
    >
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Select
            label="Attendance below"
            value={below}
            onChange={(e) => setBelow(e.target.value)}
            className="w-36"
          >
            <option value="60">60%</option>
            <option value="70">70%</option>
            <option value="75">75%</option>
            <option value="80">80%</option>
            <option value="90">90%</option>
          </Select>
          <Select
            label="At least"
            value={minDays}
            onChange={(e) => setMinDays(e.target.value)}
            className="w-40"
          >
            <option value="5">5 days marked</option>
            <option value="10">10 days marked</option>
            <option value="20">20 days marked</option>
          </Select>
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} onApply={apply} />
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Children below the threshold"
          value={data?.count ?? "—"}
          accent={data && data.count > 0 ? "rose" : "emerald"}
        />
        <StatCard label="Threshold" value={data ? `${data.below}%` : "—"} hint={data ? `at least ${data.min_days} days marked` : undefined} />
        <StatCard
          label="Window"
          value={windowDays !== null ? `${windowDays} days` : "—"}
          hint={data ? `${data.from_date} to ${data.to_date}` : undefined}
        />
      </div>

      <ChartCard
        title="The fifteen furthest behind"
        subtitle="Attendance across the window. Late counts as present, a half-day as half."
        height={Math.max(220, worst.length * 28)}
        empty={worst.length === 0 && "No child is below the threshold in this window."}
      >
        <BreakdownChart
          data={worst}
          x="name"
          layout="vertical"
          series={[{ key: "percent", name: "Attendance %" }]}
          xFormatter={(v) => `${v}%`}
          colorBy={(row) => {
            const pct = Number(row.percent);
            if (pct < 50) return VERDICT.poor;
            if (pct < 70) return VERDICT.fair;
            return VERDICT.good;
          }}
        />
      </ChartCard>

      <Card>
        <CardHeader>
          <CardTitle>Everyone below the threshold</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Admission no", "Student", "Days marked", "Present", "Absent", "Attendance"]}
            empty={students.length === 0 && "No child is below the threshold in this window."}
          >
            {students.map((s) => (
              <tr key={s.student_id}>
                <td className={td}>{s.admission_no}</td>
                <td className={tdStrong}>
                  <Link href={`/school/students/${s.student_id}`} className="text-brand-600 hover:underline">
                    {s.student_name}
                  </Link>
                  {s.section_label && (
                    <span className="block text-[11px] text-ink-subtle">{s.section_label}</span>
                  )}
                </td>
                <td className={td}>{s.marked_days}</td>
                <td className={td}>{s.present_days}</td>
                <td className={td}>{s.absent_days}</td>
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
