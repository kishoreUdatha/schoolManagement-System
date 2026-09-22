"use client";

import { useParent } from "@/components/parent/ParentShell";
import { useApi } from "@/lib/useApi";
import { childPath, ChildScoped, PmEmpty, PmError, PmLoading } from "../home/parts";
import type { AttendanceSummary, StudentProfile } from "../home/types";

const attended = (a: AttendanceSummary) => a.days_present + a.days_late + a.days_half_day;

function useAttendance(childId: number) {
  return useApi<StudentProfile>(childPath(childId, "/profile"));
}

/**
 * PM-009. The child's attendance so far, from the profile's summary.
 * Not wired: the month calendar of present / absent days — the parent API returns totals only, not day-by-day records.
 */
export function Attendance() {
  return <ChildScoped render={(childId) => <AttendanceFor childId={childId} />} />;
}

function AttendanceFor({ childId }: { childId: number }) {
  const { go } = useParent();
  const p = useAttendance(childId);
  const a = p.data?.attendance;

  return (
    <>
      <PmError>{p.error}</PmError>
      {!p.data && !p.error ? <PmLoading /> : null}
      {a ? (
        a.days_marked === 0 ? (
          <PmEmpty title="No attendance marked yet">Attendance appears here once the class teacher starts marking it.</PmEmpty>
        ) : (
          <>
            <div className="attendance-summary">
              <div>
                <p>Attendance so far</p>
                <h1>
                  {a.attendance_percent ?? "—"}
                  <span>%</span>
                </h1>
                <small>{`${attended(a)} of ${a.days_marked} marked school days`}</small>
              </div>
              <div className="attendance-mark">
                <span className="v-icon green">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="9" cy="7" r="3" />
                    <circle cx="17" cy="8" r="2.5" opacity=".55" />
                    <path d="M3 20v-4c0-4 12-4 12 0v4zM16 13c3-1 6 1 6 4v3h-5z" />
                  </svg>
                </span>
                <span className={a.days_absent ? "status amber" : "status"}>{a.days_absent ? `${a.days_absent} absent` : "No absences"}</span>
              </div>
            </div>
            <div className="calendar approved-calendar">
              <div className="cal-title">
                <b>Marked days</b>
                <span>{p.data?.academic_year_name ?? ""}</span>
              </div>
              <div className="item">
                <span>
                  <strong>Present</strong>
                </span>
                <span className="value good">{a.days_present}</span>
              </div>
              <div className="item">
                <span>
                  <strong>Late</strong>
                </span>
                <span className="value warning">{a.days_late}</span>
              </div>
              <div className="item">
                <span>
                  <strong>Half day</strong>
                </span>
                <span className="value warning">{a.days_half_day}</span>
              </div>
              <div className="item">
                <span>
                  <strong>Absent</strong>
                </span>
                <span className="value bad">{a.days_absent}</span>
              </div>
              <button className="action secondary" onClick={() => go(10)}>
                How this is worked out
              </button>
            </div>
          </>
        )
      ) : null}
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
 * PM-010. The breakdown behind the attendance figure.
 * Not wired: a single day's record and period-by-period attendance — no parent endpoint for daily or period attendance.
 */
export function AttendanceDetail() {
  return <ChildScoped render={(childId, child) => <DetailFor childId={childId} name={child.full_name.split(/\s+/)[0]} />} />;
}

function DetailFor({ childId, name }: { childId: number; name: string }) {
  const { go } = useParent();
  const p = useAttendance(childId);
  if (p.error) return <PmError>{p.error}</PmError>;
  if (!p.data) return <PmLoading />;
  const a = p.data.attendance;
  const share = (n: number) => (a.days_marked ? `${Math.round((n / a.days_marked) * 100)}%` : "—");

  return (
    <>
      <p className="lead">{`${name}’s attendance${p.data.academic_year_name ? ` · ${p.data.academic_year_name}` : ""}`}</p>
      <div className="panel">
        <span className={a.days_absent ? "status amber" : "status"}>{a.attendance_percent === null ? "Not marked yet" : `${a.attendance_percent}% attended`}</span>
        <h2>{`${a.days_marked} school days marked`}</h2>
        <p>Late days count as attended; a half day counts as half. Attendance is recorded by the class teacher.</p>
      </div>
      <section className="section">
        <h3>Breakdown</h3>
        {(
          [
            ["Present", a.days_present, "good"],
            ["Late", a.days_late, "warning"],
            ["Half day", a.days_half_day, "warning"],
            ["Absent", a.days_absent, "bad"],
          ] as const
        ).map(([label, n, tone]) => (
          <div className="item" key={label}>
            <span>
              <strong>{label}</strong>
              <small>{`${n} ${n === 1 ? "day" : "days"} · ${share(n)} of marked days`}</small>
            </span>
            <span className={`value ${tone}`}>{n}</span>
          </div>
        ))}
      </section>
      <p className="micro">Day-by-day records are not available in the parent app yet.</p>
      <button className="action secondary" onClick={() => go(45)}>
        Report an attendance issue
      </button>
    </>
  );
}
