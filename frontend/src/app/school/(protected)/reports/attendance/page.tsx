"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState<number | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AcademicYear[]>("/api/v1/school/academic-years")
      .then((r) => {
        setYears(r.data);
        const cur = r.data.find((y) => y.is_current) ?? r.data[0];
        if (cur) setYearId(cur.id);
      })
      .catch((e) => setError(apiError(e)));
  }, []);

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
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Attendance reports</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Daily absentees, class-wise breakdown, and per-student monthly %.
          Export to CSV or use your browser&apos;s print dialog for PDF.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-md bg-slate-100 p-1 text-sm">
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
                ? "bg-white text-brand-700 shadow-sm"
                : "text-slate-600 hover:bg-slate-200")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
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
    <Card className="p-5">
      <form onSubmit={load} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Date *</span>
          <input
            type="date"
            value={onDate}
            onChange={(e) => setOnDate(e.target.value)}
            max={todayIso()}
            required
            className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Class</span>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value ? Number(e.target.value) : "");
              setSectionId("");
            }}
            className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="">All</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Section</span>
          <select
            value={sectionId}
            onChange={(e) =>
              setSectionId(e.target.value ? Number(e.target.value) : "")
            }
            className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            disabled={!selectedClass}
          >
            <option value="">All</option>
            {selectedClass?.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
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
      </form>

      {error && (
        <div className="mt-3 rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}

      {rows !== null && (
        <div className="mt-4 overflow-x-auto">
          <div className="mb-2 text-sm text-slate-500">
            <Badge tone="rose">{rows.length} absent</Badge>
          </div>
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
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.student_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{r.class_name}</td>
                  <td className="px-4 py-3 text-slate-700">{r.section_name}</td>
                  <td className="px-4 py-3 text-slate-700">{r.roll_no}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{r.admission_no}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{r.full_name}</td>
                  <td className="px-4 py-3 text-slate-500">{r.remark || "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    No absences on this date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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
    <Card className="p-5">
      <form onSubmit={load} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">From *</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            max={toDate}
            required
            className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">To *</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            min={fromDate}
            max={todayIso()}
            required
            className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Class</span>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="">All</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" loading={loading}>
          Run
        </Button>
        <Button type="button" variant="secondary" onClick={downloadCsvUrl}>
          Download CSV
        </Button>
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          Print
        </Button>
      </form>

      {error && (
        <div className="mt-3 rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}

      {rows !== null && (
        <div className="mt-4 overflow-x-auto">
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
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.section_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{r.class_name}</td>
                  <td className="px-4 py-3 text-slate-700">{r.section_name}</td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {r.distinct_students}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {r.distinct_days}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-700">{r.present}</td>
                  <td className="px-4 py-3 text-right text-rose-700">{r.absent}</td>
                  <td className="px-4 py-3 text-right text-amber-700">{r.late}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{r.half_day}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {r.attendance_pct}%
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    No attendance recorded in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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

  return (
    <Card className="p-5">
      <form onSubmit={load} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Class *</span>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value ? Number(e.target.value) : "");
              setSectionId("");
            }}
            className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            required
          >
            <option value="">Select…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Section *</span>
          <select
            value={sectionId}
            onChange={(e) =>
              setSectionId(e.target.value ? Number(e.target.value) : "")
            }
            className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            disabled={!selectedClass}
            required
          >
            <option value="">Select…</option>
            {selectedClass?.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Year *</span>
          <input
            type="number"
            min={2020}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Month *</span>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
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
        </label>
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
      </form>

      {error && (
        <div className="mt-3 rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}

      {report && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <Badge tone="brand">{report.section_label}</Badge>
            <span>
              {report.from_date} → {report.to_date}
            </span>
            <Badge tone="emerald">overall {report.overall_pct}%</Badge>
            <span className="text-slate-500">
              P {report.totals.present} · A {report.totals.absent} · L{" "}
              {report.totals.late} · H {report.totals.half_day}
            </span>
          </div>
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
              <tbody className="divide-y divide-slate-100">
                {report.rows.map((r) => (
                  <tr key={r.student_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">{r.roll_no}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">
                      {r.admission_no}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {r.full_name}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-700">
                      {r.present}
                    </td>
                    <td className="px-4 py-3 text-right text-rose-700">{r.absent}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{r.late}</td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {r.half_day}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {r.marked_days}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {r.attendance_pct}%
                    </td>
                  </tr>
                ))}
                {report.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-6 text-center text-slate-500"
                    >
                      No active students in this section.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
