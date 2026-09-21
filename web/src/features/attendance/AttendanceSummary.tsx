"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { errorText } from "@/lib/api";
import { date, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { addDays, downloadCsv, monthName, usePageAction, useSchoolDay } from "./shared";
import { EV, type AcademicYear, type ClassSummaryRow, type DailyAbsentRow, type SchoolClass } from "./types";

type Group = { key: string; label: string; students: number; days: number; present: number; absent: number; marks: number; pct: number | null };

/** Server's percentage, re-weighted by register marks when rows are merged. */
function merge(key: string, label: string, rows: ClassSummaryRow[]): Group {
  const marks = rows.reduce((n, r) => n + r.total_marks, 0);
  const weighted = rows.reduce((n, r) => n + (r.attendance_pct ?? 0) * r.total_marks, 0);
  return {
    key,
    label,
    students: rows.reduce((n, r) => n + r.distinct_students, 0),
    days: rows.reduce((n, r) => Math.max(n, r.distinct_days), 0),
    present: rows.reduce((n, r) => n + r.present, 0),
    absent: rows.reduce((n, r) => n + r.absent, 0),
    marks,
    pct: marks ? weighted / marks : null,
  };
}

/** The share of sections in each band, for the "Summary" bars. */
function bands(rows: ClassSummaryRow[]) {
  const n = rows.length || 1;
  const count = (f: (p: number) => boolean) => Math.round((rows.filter((r) => f(r.attendance_pct ?? 0)).length / n) * 100);
  return [
    ["At 90% or above", rows.length ? count((p) => p >= 90) : 0],
    ["75% to 90%", rows.length ? count((p) => p >= 75 && p < 90) : 0],
    ["Below 75%", rows.length ? count((p) => p < 75) : 0],
  ] as const;
}

function ByClassBars({ groups }: { groups: Group[] }) {
  if (!groups.length) return <p className="muted">No attendance was marked in this period.</p>;
  return (
    <div className="bar-list">
      {groups.map((g) => (
        <div key={g.key}>
          <span>{g.label}</span>
          <div className="bar-track">
            <i style={{ width: `${g.pct ?? 0}%` }} />
          </div>
          <strong>{pct(g.pct)}</strong>
        </div>
      ))}
    </div>
  );
}

/**
 * SCR-117 Monthly Attendance Summary (by class, one month) and SCR-119
 * Attendance Reports (by section, any range, with today's absentees).
 * GET /school/reports/attendance/class-summary (+ .csv), /daily-absent,
 * /school/academic-years, /school/classes.
 */
export function AttendanceSummary({ mode }: { mode: "monthly" | "report" }) {
  const monthly = mode === "monthly";
  const today = useSchoolDay();
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const year = years.data?.find((y) => y.is_current) ?? years.data?.[0];
  const classes = useApi<SchoolClass[]>(year ? "/api/v1/school/classes" : null, { academic_year_id: year?.id });
  const [classId, setClassId] = useState("");
  const [month, setMonth] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);

  useEffect(() => {
    if (!today || month !== null) return;
    setMonth(today.slice(0, 7));
    setFrom(`${today.slice(0, 7)}-01`);
    setTo(today);
  }, [today, month]);

  // Monthly: the whole month, or up to today while it is still running.
  const range = useMemo(() => {
    if (!monthly) return from && to ? { from, to } : null;
    if (!month || !today) return null;
    const [y, m] = month.split("-").map(Number);
    const end = addDays(`${month}-01`, new Date(Date.UTC(y, m, 0)).getUTCDate() - 1);
    return { from: `${month}-01`, to: end < today ? end : today };
  }, [monthly, month, from, to, today]);

  const summary = useApi<ClassSummaryRow[]>(range ? "/api/v1/school/reports/attendance/class-summary" : null, { ...range, class_id: classId });
  const absent = useApi<DailyAbsentRow[]>(!monthly && today ? "/api/v1/school/reports/attendance/daily-absent" : null, { date: today, class_id: classId });
  const rowsIn = summary.data ?? [];

  const groups: Group[] = useMemo(() => {
    if (!monthly) return rowsIn.map((r) => merge(String(r.section_id), `${r.class_name} ${r.section_name}`, [r]));
    const byClass = new Map<number, ClassSummaryRow[]>();
    rowsIn.forEach((r) => byClass.set(r.class_id, [...(byClass.get(r.class_id) ?? []), r]));
    return [...byClass.values()].map((rs) => merge(String(rs[0].class_id), rs[0].class_name, rs));
  }, [rowsIn, monthly]);
  const overall = merge("all", "All", rowsIn);

  // A principal cannot list classes (/school/classes is admin-only), so the
  // class filter falls back to the classes the unfiltered report contains.
  const [seen, setSeen] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    if (!classId && summary.data) setSeen([...new Map(summary.data.map((r) => [r.class_id, { id: r.class_id, name: r.class_name }])).values()]);
  }, [summary.data, classId]);
  const classOptions = classes.data?.map((c) => ({ id: c.id, name: c.name })) ?? seen;

  const [error, setError] = useState<string | null>(null);
  const exportCsv = async () => {
    if (!range) return;
    try {
      await downloadCsv("/api/v1/school/reports/attendance/class-summary.csv", { ...range, class_id: classId }, `attendance-${range.from}-to-${range.to}.csv`);
    } catch (e) {
      setError(errorText(e));
    }
  };
  usePageAction(monthly ? EV.exportMonthly : EV.exportReport, exportCsv);

  if (!range) return <Loading what="Loading the report…" />;
  const [my, mm] = (month ?? "0-0").split("-").map(Number);
  const period = `${date(range.from)} – ${date(range.to)}`;

  const stats = monthly
    ? [
        { label: "Register marks", value: overall.marks.toLocaleString("en-IN"), note: "Student-days marked" },
        { label: "Academic year", value: year?.name ?? "—", note: year?.is_current ? "Current year" : "Academic year" },
        { label: "Reporting period", value: monthName(mm), note: period },
        { label: "Attendance", value: pct(overall.pct), note: `Across ${groups.length} classes` },
      ]
    : [
        { label: "Register marks", value: overall.marks.toLocaleString("en-IN"), note: "Student-days marked" },
        { label: "Attendance", value: pct(overall.pct), note: `Across ${groups.length} sections` },
        { label: "Absences", value: overall.absent.toLocaleString("en-IN"), note: period },
        { label: "Absent today", value: absent.data ? String(absent.data.length) : "…", note: today ? date(today) : "Today" },
      ];

  const table: Row[] = monthly
    ? groups.map((g) => [g.label, String(g.students), String(g.days), g.present.toLocaleString("en-IN"), g.absent.toLocaleString("en-IN"), pct(g.pct)])
    : rowsIn.map((r) => [r.class_name, r.section_name, String(r.distinct_students), r.present.toLocaleString("en-IN"), r.absent.toLocaleString("en-IN"), pct(r.attendance_pct)]);

  return (
    <>
      <div className="filterbar">
        <select aria-label="Filter by class" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {monthly ? (
          <input type="month" className="select-plain" aria-label="Month" value={month ?? ""} max={today?.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        ) : (
          <>
            <input type="date" className="select-plain" aria-label="From" value={from ?? ""} max={to ?? undefined} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            <input type="date" className="select-plain" aria-label="To" value={to ?? ""} min={from ?? undefined} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </>
        )}
      </div>
      <ErrorNote>{error ?? years.error ?? summary.error ?? absent.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <div className="two-col" style={{ marginBottom: "20px" }}>
        <div>
          <Panel title={monthly ? "Overview by class" : "Overview by section"} sub={`${monthly ? `${monthName(mm)} ${my}` : period}${summary.loading ? " · Loading…" : ""}`}>
            <ByClassBars groups={groups} />
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Report scope">
            <dl className="kv">
              <div>
                <dt>Academic year</dt>
                <dd>{year?.name ?? "—"}</dd>
              </div>
              <div>
                <dt>Class</dt>
                <dd>{classId ? (classOptions.find((c) => String(c.id) === classId)?.name ?? "—") : "All classes"}</dd>
              </div>
              <div>
                <dt>Date range</dt>
                <dd>{period}</dd>
              </div>
              <div>
                <dt>Group by</dt>
                <dd>{monthly ? "Class" : "Class & section"}</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Summary" sub="Share of sections">
            <div className="bar-list">
              {bands(rowsIn).map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <div className="bar-track">
                    <i style={{ width: `${v}%` }} />
                  </div>
                  <strong>{`${v}%`}</strong>
                </div>
              ))}
            </div>
          </Panel>
          {!monthly && absent.data?.length ? (
            <Panel title="Absent today" sub={today ? date(today) : undefined}>
              {absent.data.slice(0, 8).map((a) => (
                <div className="timeline-item" key={a.student_id}>
                  <span className="timeline-dot">
                    <Icon name="users" />
                  </span>
                  <div>
                    <h4>{a.full_name}</h4>
                    <p>{`${a.class_name} ${a.section_name} · ${a.admission_no}${a.remark ? ` · ${a.remark}` : ""}`}</p>
                  </div>
                </div>
              ))}
            </Panel>
          ) : null}
        </aside>
      </div>
      <Panel
        title="Detailed breakdown"
        sub="Results for the selected filters"
        action={
          <button type="button" className="btn" onClick={exportCsv}>
            <Icon name="download" className="sm" />
            CSV
          </button>
        }
        flush
      >
        <DataTable
          columns={monthly ? ["Class", "Students", "Working days", "Present", "Absent", "Attendance"] : ["Class", "Section", "Students", "Present", "Absent", "Attendance"]}
          rows={table}
          selectable={false}
          rowAction={false}
          empty={summary.loading ? "Loading…" : "No attendance was marked in this period."}
        />
      </Panel>
    </>
  );
}
