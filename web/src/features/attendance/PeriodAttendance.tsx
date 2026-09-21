"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { initials } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { clock, longDay, statusClass, statusLabel, useSchoolDay, weekday } from "./shared";
import { LESSON_FORM, STATUSES, type AcademicYear, type LessonGrid, type LessonRow, type Period, type SchoolClass, type Status, type TeacherTimetable } from "./types";

const TONES = ["mint", "", "peach", "lilac"];

/** One lesson a person could mark: a section in a period on the chosen day. */
type Lesson = { key: string; section_id: number; period_id: number; label: string };

/**
 * SCR-111, live: marking one lesson. The roster arrives filled in from the
 * day register; only rows that differ from what was loaded are sent.
 * GET/POST /school/attendance-ops/periods. Lessons come from the teacher's
 * own timetable (GET /teacher/timetable) for a teacher, or from the school's
 * classes and periods (GET /school/classes, /school/periods) for the office.
 */
export function PeriodAttendance() {
  const role = useSession()?.user.role;
  const isTeacher = role === "teacher";
  const schoolDay = useSchoolDay();
  const [day, setDay] = useState<string | null>(null);
  useEffect(() => {
    if (day === null && schoolDay) setDay(schoolDay);
  }, [schoolDay, day]);

  // Teacher: their own lessons. Office: every section and the day's periods.
  const timetable = useApi<TeacherTimetable>(role && isTeacher ? "/api/v1/teacher/timetable" : null);
  const years = useApi<AcademicYear[]>(role && !isTeacher ? "/api/v1/school/academic-years" : null);
  const yearId = (years.data?.find((y) => y.is_current) ?? years.data?.[0])?.id;
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const periods = useApi<Period[]>(role && !isTeacher ? "/api/v1/school/periods" : null);
  const [sectionId, setSectionId] = useState<number | null>(null);

  const allSections = useMemo(() => classes.data?.flatMap((c) => c.sections.map((s) => ({ id: s.id, label: `${c.name} ${s.name}` }))) ?? [], [classes.data]);
  useEffect(() => {
    if (sectionId === null && allSections.length) setSectionId(allSections[0].id);
  }, [allSections, sectionId]);

  const lessons: Lesson[] = useMemo(() => {
    if (!day) return [];
    const dow = weekday(day);
    if (isTeacher) {
      return (timetable.data?.by_day.find((d) => d.day_of_week === dow)?.items ?? [])
        .filter((t) => !t.is_break)
        .sort((a, b) => a.period_number - b.period_number)
        .map((t) => ({
          key: `${t.section_id}-${t.period_id}`,
          section_id: t.section_id,
          period_id: t.period_id,
          label: `${t.period_label ?? `Period ${t.period_number}`} · ${clock(t.start_time)} · ${t.section_label}${t.subject_name ? ` · ${t.subject_name}` : ""}`,
        }));
    }
    if (!sectionId) return [];
    return (periods.data ?? [])
      .filter((p) => p.day_of_week === dow && !p.is_break)
      .sort((a, b) => a.period_number - b.period_number)
      .map((p) => ({ key: `${sectionId}-${p.id}`, section_id: sectionId, period_id: p.id, label: `${p.label ?? `Period ${p.period_number}`} · ${clock(p.start_time)}` }));
  }, [day, isTeacher, timetable.data, periods.data, sectionId]);

  const [lessonKey, setLessonKey] = useState("");
  useEffect(() => {
    if (!lessons.some((l) => l.key === lessonKey)) setLessonKey(lessons[0]?.key ?? "");
  }, [lessons, lessonKey]);
  const lesson = lessons.find((l) => l.key === lessonKey);

  const grid = useApi<LessonGrid>(lesson && day ? "/api/v1/school/attendance-ops/periods" : null, { section_id: lesson?.section_id, date: day, period_id: lesson?.period_id });
  const [loaded, setLoaded] = useState<Record<number, LessonRow>>({});
  const [rows, setRows] = useState<LessonRow[]>([]);
  useEffect(() => {
    if (!grid.data) return;
    setRows(grid.data.rows);
    setLoaded(Object.fromEntries(grid.data.rows.map((r) => [r.student_id, r])));
  }, [grid.data]);

  const [show, setShow] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only what moved: posting the whole class would rewrite marks somebody else made meanwhile.
  const changed = rows.filter((r) => {
    const was = loaded[r.student_id];
    return !was || !was.already_marked || was.status !== r.status || (was.remark ?? "") !== (r.remark ?? "");
  });
  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, half_day: 0 };
    rows.forEach((r) => c[r.status]++);
    return c;
  }, [rows]);
  const set = (id: number, patch: Partial<LessonRow>) => setRows((p) => p.map((r) => (r.student_id === id ? { ...r, ...patch } : r)));

  async function save(e: FormEvent) {
    e.preventDefault();
    const g = grid.data;
    if (!g) return;
    if (!changed.length) {
      setError("Nothing has changed since this lesson was loaded.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<LessonGrid>("/api/v1/school/attendance-ops/periods", {
        section_id: g.section_id,
        date: g.date,
        period_id: g.period_id,
        entries: changed.map((c) => ({ student_id: c.student_id, status: c.status, remark: c.remark?.trim() || null })),
      });
      setRows(r.rows);
      setLoaded(Object.fromEntries(r.rows.map((x) => [x.student_id, x])));
      notify(`${changed.length} students recorded for this lesson.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (!day) return <Loading what="Finding today's lessons…" />;
  const g = grid.data;
  const shown = show ? rows.filter((r) => r.status === show) : rows;
  const differs = rows.filter((r) => r.day_status && r.day_status !== r.status).length;

  return (
    <form id={LESSON_FORM} onSubmit={save}>
      <div className="filterbar">
        {!isTeacher ? (
          <select aria-label="Section" value={sectionId ?? ""} onChange={(e) => setSectionId(Number(e.target.value))}>
            {allSections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        ) : null}
        <select aria-label="Lesson" value={lessonKey} onChange={(e) => setLessonKey(e.target.value)}>
          {!lessons.length ? <option value="">No lessons that day</option> : null}
          {lessons.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <input type="date" className="select-plain" aria-label="Lesson date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
      </div>
      <ErrorNote>{error ?? timetable.error ?? years.error ?? classes.error ?? periods.error ?? grid.error}</ErrorNote>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>
          {lessons.length
            ? "Each row starts from the day register. Correct the differences and save; the daily register itself is not changed here."
            : `The timetable has no lessons on ${longDay(day)}.`}
        </span>
      </div>
      <Panel
        title={g ? `${g.period_label ?? `Period ${g.period_number}`} · ${clock(g.start_time)}–${clock(g.end_time)}` : "Lesson register"}
        sub={[g?.subject_name ?? (g ? "Not timetabled" : null), longDay(day)].filter(Boolean).join(" · ")}
        action={
          <button type="button" className="btn" disabled={!g} onClick={() => setRows((p) => p.map((r) => ({ ...r, status: "present" })))}>
            <Icon name="check" className="sm" />
            Mark all present
          </button>
        }
        flush
      >
        <div className="approval-summary">
          <strong>
            <span>{counts.present}</span>
            {" Present   "}
            <span>{counts.absent}</span>
            {" Absent   "}
            <span>{counts.late}</span>
            {" Late   "}
            <span>{counts.half_day}</span>
            {" Half day"}
          </strong>
          <span>{grid.loading ? "Loading…" : g ? `${g.marked} of ${rows.length} marked for this lesson · ${differs} differ from the day` : "Choose a lesson"}</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Roll no.</th>
                <th>Status</th>
                <th>Day register</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.student_id}>
                  <td>
                    <div className="person">
                      <span className={`avatar ${TONES[i % 4]}`}>{initials(r.student_name)}</span>
                      <div>
                        {r.student_name}
                        <small>{r.already_marked ? `${r.admission_no} · already marked` : r.admission_no}</small>
                      </div>
                    </div>
                  </td>
                  <td>{r.roll_no ? String(r.roll_no).padStart(2, "0") : "—"}</td>
                  <td>
                    <select className={`attendance-choice ${statusClass(r.status)}`} aria-label={`Attendance for ${r.student_name}`} value={r.status} onChange={(e) => set(r.student_id, { status: e.target.value as Status })}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{r.day_status ? <Badge>{statusLabel(r.day_status)}</Badge> : "Not marked today"}</td>
                  <td>
                    <input className="marks-input" style={{ width: "180px", textAlign: "left" }} placeholder="Add a note" maxLength={300} aria-label={`Attendance note for ${r.student_name}`} value={r.remark ?? ""} onChange={(e) => set(r.student_id, { remark: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={shown.length > 0 || grid.loading}>
          {!lesson ? "Choose a lesson to see its roster." : rows.length ? "No students with this status." : "No students in this section yet."}
        </div>
      </Panel>
      <div className="form-footer" style={{ border: "0", background: "transparent" }}>
        <span>{changed.length ? `${changed.length} changes not yet saved` : "Nothing waiting to be saved"}</span>
        <button type="submit" className="btn primary" disabled={saving || !g}>
          <Icon name="check" className="sm" />
          {saving ? "Saving…" : "Save attendance"}
        </button>
      </div>
    </form>
  );
}
