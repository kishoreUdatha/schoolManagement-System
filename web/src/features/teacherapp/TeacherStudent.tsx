"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTeacherApp } from "@/components/teacherapp/TeacherShell";
import { api, errorText } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { dayLabel, hhmm, MY_CLASSES, PmEmpty, PmError, PmLoading, type MyClasses } from "./parts";

type Note = {
  id: number;
  period_kind: string;
  period_key: string;
  average: number;
  punctuality: number;
  participation: number;
  discipline: number;
  respect: number;
  teacher_note: string | null;
  rated_by_name: string | null;
  created_at: string;
};
type Student360 = {
  id: number;
  admission_no: string;
  full_name: string;
  roll_no: number;
  section_id: number;
  class_label: string | null;
  class_teacher_name: string | null;
  kpis: {
    attendance_percent: number | null;
    average_percent: number | null;
    homework_done: number;
    homework_total: number;
    behaviour: string | null;
  };
  today: { status: string | null; arrived_at: string | null; left_at: string | null; remark: string | null };
  attendance: { recent: { date: string; status: string; remark: string | null }[] };
  homework: {
    id: number;
    title: string;
    subject_name: string | null;
    due_date: string;
    status: string;
    marks: number | null;
    max_marks: number | null;
  }[];
  notes: Note[];
  parents: { full_name: string; email: string | null; phone: string | null; relation: string; is_primary: boolean }[];
  health: { allergies: string | null; chronic_conditions: string | null; blood_group: string | null; on_file: boolean };
};

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
const TODAY_CLS: Record<string, string> = { present: "status", late: "status amber", half_day: "status blue", absent: "status red" };
const words = (s: string) => s.replace(/_/g, " ");

/** TM-014. One child at a glance for a teacher: today, attendance, marks, homework, notes, parents. */
export function TeacherStudent() {
  const { go } = useTeacherApp();
  const id = Number(useSearchParams().get("id"));
  const st = useApi<Student360>(id ? `/api/v1/teacher/students/${id}/360` : null);
  const mine = useApi<MyClasses>(MY_CLASSES);

  if (!id) return <PmEmpty title="Pick a student">Open one from a class list.</PmEmpty>;
  if (st.loading && !st.data) return <PmLoading />;
  if (st.error) return <PmError>{st.error}</PmError>;
  const s = st.data;
  if (!s) return null;
  const isClassTeacher = !!mine.data?.class_teacher_of.some((c) => c.section_id === s.section_id);
  const allergy = [s.health.allergies, s.health.chronic_conditions].filter(Boolean).join(" · ");

  return (
    <>
      <div className="panel soft">
        <h3 style={{ margin: 0 }}>{s.full_name}</h3>
        <p className="muted" style={{ margin: "4px 0 0" }}>{`${s.class_label ?? ""} · Roll ${s.roll_no} · ${s.admission_no}`}</p>
        {s.today.status ? (
          <span className={TODAY_CLS[s.today.status] ?? "status blue"}>
            {`Today: ${words(s.today.status)}${s.today.arrived_at ? ` · in ${hhmm(s.today.arrived_at)}` : ""}${s.today.left_at ? ` · out ${hhmm(s.today.left_at)}` : ""}`}
          </span>
        ) : (
          <span className="status blue">Today: not marked yet</span>
        )}
      </div>
      {allergy ? (
        <p className="status red" style={{ display: "block", whiteSpace: "normal" }}>{`Health: ${allergy}`}</p>
      ) : null}

      <div className="metrics two">
        <div className="metric">
          <small>Attendance</small>
          <b>{pct(s.kpis.attendance_percent)}</b>
        </div>
        <div className="metric">
          <small>Exam average</small>
          <b>{pct(s.kpis.average_percent)}</b>
        </div>
        <div className="metric">
          <small>Homework in</small>
          <b>{`${s.kpis.homework_done}/${s.kpis.homework_total}`}</b>
        </div>
        <div className="metric">
          <small>Behaviour</small>
          <b>{s.kpis.behaviour ?? "—"}</b>
        </div>
      </div>

      <div className="section-head">
        <h3>Behaviour notes</h3>
        {isClassTeacher ? (
          <button className="text-button blue-text" onClick={() => go(15, `student=${s.id}`)}>
            + Add
          </button>
        ) : null}
      </div>
      {s.notes.length ? (
        <div className="panel">
          {s.notes.slice(0, 4).map((n) => (
            <div className="item" key={n.id}>
              <span>
                <strong>{`${n.period_key} · ${n.average.toFixed(1)} / 5`}</strong>
                <small className="muted">{`Punctuality ${n.punctuality} · Participation ${n.participation} · Discipline ${n.discipline} · Respect ${n.respect}`}</small>
                {n.teacher_note ? <small style={{ display: "block", whiteSpace: "pre-wrap" }}>{n.teacher_note}</small> : null}
                {n.rated_by_name ? <small className="muted">{`— ${n.rated_by_name}`}</small> : null}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{isClassTeacher ? "No notes yet. Add this week's." : "No notes yet. The class teacher records them."}</p>
      )}

      <div className="section-head">
        <h3>Recent homework</h3>
      </div>
      {s.homework.length ? (
        <div className="panel">
          {s.homework.slice(0, 5).map((h) => (
            <div className="item" key={h.id}>
              <span>
                <strong>{h.title}</strong>
                <small className="muted">{`${h.subject_name ?? ""} · due ${dayLabel(h.due_date)}${h.marks != null ? ` · ${h.marks}${h.max_marks ? `/${h.max_marks}` : ""}` : ""}`}</small>
                <span className={h.status === "approved" ? "status" : h.status === "rejected" || h.status === "not_submitted" ? "status red" : "status amber"}>
                  {words(h.status)}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No homework yet.</p>
      )}

      {s.attendance.recent.length ? (
        <>
          <div className="section-head">
            <h3>Last school days</h3>
          </div>
          <div className="chip-row">
            {s.attendance.recent.slice(0, 10).map((d) => (
              <span key={d.date} className={TODAY_CLS[d.status] ?? "status blue"} title={d.remark ?? undefined}>
                {`${dayLabel(d.date).slice(4)} ${d.status === "present" ? "P" : d.status === "absent" ? "A" : d.status === "late" ? "L" : "½"}`}
              </span>
            ))}
          </div>
        </>
      ) : null}

      <div className="section-head">
        <h3>Parents</h3>
      </div>
      {s.parents.length ? (
        <div className="panel">
          {s.parents.map((p) => (
            <div className="item" key={`${p.full_name}-${p.relation}`}>
              <span>
                <strong>{`${p.full_name}${p.is_primary ? " ★" : ""}`}</strong>
                <small className="muted">{words(p.relation)}</small>
              </span>
              <span style={{ display: "flex", gap: 12 }}>
                {p.phone ? (
                  <a className="blue-text" href={`tel:${p.phone}`} aria-label={`Call ${p.full_name}`}>
                    Call
                  </a>
                ) : null}
                {p.email ? (
                  <a className="blue-text" href={`mailto:${p.email}`} aria-label={`Email ${p.full_name}`}>
                    Email
                  </a>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No parent on file.</p>
      )}
    </>
  );
}

const TRAITS: ["punctuality" | "participation" | "discipline" | "respect", string][] = [
  ["punctuality", "Punctuality"],
  ["participation", "Participation"],
  ["discipline", "Discipline"],
  ["respect", "Respect"],
];
type Ratings = Record<(typeof TRAITS)[number][0], number>;
type Suggestion = Ratings & { rationale: string; source: string };

/** TM-015. The class teacher's weekly (or monthly) behaviour note for one child. */
export function TeacherBehaviourNote() {
  const { go, notify } = useTeacherApp();
  const id = Number(useSearchParams().get("student"));
  const st = useApi<{ full_name: string; class_label: string | null }>(id ? `/api/v1/teacher/students/${id}/360` : null);
  const [kind, setKind] = useState<"weekly" | "monthly">("weekly");
  const [r, setR] = useState<Ratings>({ punctuality: 4, participation: 4, discipline: 4, respect: 4 });
  const [note, setNote] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "ai" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!id) return <PmEmpty title="Pick a student">Open one from your class list.</PmEmpty>;

  async function suggest() {
    setBusy("ai");
    setError(null);
    try {
      const s = await api.post<Suggestion>("/api/v1/teacher/behaviour/ai-suggest", { student_id: id, note: note.trim() });
      setR({ punctuality: s.punctuality, participation: s.participation, discipline: s.discipline, respect: s.respect });
      setHint(s.source === "stub" ? "Suggested from the words in your note — adjust anything that looks off." : s.rationale);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      await api.post("/api/v1/teacher/behaviour", { student_id: id, period_kind: kind, ...r, teacher_note: note.trim() || null });
      notify("Behaviour note saved.");
      go(14, `id=${id}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  }

  return (
    <>
      {st.data ? (
        <div className="panel soft">
          <h3 style={{ margin: 0 }}>{st.data.full_name}</h3>
          <p className="muted" style={{ margin: "4px 0 0" }}>{st.data.class_label}</p>
        </div>
      ) : null}
      <div className="chip-row">
        <button className={kind === "weekly" ? "on" : ""} onClick={() => setKind("weekly")}>
          This week
        </button>
        <button className={kind === "monthly" ? "on" : ""} onClick={() => setKind("monthly")}>
          This month
        </button>
      </div>
      <label className="field">
        What did you notice?
        <textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Late twice, but answered well in class and helped a classmate." />
      </label>
      <button className="action secondary" disabled={busy !== null || note.trim().length < 3} onClick={suggest}>
        {busy === "ai" ? "Thinking…" : "✨ Suggest ratings from my note"}
      </button>
      {hint ? <p className="micro">{hint}</p> : null}
      <div className="panel">
        {TRAITS.map(([k, label]) => (
          <div className="mark-row" key={k}>
            <div className="who">
              <strong>{label}</strong>
            </div>
            <div className="seg" role="radiogroup" aria-label={label}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={r[k] === v}
                  className={r[k] === v ? (v >= 4 ? "on present" : v === 3 ? "on half_day" : v === 2 ? "on late" : "on absent") : ""}
                  onClick={() => setR((x) => ({ ...x, [k]: v }))}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="micro">1 = needs a lot of help, 5 = excellent. Saving again replaces this period&apos;s note; parents see it in their app.</p>
      {error ? <p className="micro bad" role="alert">{error}</p> : null}
      <div className="sticky-save">
        <button className="action" disabled={busy !== null} onClick={save}>
          {busy === "save" ? "Saving…" : "Save note"}
        </button>
      </div>
    </>
  );
}
