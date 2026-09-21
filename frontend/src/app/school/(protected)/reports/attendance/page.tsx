"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  Layers,
  Percent,
  School,
  UserMinus,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Field";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { useAcademicYear } from "@/components/AcademicYearProvider";
import { auth } from "@/lib/auth";
import { api, apiError } from "@/lib/api";

type AcademicYear = { id: number; name: string; is_current: boolean };
type Section = { id: number; name: string };
type SchoolClass = { id: number; name: string; sections: Section[] };

type DailyAbsentRow = {
  student_id: number;
  admission_no: string;
  full_name: string;
  roll_no: number;
  section_id: number;
  class_name: string;
  section_name: string;
  remark: string | null;
};

type ClassSummaryRow = {
  class_id: number;
  class_name: string;
  section_id: number;
  section_name: string;
  total_marks: number;
  present: number;
  absent: number;
  late: number;
  half_day: number;
  distinct_days: number;
  distinct_students: number;
  attendance_pct: number;
};

type StudentMonthlyRow = {
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

type StudentMonthlyReport = {
  section_id: number;
  section_label: string | null;
  year: number;
  month: number;
  from_date: string;
  to_date: string;
  rows: StudentMonthlyRow[];
  totals: { present: number; absent: number; late: number; half_day: number };
  overall_pct: number;
};

type Tab = "daily" | "class" | "student";

/** Every control in a filter bar is the same height, so the row reads as one
 *  row of controls rather than a stack of little forms. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";
const filterLabel = "flex items-center gap-2 text-[11px] font-bold text-ink-muted";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function thisMonth(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function downloadCsv(path: string) {
  // Authenticated download — fetch with bearer, then trigger browser save.
  api
    .get<string>(path, { responseType: "text" })
    .then((r) => {
      const filename =
        /filename="([^"]+)"/.exec(
          r.headers["content-disposition"] || ""
        )?.[1] ?? "report.csv";
      const blob = new Blob([r.data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => {
      // Fallback: open in a new tab so user can save manually
      window.open(path, "_blank");
    });
}

export default function AttendanceReportsPage() {
  const [tab, setTab] = useState<Tab>("daily");
  // The year comes from the top bar now, so this report follows it.
  const { years, yearId } = useAcademicYear() ?? { years: [], yearId: null };
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!yearId) return;
    api
      .get<SchoolClass[]>("/api/v1/school/classes", {
        params: { academic_year_id: yearId },
      })
      .then((r) => setClasses(r.data))
      .catch((e) => setError(apiError(e)));
  }, [yearId]);

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Attendance reports"
        subtitle="Daily absentees, class-wise breakdown, and per-student monthly %. Export to CSV or use your browser's print dialog for PDF."
      />

      <div className="flex flex-wrap gap-1 rounded-md bg-surface-hover p-1 text-sm">
        {(
          [
            ["daily", "Daily absent"],
            ["class", "Class summary"],
            ["student", "Student monthly"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={
              "rounded-md px-3 py-1.5 font-medium transition " +
              (tab === k
                ? "bg-surface-raised text-brand-700 shadow-sm"
                : "text-ink-muted hover:bg-surface-hover")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}

      {tab === "daily" && <DailyAbsentTab classes={classes} />}
      {tab === "class" && <ClassSummaryTab classes={classes} />}
      {tab === "student" && (
        <StudentMonthlyTab classes={classes} years={years} yearId={yearId} />
      )}
    </div>
  );
}

function DailyAbsentTab({ classes }: { classes: SchoolClass[] }) {
  const [onDate, setOnDate] = useState(todayIso());
  const [classId, setClassId] = useState<number | "">("");
  const [sectionId, setSectionId] = useState<number | "">("");
  const [rows, setRows] = useState<DailyAbsentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId]
  );
  const selectedSection = useMemo(
    () => selectedClass?.sections.find((s) => s.id === sectionId) ?? null,
    [selectedClass, sectionId]
  );

  async function load(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { date: onDate };
      if (sectionId) params.section_id = sectionId;
      else if (classId) params.class_id = classId;
      const { data } = await api.get<DailyAbsentRow[]>(
        "/api/v1/school/reports/attendance/daily-absent",
        { params }
      );
      setRows(data);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function downloadCsvUrl() {
    const qs = new URLSearchParams({ date: onDate });
    if (sectionId) qs.set("section_id", String(sectionId));
    else if (classId) qs.set("class_id", String(classId));
    downloadCsv(`/api/v1/school/reports/attendance/daily-absent.csv?${qs}`);
  }

  return (
    <>
      {/* The register being asked about is chosen first; the figures under it
          only restate that choice. */}
      <form onSubmit={load}>
        <FilterBar>
          <label className={filterLabel}>
            Date *
            <input
              type="date"
              aria-label="Date"
              value={onDate}
              onChange={(e) => setOnDate(e.target.value)}
              max={todayIso()}
              required
              className={filterSelect}
            />
          </label>
          <select
            aria-label="Class"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value ? Number(e.target.value) : "");
              setSectionId("");
            }}
            className={filterSelect}
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Section"
            value={sectionId}
            onChange={(e) =>
              setSectionId(e.target.value ? Number(e.target.value) : "")
            }
            className={filterSelect}
            disabled={!selectedClass}
          >
            <option value="">All sections</option>
            {selectedClass?.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button type="submit" loading={loading}>
            Run
          </Button>
          <Button type="button" variant="secondary" onClick={downloadCsvUrl}>
            Download CSV
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.print()}
          >
            Print
          </Button>
        </FilterBar>
      </form>

      <StatStrip
        stats={[
          {
            label: "Absent on this date",
            value: rows ? rows.length : "—",
            note: rows ? `${rows.length} child(ren) listed` : undefined,
            icon: UserMinus,
          },
          { label: "Date", value: onDate, icon: CalendarDays },
          {
            label: "Class",
            value: selectedClass ? selectedClass.name : "All classes",
            icon: School,
          },
          {
            label: "Section",
            value: selectedSection ? selectedSection.name : "All sections",
            note: selectedClass ? undefined : "Pick a class to narrow further",
            icon: Layers,
          },
        ]}
      />

      {error && (
        <div className="mb-[18px] rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}

      {rows !== null && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Absent on {onDate}</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">
                {selectedClass ? selectedClass.name : "All classes"} ·{" "}
                {selectedSection ? selectedSection.name : "All sections"}
              </p>
            </div>
            <Badge tone="rose">{rows.length} absent</Badge>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border text-[13px]">
              <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                <tr>
                  <th className="px-4 py-3 font-bold">Class</th>
                  <th className="px-4 py-3 font-bold">Sec</th>
                  <th className="px-4 py-3 font-bold">Roll</th>
                  <th className="px-4 py-3 font-bold">Adm #</th>
                  <th className="px-4 py-3 font-bold">Student</th>
                  <th className="px-4 py-3 font-bold">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {rows.map((r) => (
                  <tr key={r.student_id} className="hover:bg-surface-subtle">
                    <td className="px-4 py-3 text-ink-muted">{r.class_name}</td>
                    <td className="px-4 py-3 text-ink-muted">{r.section_name}</td>
                    <td className="px-4 py-3 text-ink-muted">{r.roll_no}</td>
                    <td className="px-4 py-3 font-mono text-ink-muted">{r.admission_no}</td>
                    <td className="px-4 py-3 font-medium text-ink">{r.full_name}</td>
                    <td className="px-4 py-3 text-ink-muted">{r.remark || "—"}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-ink-muted">
                      No absences on this date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <PanelFooter
            left={`Showing ${rows.length} absence(s)`}
            right={onDate}
          />
        </Card>
      )}
    </>
  );
}

function ClassSummaryTab({ classes }: { classes: SchoolClass[] }) {
  const today = todayIso();
  const monthAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();
  const [fromDate, setFromDate] = useState(monthAgo);
  const [toDate, setToDate] = useState(today);
  const [classId, setClassId] = useState<number | "">("");
  const [rows, setRows] = useState<ClassSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId]
  );

  async function load(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = { from: fromDate, to: toDate };
      if (classId) params.class_id = classId;
      const { data } = await api.get<ClassSummaryRow[]>(
        "/api/v1/school/reports/attendance/class-summary",
        { params }
      );
      setRows(data);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function downloadCsvUrl() {
    const qs = new URLSearchParams({ from: fromDate, to: toDate });
    if (classId) qs.set("class_id", String(classId));
    downloadCsv(`/api/v1/school/reports/attendance/class-summary.csv?${qs}`);
  }

  return (
    <>
      <form onSubmit={load}>
        <FilterBar>
          <label className={filterLabel}>
            From *
            <input
              type="date"
              aria-label="From"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              max={toDate}
              required
              className={filterSelect}
            />
          </label>
          <label className={filterLabel}>
            To *
            <input
              type="date"
              aria-label="To"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              min={fromDate}
              max={todayIso()}
              required
              className={filterSelect}
            />
          </label>
          <select
            aria-label="Class"
            value={classId}
            onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : "")}
            className={filterSelect}
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button type="submit" loading={loading}>
            Run
          </Button>
          <Button type="button" variant="secondary" onClick={downloadCsvUrl}>
            Download CSV
          </Button>
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
        </FilterBar>
      </form>

      <StatStrip
        stats={[
          {
            label: "Sections in scope",
            value: rows ? rows.length : "—",
            note: selectedClass ? `Within ${selectedClass.name}` : "Across all classes",
            icon: Users,
          },
          {
            label: "Reporting period",
            value: fromDate,
            note: `to ${toDate}`,
            icon: CalendarRange,
          },
          {
            label: "Class",
            value: selectedClass ? selectedClass.name : "All classes",
            icon: School,
          },
        ]}
      />

      {error && (
        <div className="mb-[18px] rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}

      {rows !== null && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Class summary</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">
                {selectedClass ? selectedClass.name : "All classes"} · {fromDate} to {toDate}
              </p>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border text-[13px]">
              <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                <tr>
                  <th className="px-4 py-3 font-bold">Class</th>
                  <th className="px-4 py-3 font-bold">Sec</th>
                  <th className="px-4 py-3 text-right font-medium">Students</th>
                  <th className="px-4 py-3 text-right font-medium">Days</th>
                  <th className="px-4 py-3 text-right font-medium">Present</th>
                  <th className="px-4 py-3 text-right font-medium">Absent</th>
                  <th className="px-4 py-3 text-right font-medium">Late</th>
                  <th className="px-4 py-3 text-right font-medium">Half</th>
                  <th className="px-4 py-3 text-right font-medium">Att. %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {rows.map((r) => (
                  <tr key={r.section_id} className="hover:bg-surface-subtle">
                    <td className="px-4 py-3 text-ink-muted">{r.class_name}</td>
                    <td className="px-4 py-3 text-ink-muted">{r.section_name}</td>
                    <td className="px-4 py-3 text-right text-ink-muted">
                      {r.distinct_students}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-muted">
                      {r.distinct_days}
                    </td>
                    <td className="px-4 py-3 text-right text-success">{r.present}</td>
                    <td className="px-4 py-3 text-right text-danger">{r.absent}</td>
                    <td className="px-4 py-3 text-right text-warning">{r.late}</td>
                    <td className="px-4 py-3 text-right text-ink-muted">{r.half_day}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">
                      {r.attendance_pct}%
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-6 text-center text-ink-muted"
                    >
                      No attendance recorded in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <PanelFooter
            left={`Showing ${rows.length} section(s)`}
            right={`${fromDate} to ${toDate}`}
          />
        </Card>
      )}
    </>
  );
}

function StudentMonthlyTab({
  classes,
  years,
  yearId,
}: {
  classes: SchoolClass[];
  years: AcademicYear[];
  yearId: number | null;
}) {
  const tm = thisMonth();
  const [classId, setClassId] = useState<number | "">("");
  const [sectionId, setSectionId] = useState<number | "">("");
  const [year, setYear] = useState(tm.year);
  const [month, setMonth] = useState(tm.month);
  const [report, setReport] = useState<StudentMonthlyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId]
  );
  const selectedSection = useMemo(
    () => selectedClass?.sections.find((s) => s.id === sectionId) ?? null,
    [selectedClass, sectionId]
  );

  async function load(e?: FormEvent) {
    e?.preventDefault();
    if (!sectionId) {
      setError("Pick a class and section");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<StudentMonthlyReport>(
        "/api/v1/school/reports/attendance/student-monthly",
        { params: { section_id: sectionId, year, month } }
      );
      setReport(data);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  function downloadCsvUrl() {
    if (!sectionId) return;
    const qs = new URLSearchParams({
      section_id: String(sectionId),
      year: String(year),
      month: String(month),
    });
    downloadCsv(`/api/v1/school/reports/attendance/student-monthly.csv?${qs}`);
  }

  // Silence unused-vars without changing behaviour
  void years;
  void yearId;
  void auth;

  const monthName = new Date(2000, month - 1, 1).toLocaleString("en", { month: "long" });

  return (
    <>
      <form onSubmit={load}>
        <FilterBar>
          <select
            aria-label="Class"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value ? Number(e.target.value) : "");
              setSectionId("");
            }}
            className={filterSelect}
            required
          >
            <option value="">Select class…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Section"
            value={sectionId}
            onChange={(e) =>
              setSectionId(e.target.value ? Number(e.target.value) : "")
            }
            className={filterSelect}
            disabled={!selectedClass}
            required
          >
            <option value="">Select section…</option>
            {selectedClass?.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className={filterLabel}>
            Year *
            <input
              type="number"
              aria-label="Year"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={`${filterSelect} w-24`}
              required
            />
          </label>
          <select
            aria-label="Month"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className={filterSelect}
            required
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleString("en", {
                  month: "long",
                })}
              </option>
            ))}
          </select>
          <Button type="submit" loading={loading}>
            Run
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={downloadCsvUrl}
            disabled={!sectionId}
          >
            Download CSV
          </Button>
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
        </FilterBar>
      </form>

      <StatStrip
        stats={[
          {
            label: "Children in scope",
            value: report ? report.rows.length : "—",
            note:
              report?.section_label ??
              (selectedClass && selectedSection
                ? `${selectedClass.name} ${selectedSection.name}`
                : "No section chosen yet"),
            icon: Users,
          },
          {
            label: "Reporting period",
            value: `${monthName} ${year}`,
            note: report ? `${report.from_date} to ${report.to_date}` : undefined,
            icon: CalendarRange,
          },
          {
            label: "Overall attendance",
            value: report ? `${report.overall_pct}%` : "—",
            note: report
              ? `P ${report.totals.present} · A ${report.totals.absent} · L ${report.totals.late} · H ${report.totals.half_day}`
              : undefined,
            icon: Percent,
          },
          {
            label: "Section",
            value: selectedSection ? selectedSection.name : "—",
            note: selectedClass ? selectedClass.name : "Pick a class first",
            icon: Layers,
          },
        ]}
      />

      {error && (
        <div className="mb-[18px] rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}

      {report && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{report.section_label ?? "Section"}</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">
                {report.from_date} → {report.to_date} · P {report.totals.present} · A{" "}
                {report.totals.absent} · L {report.totals.late} · H {report.totals.half_day}
              </p>
            </div>
            <Badge tone="emerald">overall {report.overall_pct}%</Badge>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border text-[13px]">
              <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                <tr>
                  <th className="px-4 py-3 font-bold">Roll</th>
                  <th className="px-4 py-3 font-bold">Adm #</th>
                  <th className="px-4 py-3 font-bold">Student</th>
                  <th className="px-4 py-3 text-right font-medium">Present</th>
                  <th className="px-4 py-3 text-right font-medium">Absent</th>
                  <th className="px-4 py-3 text-right font-medium">Late</th>
                  <th className="px-4 py-3 text-right font-medium">Half</th>
                  <th className="px-4 py-3 text-right font-medium">Days</th>
                  <th className="px-4 py-3 text-right font-medium">Att. %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {report.rows.map((r) => (
                  <tr key={r.student_id} className="hover:bg-surface-subtle">
                    <td className="px-4 py-3 text-ink-muted">{r.roll_no}</td>
                    <td className="px-4 py-3 font-mono text-ink-muted">
                      {r.admission_no}
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {r.full_name}
                    </td>
                    <td className="px-4 py-3 text-right text-success">
                      {r.present}
                    </td>
                    <td className="px-4 py-3 text-right text-danger">{r.absent}</td>
                    <td className="px-4 py-3 text-right text-warning">{r.late}</td>
                    <td className="px-4 py-3 text-right text-ink-muted">
                      {r.half_day}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-muted">
                      {r.marked_days}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">
                      {r.attendance_pct}%
                    </td>
                  </tr>
                ))}
                {report.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-6 text-center text-ink-muted"
                    >
                      No active students in this section.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <PanelFooter
            left={`Showing ${report.rows.length} child(ren)`}
            right={`Overall ${report.overall_pct}%`}
          />
        </Card>
      )}
    </>
  );
}
