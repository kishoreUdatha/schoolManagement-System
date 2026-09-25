"use client";

import { useEffect, useState } from "react";
import { useTeacherApp } from "@/components/teacherapp/TeacherShell";
import { api, errorText } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { hhmm, plural, PmEmpty, PmError, PmLoading, todayIso } from "./parts";

type Status = "present" | "absent" | "late" | "half_day";
type Slot = {
  entry_id: number;
  section_id: number;
  section_label: string;
  subject_name: string;
  period_id: number;
  period_number: number;
  start_time: string;
  end_time: string;
  is_break: boolean;
  day_of_week: number;
};
type Week = { by_day: { day_of_week: number; items: Slot[] }[] };
type Grid = {
  period_number: number;
  subject_name: string | null;
  start_time: string;
  end_time: string;
  marked: number;
  rows: { student_id: number; student_name: string; roll_no: number; status: Status; already_marked: boolean; day_status: Status | null }[];
};

const CHOICES: [Status, string, string][] = [
  ["present", "P", "Present"],
  ["absent", "A", "Absent"],
  ["late", "L", "Late"],
  ["half_day", "½", "Half day"],
];
const PERIODS = "/api/v1/school/attendance-ops/periods";

/** Our timetable numbers weekdays 1 (Mon) … 7 (Sun). */
function weekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() || 7;
}

/** TM-016. Mark who is in one of my lessons, pre-filled from the morning register. */
export function TeacherPeriodAttendance() {
  const { notify } = useTeacherApp();
  const tt = useApi<Week>("/api/v1/teacher/timetable");
  const [date, setDate] = useState(todayIso());
  const lessons = (tt.data?.by_day.find((d) => d.day_of_week === weekday(date))?.items ?? []).filter((s) => !s.is_break);
  const [pick, setPick] = useState<number | null>(null);
  const lesson = lessons.find((l) => l.entry_id === pick) ?? null;

  // Default to the lesson on now (or the last one that started), else the first.
  useEffect(() => {
    if (!lessons.length || lessons.some((l) => l.entry_id === pick)) return;
    const now = new Date().toTimeString().slice(0, 5);
    const started = date === todayIso() ? lessons.filter((l) => hhmm(l.start_time) <= now) : [];
    setPick((started.at(-1) ?? lessons[0]).entry_id);
  }, [lessons, pick, date]);

  const grid = useApi<Grid>(lesson ? PERIODS : null, lesson ? { section_id: lesson.section_id, date, period_id: lesson.period_id } : undefined);
  const [marks, setMarks] = useState<Record<number, Status>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const m: Record<number, Status> = {};
    grid.data?.rows.forEach((r) => (m[r.student_id] = r.status));
    setMarks(m);
  }, [grid.data]);

  if (tt.loading && !tt.data) return <PmLoading />;
  if (tt.error) return <PmError>{tt.error}</PmError>;

  const g = grid.data;
  const rows = g?.rows ?? [];
  const count = (s: Status) => rows.filter((r) => marks[r.student_id] === s).length;

  async function save() {
    if (!lesson || !g) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(PERIODS, {
        section_id: lesson.section_id,
        date,
        period_id: lesson.period_id,
        entries: rows.map((r) => ({ student_id: r.student_id, status: marks[r.student_id] ?? r.status })),
      });
      notify(`Lesson attendance saved for ${plural(rows.length, "student")}.`);
      grid.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <label className="field">
        Date
        <input
          type="date"
          value={date}
          max={todayIso()}
          onChange={(e) => {
            setDate(e.target.value || todayIso());
            setPick(null);
          }}
        />
      </label>
      {!lessons.length ? <PmEmpty title="No lessons that day">Your published timetable has no classes on this day.</PmEmpty> : null}
      {lessons.length ? (
        <div className="chip-row">
          {lessons.map((l) => (
            <button key={l.entry_id} className={l.entry_id === pick ? "on" : ""} onClick={() => setPick(l.entry_id)}>
              {`P${l.period_number} · ${l.section_label}`}
            </button>
          ))}
        </div>
      ) : null}

      <PmError>{grid.error ?? error}</PmError>
      {lesson && grid.loading && !g ? <PmLoading /> : null}
      {lesson && g ? (
        <>
          <div className="panel soft">
            <h3 style={{ margin: 0 }}>{`${g.subject_name ?? lesson.subject_name} · ${lesson.section_label}`}</h3>
            <p className="muted" style={{ margin: "4px 0 0" }}>{`Period ${g.period_number} · ${hhmm(g.start_time)} – ${hhmm(g.end_time)}`}</p>
            {g.marked ? <span className="status">{`Marked · ${g.marked} saved`}</span> : <span className="status amber">Not marked yet</span>}
          </div>
          <p className="micro" style={{ margin: "8px 0" }}>
            {`Present ${count("present")} · Absent ${count("absent")} · Late ${count("late")} · Half day ${count("half_day")}`}
          </p>
          {!g.marked ? <p className="micro">Pre-filled from this morning&apos;s register — change only who is different.</p> : null}
          <div className="panel">
            {rows.map((r) => (
              <div className="mark-row" key={r.student_id}>
                <div className="who">
                  <strong>{`${r.roll_no}. ${r.student_name}`}</strong>
                  <small>{r.day_status ? `Morning: ${r.day_status.replace("_", " ")}` : "Morning: not marked"}</small>
                </div>
                <div className="seg" role="radiogroup" aria-label={`Lesson attendance for ${r.student_name}`}>
                  {CHOICES.map(([s, short, long]) => (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={marks[r.student_id] === s}
                      aria-label={long}
                      title={long}
                      className={marks[r.student_id] === s ? `on ${s}` : ""}
                      onClick={() => setMarks((m) => ({ ...m, [r.student_id]: s }))}
                    >
                      {short}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="sticky-save">
            <button className="action" onClick={save} disabled={saving || !rows.length}>
              {saving ? "Saving…" : g.marked ? "Update lesson attendance" : "Save lesson attendance"}
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
