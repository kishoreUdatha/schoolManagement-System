"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Download, Percent, UserCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Table,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { useAcademicYear } from "@/components/AcademicYearProvider";
import { openAuthed } from "@/lib/download";

type Section = { id: number; name: string };
type SchoolClass = { id: number; name: string; sections: Section[] };

type Row = {
  student_id: number;
  admission_no: string;
  roll_no: number;
  full_name: string;
  present: number;
  absent: number;
  late: number;
  half_day: number;
  marked_days: number;
  attendance_pct: number;
};
type Report = {
  section_id: number;
  section_label: string | null;
  year: number;
  month: number;
  from_date: string;
  to_date: string;
  rows: Row[];
  totals: { present: number; absent: number; late: number; half_day: number };
  overall_pct: number;
};

const pctTone = (p: number) => (p >= 90 ? "emerald" : p >= 75 ? "amber" : "rose");

/** The filter bar's controls: one row, one height. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** A month of attendance for one section.
 *
 *  This used to be one tab of three on the reports page, which meant nobody
 *  could send somebody a link to it. It is the figure a form tutor is asked
 *  for most often, so it gets an address of its own.
 */
export default function MonthlyAttendancePage() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sectionId, setSectionId] = useState<number | "">("");
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sections come from the year chosen in the top bar, so switching the year
  // re-points this page rather than pinning it to whichever year is current.
  const yearId = useAcademicYear()?.yearId ?? null;

  useEffect(() => {
    if (!yearId) return;
    api
      .get<SchoolClass[]>("/api/v1/school/classes", {
        params: { academic_year_id: yearId },
      })
      .then((c) => {
        setClasses(c.data);
        const first = c.data.find((k) => k.sections.length > 0);
        setSectionId(first ? first.sections[0].id : "");
      })
      .catch((e) => setError(apiError(e)));
  }, [yearId]);

  const [year, monthNo] = month.split("-").map(Number);

  const load = useCallback(() => {
    if (sectionId === "" || !year || !monthNo) return;
    api
      .get<Report>("/api/v1/school/reports/attendance/student-monthly", {
        params: { section_id: sectionId, year, month: monthNo },
      })
      .then((r) => {
        setData(r.data);
        setError(null);
      })
      .catch((e) => {
        setData(null);
        setError(apiError(e));
      });
  }, [sectionId, year, monthNo]);

  useEffect(() => {
    load();
  }, [load]);

  const download = () =>
    openAuthed(
      `/api/v1/school/reports/attendance/student-monthly.csv?section_id=${sectionId}&year=${year}&month=${monthNo}`,
      `attendance-${month}.csv`
    );

  const rows = data?.rows ?? [];

  // The scope in words, from what the page already holds: the section that is
  // selected and the month that is in the box.
  const sectionLabel = useMemo(() => {
    for (const k of classes) {
      const s = k.sections.find((x) => x.id === sectionId);
      if (s) return `${k.name} ${s.name}`;
    }
    return null;
  }, [classes, sectionId]);
  const monthLabel =
    year && monthNo
      ? new Date(year, monthNo - 1, 1).toLocaleString("en", {
          month: "long",
          year: "numeric",
        })
      : "—";

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Monthly attendance"
        subtitle="A month of the register for one section, per child."
        actions={
          <Button variant="secondary" onClick={download} disabled={!data}>
            <Download className="mr-1.5 h-4 w-4" />
            CSV
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {/* Section and month first: nothing below means anything until the
          register being asked about has been named. */}
      <FilterBar>
        <select
          aria-label="Section"
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
          className={filterSelect}
        >
          {classes.length === 0 && <option value="">No classes</option>}
          {classes.map((k) =>
            k.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {k.name} {s.name}
              </option>
            ))
          )}
        </select>
        <input
          type="month"
          aria-label="Month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className={filterSelect}
        />
        <Button variant="secondary" onClick={load} disabled={sectionId === ""}>
          Apply
        </Button>
      </FilterBar>

      <StatStrip
        stats={[
          {
            label: "Children in scope",
            value: data ? rows.length : "—",
            note: data?.section_label ?? sectionLabel ?? "No section chosen",
            icon: Users,
          },
          {
            label: "Reporting period",
            value: monthLabel,
            note: data ? `${data.from_date} to ${data.to_date}` : undefined,
            icon: CalendarRange,
          },
          {
            label: "Overall attendance",
            value: data ? `${data.overall_pct}%` : "—",
            note: data ? `${data.totals.present} present · ${data.totals.absent} absent` : undefined,
            icon: Percent,
          },
          {
            label: "Late / half day",
            value: data ? `${data.totals.late} / ${data.totals.half_day}` : "—",
            note: "Late counts as present, a half day as half",
            icon: UserCheck,
          },
        ]}
      />

      {data && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{data.section_label ?? "Section"}</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">
                {data.from_date} to {data.to_date}
              </p>
            </div>
          </CardHeader>
          <Table
            head={[
              "Roll",
              "Student",
              "Present",
              "Absent",
              "Late",
              "Half day",
              "Marked",
              "Attendance",
            ]}
            empty={
              rows.length === 0 &&
              "Nothing was marked for this section that month."
            }
          >
            {rows.map((r) => (
              <tr key={r.student_id}>
                <td className={td}>{r.roll_no}</td>
                <td className={tdStrong}>
                  {r.full_name}
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {r.admission_no}
                  </span>
                </td>
                <td className={td}>{r.present}</td>
                <td className={td}>{r.absent}</td>
                <td className={td}>{r.late}</td>
                <td className={td}>{r.half_day}</td>
                <td className={td}>{r.marked_days}</td>
                <td className={td}>
                  <Badge tone={pctTone(r.attendance_pct)}>{r.attendance_pct}%</Badge>
                </td>
              </tr>
            ))}
          </Table>
          <PanelFooter
            left={`Showing ${rows.length} child(ren)`}
            right={`Overall ${data.overall_pct}%`}
          />
        </Card>
      )}
    </div>
  );
}
