"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { initials, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { downloadCsv, monthName, usePageAction, useSchoolDay, weekday } from "./shared";
import { EV, type AcademicYear, type SchoolClass, type SchoolProfile, type Status, type StudentHistory, type StudentMonthly } from "./types";

const TONES = ["mint", "", "peach", "lilac"];
const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const SYMBOL: Record<Status, [string, string]> = { present: ["P", ""], absent: ["A", "absent"], late: ["L", "leave"], half_day: ["H", "leave"] };

/**
 * SCR-112, live: a section's month as a register grid.
 * GET /school/reports/attendance/student-monthly (roster and percentages),
 * GET /school/reports/attendance/students/{id}?from&to for each child's days,
 * GET /school/profile for the working week; export is student-monthly.csv.
 */
export function AttendanceRegister() {
  const schoolDay = useSchoolDay();
  const isAdmin = useSession()?.user.role === "school_admin";
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const yearId = (years.data?.find((y) => y.is_current) ?? years.data?.[0])?.id;
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const profile = useApi<SchoolProfile>(isAdmin ? "/api/v1/school/profile" : null);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [month, setMonth] = useState<string | null>(null); // "2026-09"

  const sections = useMemo(() => classes.data?.flatMap((c) => c.sections.map((s) => ({ id: s.id, label: `${c.name} ${s.name}` }))) ?? [], [classes.data]);
  useEffect(() => {
    if (sectionId === null && sections.length) setSectionId(sections[0].id);
  }, [sections, sectionId]);
  useEffect(() => {
    if (month === null && schoolDay) setMonth(schoolDay.slice(0, 7));
  }, [schoolDay, month]);

  const [y, m] = (month ?? "0-0").split("-").map(Number);
  const summary = useApi<StudentMonthly>(sectionId && month ? "/api/v1/school/reports/attendance/student-monthly" : null, { section_id: sectionId, year: y, month: m });

  // Each child's days for the month, fetched together once the roster is in.
  const [days, setDays] = useState<Record<number, Record<string, Status>>>({});
  const [daysError, setDaysError] = useState<string | null>(null);
  useEffect(() => {
    const s = summary.data;
    if (!s) return;
    let live = true;
    Promise.all(s.rows.map((r) => api.get<StudentHistory>(`/api/v1/school/reports/attendance/students/${r.student_id}`, { from: s.from_date, to: s.to_date })))
      .then((all) => {
        if (!live) return;
        setDays(Object.fromEntries(all.map((h) => [h.student_id, Object.fromEntries(h.days.map((d) => [d.date, d.status]))])));
        setDaysError(null);
      })
      .catch((e) => live && setDaysError(errorText(e)));
    return () => {
      live = false;
    };
  }, [summary.data]);

  const [exporting, setExporting] = useState(false);
  usePageAction(EV.exportRegister, async () => {
    if (!sectionId || !month) return;
    setExporting(true);
    try {
      await downloadCsv("/api/v1/school/reports/attendance/student-monthly.csv", { section_id: sectionId, year: y, month: m }, `attendance-register-${month}.csv`);
    } catch (e) {
      setDaysError(errorText(e));
    } finally {
      setExporting(false);
    }
  });

  if (!month) return <Loading what="Loading the register…" />;

  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // A month still running stops at today; there is nothing to show after it.
  const upTo = schoolDay && schoolDay.slice(0, 7) === month ? Number(schoolDay.slice(8, 10)) : last;
  const dates = Array.from({ length: Math.max(0, upTo) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const working = (profile.data?.working_days ?? "MON,TUE,WED,THU,FRI,SAT").split(",").map((d) => d.trim().toUpperCase());
  const isWorking = (d: string) => working.includes(DOW[weekday(d) - 1]);
  const s = summary.data;
  const label = sections.find((x) => x.id === sectionId)?.label ?? s?.section_label ?? "";

  return (
    <>
      <div className="filterbar">
        <select aria-label="Section" value={sectionId ?? ""} onChange={(e) => setSectionId(Number(e.target.value))}>
          {!sections.length ? <option value="">{classes.loading ? "Loading classes…" : "No classes"}</option> : null}
          {sections.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        <input type="month" className="select-plain" aria-label="Register month" value={month} max={schoolDay?.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        {exporting ? <span className="muted">Preparing the CSV…</span> : null}
      </div>
      <ErrorNote>{years.error ?? classes.error ?? summary.error ?? daysError}</ErrorNote>
      <Panel title={`${monthName(m)} attendance register`} sub={`${label} · ${monthName(m)} ${y}${summary.loading ? " · Loading…" : ""}`} flush>
        <div className="table-wrap">
          <table className="data-table matrix">
            <thead>
              <tr>
                <th>Student</th>
                {dates.map((d) => (
                  <th key={d}>{d.slice(8, 10)}</th>
                ))}
                <th>Attendance</th>
              </tr>
            </thead>
            <tbody>
              {s?.rows.map((r, i) => (
                <tr key={r.student_id}>
                  <td>
                    <div className="person">
                      <span className={`avatar ${TONES[i % 4]}`}>{initials(r.full_name)}</span>
                      <div>{r.full_name}</div>
                    </div>
                  </td>
                  {dates.map((d) => {
                    const st = days[r.student_id]?.[d];
                    if (st) {
                      const [sym, cls] = SYMBOL[st];
                      return (
                        <td key={d}>
                          <span className={`matrix-symbol ${cls}`}>{sym}</span>
                        </td>
                      );
                    }
                    return (
                      <td key={d}>
                        <span className="matrix-symbol weekend">{isWorking(d) ? "·" : "–"}</span>
                      </td>
                    );
                  })}
                  <td>{pct(r.attendance_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={Boolean(s?.rows.length) || summary.loading}>
          No students in this section for the month.
        </div>
      </Panel>
      <div className="gap" />
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>P = Present · A = Absent · L = Late · H = Half day · · = Not marked · – = Weekly off. The register follows school working days.</span>
      </div>
    </>
  );
}
