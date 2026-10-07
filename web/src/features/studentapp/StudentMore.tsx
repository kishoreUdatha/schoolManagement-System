"use client";

/*
 * The student app's "More" pages: online tests (the parent app's test pages,
 * fed from /student), notices, attendance by month, library books and study
 * material. Every call is /api/v1/student/…: the child comes from the token.
 */

import { useState, type ReactNode } from "react";
import { useStudentApp } from "@/components/studentapp/StudentShell";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { studentRoute } from "@/lib/studentScreens";
import { useApi } from "@/lib/useApi";
import { OnlineTestList, OnlineTestPage, TestHost } from "@/features/parent/learning/OnlineTests";
import { dayLabel, PmEmpty, PmError, PmLoading, todayIso } from "@/features/teacherapp/parts";

const BASE = "/api/v1/student";

// ---------- online tests ----------

function StudentTestHost({ children }: { children: ReactNode }) {
  const { go } = useStudentApp();
  return (
    <TestHost.Provider
      value={{
        list: `${BASE}/tests`,
        start: (id) => `${BASE}/tests/${id}/start`,
        attempt: (a) => `${BASE}/test-attempts/${a}`,
        paperRoute: (a) => `${studentRoute(12)}?attempt=${a}`,
        back: () => go(11),
        whose: "your",
      }}
    >
      {children}
    </TestHost.Provider>
  );
}

export function StudentTests() {
  return (
    <StudentTestHost>
      <OnlineTestList />
    </StudentTestHost>
  );
}

export function StudentTest() {
  return (
    <StudentTestHost>
      <OnlineTestPage />
    </StudentTestHost>
  );
}

// ---------- notices ----------

type Notice = { id: number; title: string; body: string; category: string; sent_at: string | null; event_date: string | null; event_venue: string | null; link: string | null };

export function StudentNotices() {
  const r = useApi<Notice[]>(`${BASE}/notices`);
  const [open, setOpen] = useState<number | null>(null);
  if (r.loading && !r.data) return <PmLoading />;
  const list = r.data ?? [];
  return (
    <>
      <PmError>{r.error}</PmError>
      {list.map((n) => (
        <button key={n.id} className="item" style={{ alignItems: "flex-start" }} onClick={() => setOpen(open === n.id ? null : n.id)}>
          <span>
            <strong>{n.title}</strong>
            <small>
              {[n.sent_at ? dateTime(n.sent_at) : null, n.event_date ? `On ${dayLabel(n.event_date)}${n.event_venue ? ` · ${n.event_venue}` : ""}` : null].filter(Boolean).join(" · ")}
            </small>
            {open === n.id ? <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{n.body}</p> : null}
          </span>
          <span className="value">{n.category === "general" ? "" : n.category[0].toUpperCase() + n.category.slice(1)}</span>
        </button>
      ))}
      {!list.length && !r.error ? <PmEmpty title="No notices">Notices from school to your class appear here.</PmEmpty> : null}
    </>
  );
}

// ---------- attendance ----------

type Day = { date: string; status: "present" | "absent" | "late" | "half_day"; arrived_at?: string | null };
type Month = { month: string; days: Day[]; holidays: { date: string; name: string }[]; totals: { present: number; absent: number; late: number; half_day: number; marked: number; attendance_percent: number | null } };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LABEL: Record<Day["status"], string> = { present: "Present", absent: "Absent", late: "Late", half_day: "Half day" };
const pad = (n: number) => String(n).padStart(2, "0");
const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export function StudentAttendance() {
  const thisMonth = todayIso().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const r = useApi<Month>(`${BASE}/attendance/month`, { month });
  const [y, mo] = month.split("-").map(Number);
  const days = new Date(y, mo, 0).getDate();
  const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
  const today = todayIso();
  const marks = new Map((r.data?.days ?? []).map((d) => [d.date, d]));
  const holidays = new Map((r.data?.holidays ?? []).map((h) => [h.date, h.name]));
  const t = r.data?.totals;
  const cls = (iso: string, wd: number) => {
    const m = marks.get(iso);
    if (m) return m.status === "absent" ? "absent" : "present";
    if (iso > today) return "future";
    return holidays.has(iso) || wd === 0 || wd === 6 ? "weekend" : "";
  };
  const absences = (r.data?.days ?? []).filter((d) => d.status !== "present");
  return (
    <>
      <PmError>{r.error}</PmError>
      {!r.data && !r.error ? <PmLoading /> : null}
      {t ? (
        <div className="attendance-summary">
          <div>
            <p>{month === thisMonth ? "This month" : `${MONTHS[mo - 1]} ${y}`}</p>
            <h1>
              {t.attendance_percent ?? "—"}
              <span>%</span>
            </h1>
            <small>{t.marked ? `${t.present + t.late + t.half_day} of ${t.marked} school days` : "No days marked this month"}</small>
          </div>
          <div className="attendance-mark">
            <span className={t.absent ? "status amber" : "status"}>{t.absent ? `${t.absent} absent` : t.marked ? "No absences" : "Not marked"}</span>
          </div>
        </div>
      ) : null}
      {r.data ? (
        <div className="calendar approved-calendar">
          <div className="cal-title">
            <b>{`${MONTHS[mo - 1]} ${y}`}</b>
            <span>
              <button type="button" className="quiet-link" aria-label="Previous month" onClick={() => setMonth(shift(month, -1))}>
                ‹
              </button>{" "}
              <button type="button" className="quiet-link" aria-label="Next month" disabled={month >= thisMonth} onClick={() => setMonth(shift(month, 1))}>
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
            {Array.from({ length: days }, (_, i) => {
              const iso = `${month}-${pad(i + 1)}`;
              const m = marks.get(iso);
              return (
                <span key={iso} className={cls(iso, new Date(y, mo - 1, i + 1).getDay())} title={m ? LABEL[m.status] : holidays.get(iso) ?? ""}>
                  {i + 1}
                </span>
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
      {absences.map((d) => (
        <div key={d.date} className="item">
          <span>
            <strong>{dayLabel(d.date)}</strong>
          </span>
          <span className={d.status === "absent" ? "value bad" : "value warning"}>{LABEL[d.status]}</span>
        </div>
      ))}
    </>
  );
}

// ---------- library ----------

type Loan = { id: number; title: string; accession_no: string; issued_on: string; due_on: string; returned_on: string | null; lost_on: string | null; overdue_days: number; accruing_fine: string };

export function StudentLibrary() {
  const r = useApi<Loan[]>(`${BASE}/library`);
  if (r.loading && !r.data) return <PmLoading />;
  const all = r.data ?? [];
  const now = all.filter((l) => !l.returned_on && !l.lost_on);
  const past = all.filter((l) => l.returned_on || l.lost_on).slice(0, 20);
  return (
    <>
      <PmError>{r.error}</PmError>
      {now.length ? <h3 className="section-head">With you now</h3> : null}
      {now.map((l) => (
        <div key={l.id} className="item">
          <span>
            <strong>{l.title}</strong>
            <small>{`Borrowed ${dayLabel(l.issued_on)} · ${l.accession_no}`}</small>
          </span>
          <span className={l.overdue_days ? "value bad" : "value"}>{l.overdue_days ? `${l.overdue_days} days late` : `Due ${dayLabel(l.due_on)}`}</span>
        </div>
      ))}
      {!now.length && !r.error ? <PmEmpty title="No books with you">Books you borrow from the school library appear here, with the date to return them.</PmEmpty> : null}
      {past.length ? <h3 className="section-head">Returned</h3> : null}
      {past.map((l) => (
        <div key={l.id} className="item">
          <span>
            <strong>{l.title}</strong>
            <small>{l.returned_on ? `Returned ${dayLabel(l.returned_on)}` : "Reported lost"}</small>
          </span>
        </div>
      ))}
    </>
  );
}

// ---------- study material ----------

type Resource = { id: number; title: string; description: string | null; subject_name: string | null; kind: string | null; url: string | null; has_file: boolean; file_name: string | null; created_at: string };

export function StudentResources() {
  const r = useApi<Resource[]>(`${BASE}/resources`);
  const [subject, setSubject] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (r.loading && !r.data) return <PmLoading />;
  const all = r.data ?? [];
  const subjects = Array.from(new Set(all.map((x) => x.subject_name).filter((s): s is string => Boolean(s)))).sort();
  const shown = all.filter((x) => !subject || x.subject_name === subject);

  function open(x: Resource) {
    setErr(null);
    if (x.has_file) {
      const path = `${BASE}/resources/${x.id}/file`;
      const run = x.file_name && !x.file_name.toLowerCase().endsWith(".pdf") ? api.download(path, x.file_name) : api.open(path);
      run.catch((e) => setErr(errorText(e)));
    } else if (x.url) {
      window.open(x.url, "_blank", "noopener");
    }
  }

  return (
    <>
      {subjects.length > 1 ? (
        <label className="field">
          Subject
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      ) : null}
      <PmError>{err || r.error}</PmError>
      {shown.map((x) => (
        <button key={x.id} className="item" onClick={() => open(x)} disabled={!x.has_file && !x.url}>
          <span>
            <strong>{x.title}</strong>
            <small>{[x.subject_name, x.description].filter(Boolean).join(" · ")}</small>
          </span>
          <span className="value">{x.has_file ? "Open" : x.url ? "Link" : ""}</span>
        </button>
      ))}
      {!all.length && !r.error ? <PmEmpty title="No study material yet">Notes, worksheets and links your teachers share appear here.</PmEmpty> : null}
    </>
  );
}
