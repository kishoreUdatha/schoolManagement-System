"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useStudentApp } from "@/components/studentapp/StudentShell";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { dayLabel, greeting, hhmm, plural, PmEmpty, PmError, PmLoading, todayIso } from "@/features/teacherapp/parts";

// ---------- types (the /api/v1/student portal) ----------

type Profile = {
  student_id: number;
  full_name: string;
  admission_no: string;
  roll_no: number | null;
  class_name: string | null;
  section_name: string | null;
  school_name: string;
};
type Dashboard = Profile & {
  homework: { homework_id: number; title: string; subject_name: string | null; due_date: string; overdue: boolean; submitted: boolean }[];
  homework_due: number;
  homework_overdue: number;
  timetable: { period_number: number; label: string | null; start_time: string; end_time: string; is_break: boolean; subject_name: string | null; teacher_name: string | null }[];
  attendance: { marked_days: number; present: number; absent: number; half_day: number; percent: number };
  recent_exams: { exam_id: number; name: string; end_date: string }[];
  notices: { notice_id: number; title: string; body: string | null; created_at: string }[];
  learning_streak: { count: number; on_time: number; set: number } | null;
};
type Homework = {
  id: number;
  title: string;
  description: string;
  due_date: string;
  subject_name: string | null;
  created_by_name: string | null;
  is_past_due: boolean;
  is_closed: boolean;
  max_marks: number | null;
  attachments: { id: number; file_name: string }[];
};
type Submission = {
  id: number;
  comment: string | null;
  submitted_at: string;
  status: string;
  marks: number | null;
  teacher_remark: string | null;
  files: { id: number; file_name: string }[];
};
type Summary = { total_max: number; total_obtained: number; percentage: number; overall_grade: string; is_pass: boolean; subjects_pending: number };
type ExamListItem = { exam_id: number; exam_name: string; end_date: string; published_at: string | null; summary: Summary; parent_note: string | null };
type ExamResult = {
  exam_name: string;
  end_date: string;
  subjects: { exam_paper_id: number; subject_name: string; max_marks: number; status: string | null; marks_obtained: number | null; grade: string | null; is_pass: boolean | null; remark: string | null }[];
  summary: Summary;
  rank: number | null;
  class_size: number | null;
  teacher_remark: string | null;
  principal_remark: string | null;
};
type Week = {
  section_label: string | null;
  periods: { id: number; day_of_week: number; period_number: number; start_time: string; end_time: string; label: string | null; is_break: boolean }[];
  entries: { period_id: number; subject_name: string; teacher_name: string | null; room_name: string | null }[];
};
type CalItem = { type: string; id: number; title: string; start_date: string; end_date: string; detail: string | null; is_cancelled: boolean };

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ---------- SM-002 Home ----------

export function StudentHome() {
  const { go } = useStudentApp();
  const me = useSession()?.user;
  const d = useApi<Dashboard>("/api/v1/student/dashboard");
  if (d.loading && !d.data) return <PmLoading />;
  if (d.error) return <PmError>{d.error}</PmError>;
  const x = d.data!;
  const lessons = x.timetable.filter((p) => !p.is_break && p.subject_name);
  return (
    <>
      <div className="v-greeting">
        <p>
          {`${greeting()}${me ? `, ${x.full_name.split(/\s+/)[0]}` : ""} `}
          <span>{dayLabel(todayIso()).toUpperCase()}</span>
        </p>
        <h1>Your day</h1>
      </div>
      <div className="metrics" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <button className="metric" style={{ textAlign: "left" }} onClick={() => go(9)}>
          <small className="muted">Attendance</small>
          <b>{x.attendance.marked_days ? `${Math.round(x.attendance.percent)}%` : "—"}</b>
          <small className="muted">{x.attendance.marked_days ? `${x.attendance.present} of ${x.attendance.marked_days} days` : "Not marked yet"}</small>
        </button>
        <button className="metric" style={{ textAlign: "left" }} onClick={() => go(4)}>
          <small className="muted">Homework</small>
          <b>{`${x.homework_due} due`}</b>
          <small className={x.homework_overdue ? "bad" : "muted"}>{x.homework_overdue ? `${x.homework_overdue} overdue` : "None overdue"}</small>
        </button>
      </div>
      {x.learning_streak && x.learning_streak.count > 0 ? (
        <p className="status">{`🔥 ${plural(x.learning_streak.count, "homework")} in a row handed in on time`}</p>
      ) : null}

      <div className="section-head">
        <h3>Today&apos;s lessons</h3>
        <button className="text-button blue-text" onClick={() => go(3)}>
          Week ›
        </button>
      </div>
      {lessons.length ? (
        <div className="panel">
          {lessons.map((p) => (
            <div className="item" key={p.period_number}>
              <span>
                <strong>{p.subject_name}</strong>
                <small className="muted">{`${p.label ?? `Period ${p.period_number}`} · ${hhmm(p.start_time)} – ${hhmm(p.end_time)}${p.teacher_name ? ` · ${p.teacher_name}` : ""}`}</small>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <PmEmpty title="No lessons today" />
      )}

      <div className="section-head">
        <h3>Homework to do</h3>
      </div>
      {x.homework.filter((h) => !h.submitted).length ? (
        <div className="panel">
          {x.homework
            .filter((h) => !h.submitted)
            .map((h) => (
              <button className="item" key={h.homework_id} onClick={() => go(5, `id=${h.homework_id}`)}>
                <span>
                  <strong>{h.title}</strong>
                  <small className={h.overdue ? "bad" : "muted"}>{`${h.subject_name ?? ""} · ${h.overdue ? "overdue since" : "due"} ${dayLabel(h.due_date)}`}</small>
                </span>
                <span>›</span>
              </button>
            ))}
        </div>
      ) : (
        <PmEmpty title="All done">Nothing left to hand in.</PmEmpty>
      )}

      {x.notices.length ? (
        <>
          <div className="section-head">
            <h3>Notices</h3>
          </div>
          <div className="panel">
            {x.notices.slice(0, 3).map((n) => (
              <div className="item" key={n.notice_id}>
                <span>
                  <strong>{n.title}</strong>
                  <small className="muted">{n.body?.slice(0, 120) ?? ""}</small>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

// ---------- SM-003 Timetable ----------

export function StudentTimetable() {
  const w = useApi<Week>("/api/v1/student/timetable");
  const today = ((new Date().getDay() + 6) % 7) + 1;
  const [day, setDay] = useState(today);
  const days = useMemo(() => Array.from(new Set((w.data?.periods ?? []).map((p) => p.day_of_week))).sort(), [w.data]);
  if (w.loading && !w.data) return <PmLoading />;
  if (w.error) return <PmEmpty title="No timetable yet">{w.error}</PmEmpty>;
  const cur = days.includes(day) ? day : days[0];
  const byPeriod = new Map((w.data?.entries ?? []).map((e) => [e.period_id, e]));
  const periods = (w.data?.periods ?? []).filter((p) => p.day_of_week === cur).sort((a, b) => a.period_number - b.period_number);
  return (
    <>
      <div className="chip-row">
        {days.map((d) => (
          <button key={d} className={d === cur ? "on" : ""} onClick={() => setDay(d)}>
            {DAY[d]}
            {d === today ? " •" : ""}
          </button>
        ))}
      </div>
      <div className="panel">
        {periods.map((p) => {
          const e = byPeriod.get(p.id);
          return (
            <div className="item" key={p.id}>
              <span>
                <strong>{p.is_break ? p.label ?? "Break" : e?.subject_name ?? "Free period"}</strong>
                <small className="muted">{`${hhmm(p.start_time)} – ${hhmm(p.end_time)}${e?.teacher_name ? ` · ${e.teacher_name}` : ""}${e?.room_name ? ` · ${e.room_name}` : ""}`}</small>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------- SM-004 Homework list ----------

export function StudentHomeworkList() {
  const { go } = useStudentApp();
  const hw = useApi<Homework[]>("/api/v1/student/homework");
  const dash = useApi<Dashboard>("/api/v1/student/dashboard");
  const [tab, setTab] = useState<"todo" | "past">("todo");
  if (hw.loading && !hw.data) return <PmLoading />;
  if (hw.error) return <PmError>{hw.error}</PmError>;
  const submitted = new Set((dash.data?.homework ?? []).filter((h) => h.submitted).map((h) => h.homework_id));
  const list = (hw.data ?? [])
    .filter((h) => (tab === "todo" ? !h.is_past_due && !h.is_closed : h.is_past_due || h.is_closed))
    .sort((a, b) => (tab === "todo" ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date)));
  return (
    <>
      <div className="chip-row">
        <button className={tab === "todo" ? "on" : ""} onClick={() => setTab("todo")}>
          To do
        </button>
        <button className={tab === "past" ? "on" : ""} onClick={() => setTab("past")}>
          Past
        </button>
      </div>
      {!list.length ? <PmEmpty title={tab === "todo" ? "Nothing to do" : "No past homework"} /> : null}
      {list.length ? (
        <div className="panel">
          {list.map((h) => (
            <button className="item" key={h.id} onClick={() => go(5, `id=${h.id}`)}>
              <span>
                <strong>{h.title}</strong>
                <small className="muted">{`${h.subject_name ?? ""} · due ${dayLabel(h.due_date)}`}</small>
                {submitted.has(h.id) ? <span className="status">Handed in</span> : null}
              </span>
              <span>›</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

// ---------- SM-005 Homework detail + hand in ----------

export function StudentHomeworkDetail() {
  const { notify } = useStudentApp();
  const id = Number(useSearchParams().get("id"));
  const all = useApi<Homework[]>("/api/v1/student/homework");
  const sub = useApi<Submission | null>(id ? `/api/v1/student/homework/${id}/submission` : null);
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setComment(sub.data?.comment ?? ""), [sub.data]);

  if (!id) return <PmEmpty title="Pick a homework" />;
  if ((all.loading && !all.data) || (sub.loading && sub.data === null && !sub.error)) return <PmLoading />;
  const h = all.data?.find((x) => x.id === id);
  if (!h) return <PmError>{all.error ?? "Homework not found."}</PmError>;
  const s = sub.data;
  const reviewed = !!s && s.status !== "submitted";
  // Approved work is final; work sent back ("rejected") can be handed in again.
  const canEdit = !h.is_closed && s?.status !== "approved";

  async function handIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { comment: comment.trim() || null };
      if (s) await api.patch(`/api/v1/student/homework/${id}/submission`, body);
      else await api.post(`/api/v1/student/homework/${id}/submission`, body);
      if (file) {
        const form = new FormData();
        form.append("files", file);
        await api.upload(`/api/v1/student/homework/${id}/submission/files`, form);
        setFile(null);
      }
      notify(s ? "Your work is updated." : "Handed in. Well done!");
      sub.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel soft">
        <h3 style={{ margin: 0 }}>{h.title}</h3>
        <p className="muted" style={{ margin: "4px 0 0" }}>{`${h.subject_name ?? ""} · due ${dayLabel(h.due_date)}${h.created_by_name ? ` · ${h.created_by_name}` : ""}`}</p>
      </div>
      <p style={{ whiteSpace: "pre-line" }}>{h.description}</p>
      {h.attachments.length ? (
        <div className="panel">
          {h.attachments.map((a) => (
            <button className="item" key={a.id} onClick={() => api.open(`/api/v1/student/homework/${id}/files/${a.id}`).catch((e) => setError(errorText(e)))}>
              <span>
                <strong>{a.file_name}</strong>
                <small className="muted">Worksheet from your teacher</small>
              </span>
              <span>›</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="section-head">
        <h3>Your work</h3>
        {s ? <span className={s.status === "rejected" ? "status red" : reviewed ? "status blue" : "status"}>{s.status === "approved" ? "Approved" : s.status === "rejected" ? "Sent back — please redo" : "Handed in"}</span> : null}
      </div>
      {s ? <p className="micro" style={{ margin: "4px 0" }}>{`Handed in ${dateTime(s.submitted_at)}`}</p> : null}
      {s?.teacher_remark || s?.marks != null ? (
        <div className="panel soft">
          <strong>Teacher&apos;s feedback</strong>
          {s.marks != null ? <p style={{ margin: "4px 0" }}>{`Marks: ${s.marks}${h.max_marks ? ` / ${h.max_marks}` : ""}`}</p> : null}
          {s.teacher_remark ? <p style={{ margin: "4px 0" }}>{s.teacher_remark}</p> : null}
        </div>
      ) : null}
      {s?.files.length ? (
        <div className="panel">
          {s.files.map((f) => (
            <button className="item" key={f.id} onClick={() => api.open(`/api/v1/student/homework/${id}/files/${f.id}`).catch((e) => setError(errorText(e)))}>
              <span>
                <strong>{f.file_name}</strong>
                <small className="muted">Your work</small>
              </span>
              <span>›</span>
            </button>
          ))}
        </div>
      ) : null}
      <PmError>{error}</PmError>
      {canEdit ? (
        <form onSubmit={handIn}>
          <label className="field">
            Note for your teacher
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={3} placeholder="Optional" />
          </label>
          <label className="field">
            Attach your work (photo or file)
            <input type="file" accept="image/*,application/pdf,.doc,.docx" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <button className="action" type="submit" disabled={busy || (!s && !comment.trim() && !file)}>
            {busy ? "Sending…" : s ? "Update my work" : "Hand in"}
          </button>
        </form>
      ) : (
        <p className="micro">{h.is_closed ? "This homework is closed." : "Your teacher has approved this work."}</p>
      )}
    </>
  );
}

// ---------- SM-006 Results list, SM-007 one result ----------

export function StudentResults() {
  const { go } = useStudentApp();
  const r = useApi<ExamListItem[]>("/api/v1/student/exams");
  if (r.loading && !r.data) return <PmLoading />;
  if (r.error) return <PmError>{r.error}</PmError>;
  if (!r.data?.length) return <PmEmpty title="No results yet">Results appear here once your school publishes them.</PmEmpty>;
  return (
    <div className="panel">
      {r.data.map((e) => (
        <button className="item" key={e.exam_id} onClick={() => go(7, `id=${e.exam_id}`)}>
          <span>
            <strong>{e.exam_name}</strong>
            <small className="muted">{`${dayLabel(e.end_date)} · ${e.summary.total_obtained}/${e.summary.total_max} · ${Math.round(e.summary.percentage)}%`}</small>
            <span className={e.summary.is_pass ? "status" : "status red"}>{`Grade ${e.summary.overall_grade}`}</span>
          </span>
          <span>›</span>
        </button>
      ))}
    </div>
  );
}

export function StudentResult() {
  const id = Number(useSearchParams().get("id"));
  const r = useApi<ExamResult>(id ? `/api/v1/student/exams/${id}` : null);
  const [error, setError] = useState<string | null>(null);
  if (!id) return <PmEmpty title="Pick a result" />;
  if (r.loading && !r.data) return <PmLoading />;
  if (r.error) return <PmError>{r.error}</PmError>;
  const x = r.data!;
  return (
    <>
      <div className="panel soft">
        <h3 style={{ margin: 0 }}>{x.exam_name}</h3>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {`${x.summary.total_obtained}/${x.summary.total_max} · ${Math.round(x.summary.percentage)}% · Grade ${x.summary.overall_grade}${x.rank ? ` · Rank ${x.rank}${x.class_size ? ` of ${x.class_size}` : ""}` : ""}`}
        </p>
      </div>
      <div className="panel">
        {x.subjects.map((s) => (
          <div className="item" key={s.exam_paper_id}>
            <span>
              <strong>{s.subject_name}</strong>
              <small className={s.is_pass === false ? "bad" : "muted"}>
                {s.status === "absent" ? "Absent" : s.status === "exempt" ? "Exempt" : s.marks_obtained == null ? "Not marked yet" : `${s.marks_obtained}/${s.max_marks}${s.grade ? ` · ${s.grade}` : ""}`}
              </small>
              {s.remark ? <small className="muted">{s.remark}</small> : null}
            </span>
          </div>
        ))}
      </div>
      {x.teacher_remark ? <p className="micro">{`Class teacher: ${x.teacher_remark}`}</p> : null}
      {x.principal_remark ? <p className="micro">{`Principal: ${x.principal_remark}`}</p> : null}
      <PmError>{error}</PmError>
      <button className="action secondary" onClick={() => api.open(`/api/v1/student/exams/${id}/report-card.pdf`).catch((e) => setError(errorText(e)))}>
        Open report card (PDF)
      </button>
    </>
  );
}

// ---------- SM-008 Calendar ----------

export function StudentCalendar() {
  const c = useApi<CalItem[]>("/api/v1/student/calendar");
  if (c.loading && !c.data) return <PmLoading />;
  if (c.error) return <PmError>{c.error}</PmError>;
  const items = (c.data ?? []).filter((i) => !i.is_cancelled);
  if (!items.length) return <PmEmpty title="Nothing coming up">Holidays, exams and events for the next six weeks appear here.</PmEmpty>;
  return (
    <div className="panel">
      {items.map((i) => (
        <div className="item" key={`${i.type}-${i.id}`}>
          <span>
            <strong>{i.title}</strong>
            <small className="muted">{`${dayLabel(i.start_date)}${i.end_date !== i.start_date ? ` – ${dayLabel(i.end_date)}` : ""} · ${i.type}`}</small>
            {i.detail ? <small className="muted">{i.detail}</small> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- SM-009 Profile ----------

export function StudentProfile() {
  const { go } = useStudentApp();
  const me = useApi<Profile>("/api/v1/student/me");
  const d = useApi<Dashboard>("/api/v1/student/dashboard");
  if (me.loading && !me.data) return <PmLoading />;
  if (me.error) return <PmError>{me.error}</PmError>;
  const p = me.data!;
  const a = d.data?.attendance;
  return (
    <>
      <div className="panel soft">
        <h3 style={{ margin: 0 }}>{p.full_name}</h3>
        <p className="muted" style={{ margin: "4px 0 0" }}>{`${p.class_name ?? ""} ${p.section_name ?? ""}${p.roll_no ? ` · Roll ${p.roll_no}` : ""}`}</p>
        <p className="muted" style={{ margin: "2px 0 0" }}>{`${p.admission_no} · ${p.school_name}`}</p>
      </div>
      {a ? (
        <div className="panel">
          <strong>Attendance this year</strong>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {a.marked_days ? `${Math.round(a.percent)}% · present ${a.present}, absent ${a.absent}, half day ${a.half_day} of ${a.marked_days} days` : "Not marked yet"}
          </p>
        </div>
      ) : null}
      <button className="action secondary" onClick={() => go(10)}>
        Change password
      </button>
    </>
  );
}

// ---------- SM-010 Change password ----------

export function StudentChangePassword() {
  const { notify } = useStudentApp();
  const router = useRouter();
  const first = useSearchParams().get("first") === "1";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const next = String(f.get("new_password") ?? "");
    if (next !== String(f.get("confirm") ?? "")) {
      setError("The two new passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/student/auth/change-password", { current_password: String(f.get("current_password") ?? ""), new_password: next });
      notify("Password changed.");
      router.push("/student/home");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {first ? (
        <p className="status amber" style={{ display: "block", whiteSpace: "normal" }}>
          Please choose your own password before you start.
        </p>
      ) : null}
      <label className="field">
        Current password
        <input type="password" name="current_password" required autoComplete="current-password" />
      </label>
      <label className="field">
        New password (at least 8 characters)
        <input type="password" name="new_password" required minLength={8} maxLength={128} autoComplete="new-password" />
      </label>
      <label className="field">
        New password again
        <input type="password" name="confirm" required minLength={8} maxLength={128} autoComplete="new-password" />
      </label>
      {error ? <p className="micro bad" role="alert">{error}</p> : null}
      <button className="action" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
