"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { parentRoute } from "@/lib/parentScreens";
import { useApi } from "@/lib/useApi";
import { childPath, ChildScoped, clock, longDate, PmEmpty, PmError, PmLoading, todayIso } from "../home/parts";
import type { AttendanceDay, AttendanceMonth, AttendanceStatus, StudentProfile } from "../home/types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STATUS_LABEL: Record<AttendanceStatus, string> = { present: "Present", absent: "Absent", late: "Late", half_day: "Half day" };
const STATUS_TONE: Record<AttendanceStatus, string> = { present: "good", absent: "bad", late: "warning", half_day: "warning" };

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-09" moved by `by` months. */
function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/**
 * PM-009. The month's register, day by day, with the month's totals. A day
 * opens its record on PM-010.
 */
export function Attendance() {
  return <ChildScoped render={(childId) => <AttendanceFor childId={childId} />} />;
}

function AttendanceFor({ childId }: { childId: number }) {
  const { go } = useParent();
  const router = useRouter();
  const thisMonth = todayIso().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const m = useApi<AttendanceMonth>(childPath(childId, "/attendance/month"), { month });
  const year = useApi<StudentProfile>(childPath(childId, "/profile"));
  const a = year.data?.attendance;

  const [y, mo] = month.split("-").map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  // Monday-first grid: blanks before the 1st.
  const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
  const today = todayIso();
  const marks = new Map((m.data?.days ?? []).map((d) => [d.date, d]));
  const holidays = new Map((m.data?.holidays ?? []).map((h) => [h.date, h.name]));
  const t = m.data?.totals;
  const attended = t ? t.present + t.late + t.half_day : 0;

  function dayClass(iso: string, weekday: number): string {
    const mark = marks.get(iso);
    if (mark) return mark.status === "absent" ? "absent" : "present";
    if (iso > today) return "future";
    if (holidays.has(iso) || weekday === 0 || weekday === 6) return "weekend";
    return "";
  }

  function dayTitle(iso: string): string {
    const mark = marks.get(iso);
    if (mark) return `${STATUS_LABEL[mark.status]}${mark.arrived_at ? ` · arrived ${clock(mark.arrived_at)}` : ""}`;
    if (holidays.has(iso)) return holidays.get(iso)!;
    return iso > today ? "Upcoming" : "Not marked";
  }

  return (
    <>
      <PmError>{m.error}</PmError>
      {!m.data && !m.error ? <PmLoading /> : null}
      {t ? (
        <div className="attendance-summary">
          <div>
            <p>{month === thisMonth ? "This month’s attendance" : `${MONTHS[mo - 1]} attendance`}</p>
            <h1>
              {t.attendance_percent ?? "—"}
              <span>%</span>
            </h1>
            <small>{t.marked ? `${attended} of ${t.marked} marked school days` : "No days marked this month"}</small>
          </div>
          <div className="attendance-mark">
            <span className="v-icon green">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="9" cy="7" r="3" />
                <circle cx="17" cy="8" r="2.5" opacity=".55" />
                <path d="M3 20v-4c0-4 12-4 12 0v4zM16 13c3-1 6 1 6 4v3h-5z" />
              </svg>
            </span>
            <span className={t.absent ? "status amber" : "status"}>{t.absent ? `${t.absent} absent` : t.marked ? "No absences" : "Not marked"}</span>
          </div>
        </div>
      ) : null}
      {m.data ? (
        <div className="calendar approved-calendar">
          <div className="cal-title">
            <b>{`${MONTHS[mo - 1]} ${y}`}</b>
            <span>
              <button type="button" className="quiet-link" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
                ‹
              </button>{" "}
              <button type="button" className="quiet-link" aria-label="Next month" disabled={month >= thisMonth} onClick={() => setMonth(shiftMonth(month, 1))}>
                ›
              </button>
            </span>
          </div>
          <div className="days">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <small key={i}>{d}</small>
            ))}
          </div>
          <div className="dates">
            {Array.from({ length: lead }, (_, i) => (
              <span key={`b${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const iso = `${month}-${pad(day)}`;
              const weekday = new Date(y, mo - 1, day).getDay();
              return (
                <button key={iso} className={dayClass(iso, weekday)} title={dayTitle(iso)} disabled={iso > today} onClick={() => router.push(`${parentRoute(10)}?date=${iso}`)}>
                  {day}
                </button>
              );
            })}
          </div>
          <div className="legend">
            <span className="good">Present</span>
            <span className="bad">Absent</span>
            <span>Weekend / holiday</span>
          </div>
        </div>
      ) : null}
      {a && a.days_marked ? <p className="micro">{`Year so far${year.data?.academic_year_name ? ` (${year.data.academic_year_name})` : ""}: ${a.attendance_percent ?? "—"}% · ${a.days_present} present, ${a.days_late} late, ${a.days_half_day} half day, ${a.days_absent} absent`}</p> : null}
      <button className="action" onClick={() => go(12)}>
        Apply for leave
      </button>
      <button className="action secondary" onClick={() => go(11)}>
        My leave requests
      </button>
    </>
  );
}

/**
 * PM-010. One day's record (?date=, today by default): the register mark,
 * arrival time, who marked it, and lesson-by-lesson attendance where the
 * school takes it.
 */
export function AttendanceDetail() {
  const on = useSearchParams().get("date");
  const day = on && /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : todayIso();
  return <ChildScoped render={(childId) => <DetailFor childId={childId} day={day} />} />;
}

function DetailFor({ childId, day }: { childId: number; day: string }) {
  const { go } = useParent();
  const d = useApi<AttendanceDay>(childPath(childId, "/attendance/day"), { date: day });
  if (d.error) return <PmError>{d.error}</PmError>;
  if (!d.data) return <PmLoading />;
  const r = d.data;
  const [y, m, dd] = day.split("-").map(Number);
  const heading = `${WEEKDAYS[new Date(y, m - 1, dd).getDay()]}, ${longDate(day)}`;

  let tone = "status blue";
  let title = "Not marked";
  let line = "The class teacher has not marked attendance for this day.";
  if (r.status) {
    tone = r.status === "present" ? "status" : "status amber";
    title = r.status === "absent" ? "Marked absent" : r.arrived_at ? `Arrived at ${clock(r.arrived_at)}` : STATUS_LABEL[r.status];
    line = [`School attendance updated by ${r.marked_by_name ?? "the class teacher"}.`, r.left_at ? `Left at ${clock(r.left_at)}.` : null, r.remark].filter(Boolean).join(" ");
  } else if (r.holiday_name) {
    title = r.holiday_name;
    line = "School holiday.";
  } else if (day > todayIso()) {
    line = "This day has not come yet.";
  }

  return (
    <>
      <p className="lead">{heading}</p>
      <div className="panel">
        <span className={tone}>{r.status ? STATUS_LABEL[r.status] : r.holiday_name ? "Holiday" : "Unmarked"}</span>
        <h2>{title}</h2>
        <p>{line}</p>
        {r.on_approved_leave ? <p className="micro">An approved leave request covers this day.</p> : null}
      </div>
      {r.periods.length ? (
        <section className="section">
          <h3>Period attendance</h3>
          {r.periods.map((p) => (
            <div className="item" key={p.period_id}>
              <span>
                <strong>{p.subject_name ?? p.label ?? `Period ${p.period_number}`}</strong>
                <small>{[`${clock(p.start_time, true)}–${clock(p.end_time)}`, p.remark].filter(Boolean).join(" · ")}</small>
              </span>
              <span className={`value ${STATUS_TONE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
            </div>
          ))}
        </section>
      ) : r.status ? (
        <PmEmpty title="No lesson-by-lesson record">The school records attendance for the whole day only.</PmEmpty>
      ) : null}
      <button className="action secondary" onClick={() => go(45)}>
        Report an attendance issue
      </button>
    </>
  );
}
