"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Select,
  Table,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";

type AcademicYear = { id: number; name: string; is_current: boolean };
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

  useEffect(() => {
    api
      .get<AcademicYear[]>("/api/v1/school/academic-years")
      .then((r) => {
        const current = r.data.find((y) => y.is_current) ?? r.data[0];
        if (!current) return;
        return api
          .get<SchoolClass[]>("/api/v1/school/classes", {
            params: { academic_year_id: current.id },
          })
          .then((c) => {
            setClasses(c.data);
            const first = c.data.find((k) => k.sections.length > 0);
            if (first) setSectionId(first.sections[0].id);
          });
      })
      .catch((e) => setError(apiError(e)));
  }, []);

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

  return (
    <div className="space-y-6">
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

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Select
            label="Section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
          >
            {classes.length === 0 && <option value="">No classes</option>}
            {classes.map((k) =>
              k.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {k.name} {s.name}
                </option>
              ))
            )}
          </Select>
          <Input
            label="Month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <Button variant="secondary" onClick={load} disabled={sectionId === ""}>
            Apply
          </Button>
        </CardBody>
      </Card>

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Overall"
              value={`${data.overall_pct}%`}
              accent={pctTone(data.overall_pct)}
            />
            <StatCard label="Present" value={data.totals.present} />
            <StatCard label="Absent" value={data.totals.absent} />
            <StatCard
              label="Late / half day"
              value={`${data.totals.late} / ${data.totals.half_day}`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{data.section_label ?? "Section"}</CardTitle>
              <span className="text-[12px] font-bold text-ink-muted">
                {data.from_date} to {data.to_date}
              </span>
            </CardHeader>
            <CardBody className="p-0">
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
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
