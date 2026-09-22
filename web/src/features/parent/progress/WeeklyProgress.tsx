"use client";

/*
 * PM-055 · Weekly progress. Weekly reports the class teacher has shared
 * with parents (GET …/weekly-reports, latest first): the teacher's note,
 * attendance, homework, marks and behaviour for the chosen week.
 */

import { useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { date, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading, useChildPath } from "../support/pm";

type Report = {
  id: number;
  week_start: string;
  week_end: string;
  attendance_marked: number;
  attendance_present: number;
  attendance_absent: number;
  attendance_late: number;
  attendance_pct: number;
  homework_total: number;
  homework_submitted: number;
  homework_submission_pct: number;
  marks_summary: { papers: number; avg_pct: number; pass_rate_pct: number } | null;
  behaviour_avg: number | null;
  teacher_remark: string | null;
  generated_by_name: string | null;
  shared_at: string | null;
};

export function WeeklyProgress() {
  return (
    <ChildGate>
      <Weekly />
    </ChildGate>
  );
}

function Weekly() {
  const { go } = useParent();
  const reports = useApi<Report[]>(useChildPath("/weekly-reports"), { limit: 12 });
  const [pick, setPick] = useState<number | null>(null);

  if (reports.loading && !reports.data) return <PmLoading />;
  if (!reports.data) return <PmError>{reports.error}</PmError>;
  const shared = reports.data.filter((r) => r.shared_at);
  if (shared.length === 0) {
    return (
      <>
        <PmEmpty title="No weekly reports yet">Weekly progress reports appear here once the class teacher shares them.</PmEmpty>
        <button className="action secondary" onClick={() => go(45)}>
          Message class teacher
        </button>
      </>
    );
  }
  const r = shared.find((x) => x.id === pick) ?? shared[0];

  return (
    <>
      <label className="field">
        Week
        <select value={r.id} onChange={(e) => setPick(Number(e.target.value))}>
          {shared.map((x) => (
            <option key={x.id} value={x.id}>
              {date(x.week_start)} – {date(x.week_end)}
            </option>
          ))}
        </select>
      </label>
      <div className="panel soft">
        <span className="eyebrow">CLASS TEACHER’S NOTE</span>
        <p>{r.teacher_remark ?? "No note this week."}</p>
        {r.generated_by_name ? <small>{r.generated_by_name}</small> : null}
      </div>
      <div className="item">
        <span>
          <strong>Attendance</strong>
          <small>
            {r.attendance_present} present of {r.attendance_marked} marked
            {r.attendance_late ? ` · ${r.attendance_late} late` : ""}
            {r.attendance_absent ? ` · ${r.attendance_absent} absent` : ""}
          </small>
        </span>
        <span className={r.attendance_absent > 0 ? "value warning" : "value good"}>{pct(r.attendance_pct, 0)}</span>
      </div>
      <button className="item" onClick={() => go(14)}>
        <span>
          <strong>Homework</strong>
          <small>{r.homework_total ? `${r.homework_submitted} of ${r.homework_total} submitted` : "No homework set this week"}</small>
        </span>
        <span className={r.homework_total && r.homework_submitted < r.homework_total ? "value warning" : "value good"}>
          {r.homework_total ? pct(r.homework_submission_pct, 0) : "—"}
        </span>
      </button>
      {r.marks_summary ? (
        <button className="item" onClick={() => go(21)}>
          <span>
            <strong>Tests this week</strong>
            <small>
              {r.marks_summary.papers} paper{r.marks_summary.papers === 1 ? "" : "s"} · {pct(r.marks_summary.pass_rate_pct, 0)} passed
            </small>
          </span>
          <span className="value">{pct(r.marks_summary.avg_pct, 0)} avg</span>
        </button>
      ) : null}
      {r.behaviour_avg !== null ? (
        <button className="item" onClick={() => go(57)}>
          <span>
            <strong>Behaviour</strong>
            <small>Latest teacher rating</small>
          </span>
          <span className="value">{r.behaviour_avg.toFixed(1)} / 5</span>
        </button>
      ) : null}
      {/* Not wired: per-subject topics and "On track / Practice" labels — the weekly report has no subject breakdown. */}
      <button className="action secondary" onClick={() => go(45)}>
        Message class teacher
      </button>
    </>
  );
}
