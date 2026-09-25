"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTeacherApp } from "@/components/teacherapp/TeacherShell";
import { api, errorText } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { MY_CLASSES, plural, PmEmpty, PmError, PmLoading, todayIso, type MyClasses } from "./parts";

type Status = "present" | "absent" | "late" | "half_day";
type Row = {
  student_id: number;
  roll_no: number;
  full_name: string;
  admission_no: string;
  status: Status | null;
  remark: string | null;
  on_leave: string | null;
};
type View = {
  section_id: number;
  section_label: string | null;
  date: string;
  is_holiday: boolean;
  holiday_name: string | null;
  is_editable: boolean;
  is_locked: boolean;
  edit_window_days: number;
  rows: Row[];
  summary: Record<string, number>;
};

const CHOICES: [Status, string, string][] = [
  ["present", "P", "Present"],
  ["absent", "A", "Absent"],
  ["late", "L", "Late"],
  ["half_day", "½", "Half day"],
];

/** TM-003. Daily register for a class-teacher section: tap P/A/L/½ per child, save once. */
export function TeacherAttendance() {
  const { go, notify } = useTeacherApp();
  const router = useRouter();
  const search = useSearchParams();
  const mine = useApi<MyClasses>(MY_CLASSES);
  const sections = useMemo(() => (mine.data?.class_teacher_of ?? []).filter((c) => c.is_current_year), [mine.data]);
  const picked = Number(search.get("section")) || sections[0]?.section_id || null;
  const [date, setDate] = useState(todayIso());

  const view = useApi<View>(picked ? "/api/v1/teacher/attendance" : null, { section_id: picked, date });
  const [marks, setMarks] = useState<Record<number, Status>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from what is already saved for this register.
  useEffect(() => {
    const m: Record<number, Status> = {};
    view.data?.rows.forEach((r) => {
      if (r.status) m[r.student_id] = r.status;
    });
    setMarks(m);
  }, [view.data]);

  if (mine.loading && !mine.data) return <PmLoading />;
  if (mine.error) return <PmError>{mine.error}</PmError>;
  if (!sections.length) {
    return (
      <>
        <PmEmpty title="No register to mark">Only a section&apos;s class teacher marks its daily attendance.</PmEmpty>
        <button className="action" onClick={() => go(16)}>
          Mark attendance for a lesson
        </button>
      </>
    );
  }

  const v = view.data;
  const editable = !!v && v.is_editable && !v.is_holiday && !v.is_locked;
  const rows = v?.rows ?? [];
  const count = (s: Status) => rows.filter((r) => marks[r.student_id] === s).length;
  const unmarked = rows.filter((r) => !marks[r.student_id]).length;

  async function save() {
    if (!v) return;
    setSaving(true);
    setError(null);
    try {
      const entries = rows
        .filter((r) => marks[r.student_id])
        .map((r) => ({ student_id: r.student_id, status: marks[r.student_id], remark: r.remark }));
      const res = await api.post<{ saved: number; absence_alerts_sent: number }>("/api/v1/teacher/attendance/save", {
        section_id: v.section_id,
        date: v.date,
        entries,
      });
      notify(`Saved ${plural(res.saved, "student")}${res.absence_alerts_sent ? ` · ${plural(res.absence_alerts_sent, "parent")} alerted` : ""}.`);
      view.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {sections.length > 1 ? (
        <div className="chip-row">
          {sections.map((s) => (
            <button key={s.section_id} className={s.section_id === picked ? "on" : ""} onClick={() => router.replace(`?section=${s.section_id}`)}>
              {s.section_label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="between">
        <label className="field" style={{ flex: 1 }}>
          Date
          <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value || todayIso())} />
        </label>
        <button className="text-button blue-text" style={{ marginLeft: 12 }} onClick={() => go(16)}>
          By lesson ›
        </button>
      </div>

      <PmError>{view.error ?? error}</PmError>
      {view.loading && !v ? <PmLoading /> : null}
      {v ? (
        <>
          <div className="between">
            <h3 style={{ margin: 0 }}>{v.section_label}</h3>
            <span className="muted">{plural(rows.length, "student")}</span>
          </div>
          {v.is_holiday ? <p className="status blue">{`Holiday: ${v.holiday_name ?? ""}`}</p> : null}
          {v.is_locked ? <p className="status amber">This register is locked.</p> : null}
          {!v.is_editable && !v.is_holiday && !v.is_locked ? (
            <p className="status amber">{`Only the last ${v.edit_window_days} days can be changed.`}</p>
          ) : null}
          <p className="micro" style={{ margin: "8px 0" }}>
            {`Present ${count("present")} · Absent ${count("absent")} · Late ${count("late")} · Half day ${count("half_day")} · Not marked ${unmarked}`}
          </p>
          {editable && unmarked > 0 ? (
            <button
              className="action secondary"
              onClick={() =>
                setMarks((m) => {
                  const n = { ...m };
                  rows.forEach((r) => (n[r.student_id] ??= "present"));
                  return n;
                })
              }
            >
              {`Mark the other ${unmarked} present`}
            </button>
          ) : null}
          <div className="panel">
            {rows.map((r) => (
              <div className="mark-row" key={r.student_id}>
                <div className="who">
                  <strong>{`${r.roll_no}. ${r.full_name}`}</strong>
                  <small>{r.on_leave ? `On leave: ${r.on_leave}` : r.admission_no}</small>
                </div>
                <div className="seg" role="radiogroup" aria-label={`Attendance for ${r.full_name}`}>
                  {CHOICES.map(([s, short, long]) => (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={marks[r.student_id] === s}
                      aria-label={long}
                      title={long}
                      disabled={!editable}
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
          {editable ? (
            <div className="sticky-save">
              <button className="action" onClick={save} disabled={saving || rows.every((r) => !marks[r.student_id])}>
                {saving ? "Saving…" : unmarked ? `Save (${unmarked} not marked)` : "Save attendance"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
