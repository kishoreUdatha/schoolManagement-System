"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Percent, UserMinus } from "lucide-react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { VERDICT } from "@/components/charts/theme";
import { CsvButton, ReportShell, percentTone } from "@/components/reports/ReportShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, td, tdStrong } from "@/components/ui/Field";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
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

/** One height for every control in the filter row. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

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
      {/* Threshold, minimum days and window: what counts as chronic is a
          choice, and it is made before anybody is listed. */}
      <FilterBar>
        <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
          Attendance below
          <select
            aria-label="Attendance below"
            value={below}
            onChange={(e) => setBelow(e.target.value)}
            className={filterSelect}
          >
            <option value="60">60%</option>
            <option value="70">70%</option>
            <option value="75">75%</option>
            <option value="80">80%</option>
            <option value="90">90%</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
          At least
          <select
            aria-label="At least"
            value={minDays}
            onChange={(e) => setMinDays(e.target.value)}
            className={filterSelect}
          >
            <option value="5">5 days marked</option>
            <option value="10">10 days marked</option>
            <option value="20">20 days marked</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
          From
          <input
            type="date"
            aria-label="From"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={filterSelect}
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
          To
          <input
            type="date"
            aria-label="To"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={filterSelect}
          />
        </label>
        <Button variant="secondary" onClick={apply}>
          Apply
        </Button>
      </FilterBar>

      <StatStrip
        stats={[
          {
            label: "Children below the threshold",
            value: data?.count ?? "—",
            note: data ? `${students.length} listed below` : undefined,
            icon: UserMinus,
          },
          {
            label: "Threshold",
            value: data ? `${data.below}%` : "—",
            note: data ? `at least ${data.min_days} days marked` : undefined,
            icon: Percent,
          },
          {
            label: "Window",
            value: windowDays !== null ? `${windowDays} days` : "—",
            note: data ? `${data.from_date} to ${data.to_date}` : undefined,
            icon: CalendarRange,
          },
        ]}
      />

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
          <div>
            <CardTitle>Everyone below the threshold</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {data
                ? `Below ${data.below}% · at least ${data.min_days} days marked · ${data.from_date} to ${data.to_date}`
                : "Fetching the selected window…"}
            </p>
          </div>
        </CardHeader>
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
        <PanelFooter
          left={`Showing ${students.length} child(ren)`}
          right={data ? `${data.count} below ${data.below}%` : undefined}
        />
      </Card>
    </ReportShell>
  );
}
