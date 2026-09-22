"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, initials } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { longDay, statusClass, statusLabel, useSchoolDay } from "./shared";
import { DAILY_FORM, STATUSES, type DayRow, type DayView, type MyClasses, type Status } from "./types";

const TONES = ["mint", "", "peach", "lilac"];

/**
 * SCR-110, live: the class teacher's daily register.
 * GET /teacher/my-classes, GET /teacher/attendance?section_id&date,
 * POST /teacher/attendance/save (status, remark and check-in time per child).
 * The day defaults to the school's day.
 */
export function DailyAttendance() {
  const initialSection = useSearchParams().get("section_id");
  const schoolDay = useSchoolDay();
  const mine = useApi<MyClasses>("/api/v1/teacher/my-classes");
  const [sectionId, setSectionId] = useState<number | null>(initialSection ? Number(initialSection) : null);
  const [day, setDay] = useState<string | null>(null);
  const [show, setShow] = useState("");
  const [rows, setRows] = useState<DayRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sectionId === null && mine.data?.class_teacher_of.length) setSectionId(mine.data.class_teacher_of[0].section_id);
  }, [mine.data, sectionId]);
  useEffect(() => {
    if (day === null && schoolDay) setDay(schoolDay);
  }, [schoolDay, day]);

  const view = useApi<DayView>(sectionId && day ? "/api/v1/teacher/attendance" : null, { section_id: sectionId, date: day });
  useEffect(() => {
    if (view.data) setRows(view.data.rows);
  }, [view.data]);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, half_day: 0, unmarked: 0 };
    rows.forEach((r) => (r.status ? c[r.status]++ : c.unmarked++));
    return c;
  }, [rows]);

  const v = view.data;
  const canEdit = Boolean(v?.is_editable && !v.is_locked && !v.is_holiday);
  const lastSaved = rows.reduce<string | null>((m, r) => (r.marked_at && (!m || r.marked_at > m) ? r.marked_at : m), null);

  const set = (id: number, patch: Partial<DayRow>) => setRows((p) => p.map((r) => (r.student_id === id ? { ...r, ...patch } : r)));
  // Children on approved leave stay absent when everyone is marked present.
  const allPresent = () => setRows((p) => p.map((r) => ({ ...r, status: r.on_leave ? "absent" : "present" })));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!v || !sectionId || !day) return;
    if (!canEdit) {
      setError(v.is_locked ? "The office has locked this register." : v.is_holiday ? "No attendance is expected on a holiday." : `This day is outside the ${v.edit_window_days}-day edit window.`);
      return;
    }
    const entries = rows.filter((r) => r.status).map((r) => ({ student_id: r.student_id, status: r.status, remark: r.remark?.trim() || null, arrived_at: r.arrived_at || null }));
    if (!entries.length) {
      setError("Mark at least one student before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<{ saved: number }>("/api/v1/teacher/attendance/save", { section_id: sectionId, date: day, entries });
      notify(`Attendance saved for ${r.saved} students.`);
      view.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (mine.data && !mine.data.class_teacher_of.length)
    return (
      <section className="panel">
        <div className="panel-pad muted">You are not the class teacher of any section, so there is no daily register to mark.</div>
      </section>
    );
  if (!day || (mine.loading && !mine.data)) return <Loading what="Finding today's register…" />;

  const shown = show ? rows.filter((r) => (show === "unmarked" ? !r.status : r.status === show)) : rows;

  return (
    <form id={DAILY_FORM} onSubmit={save}>
      <div className="filterbar">
        <select aria-label="Section" value={sectionId ?? ""} onChange={(e) => setSectionId(Number(e.target.value))}>
          {mine.data?.class_teacher_of.map((s) => (
            <option key={s.section_id} value={s.section_id}>
              {s.section_label}
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
          <option value="unmarked">Not marked</option>
        </select>
        <input type="date" className="select-plain" aria-label="Register date" value={day} max={schoolDay ?? undefined} onChange={(e) => e.target.value && setDay(e.target.value)} />
        {schoolDay && day !== schoolDay ? (
          <button type="button" className="btn" onClick={() => setDay(schoolDay)}>
            <Icon name="calendar" className="sm" />
            Today
          </button>
        ) : null}
      </div>
      <ErrorNote>{error ?? mine.error ?? view.error}</ErrorNote>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>
          {v?.is_holiday
            ? `${longDay(day)} is a holiday (${v.holiday_name ?? "school holiday"}). No attendance is expected.`
            : v?.is_locked
              ? `The office locked this register${v.locked_at ? ` on ${dateTime(v.locked_at)}` : ""}. Ask them to reopen it if something needs changing.`
              : v && !v.is_editable
                ? `This day is outside the ${v.edit_window_days}-day edit window. Entries are shown read-only.`
                : "Choose an attendance status for each student, then save the register."}
        </span>
      </div>
      <Panel
        title={`${v?.section_label ?? "Register"} · Daily register`}
        sub={longDay(day)}
        action={
          <button type="button" className="btn" onClick={allPresent} disabled={!canEdit}>
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
          <span>{view.loading ? "Loading…" : `${rows.length} students · ${counts.unmarked} not marked`}</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Roll no.</th>
                <th>Status</th>
                <th>Check-in</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.student_id}>
                  <td>
                    <div className="person">
                      <span className={`avatar ${TONES[i % 4]}`}>{initials(r.full_name)}</span>
                      <div>
                        {r.full_name}
                        <small>{r.on_leave ? `${r.admission_no} · ${r.on_leave} leave approved` : r.admission_no}</small>
                      </div>
                    </div>
                  </td>
                  <td>{String(r.roll_no).padStart(2, "0")}</td>
                  <td>
                    <select
                      className={`attendance-choice ${statusClass(r.status)}`}
                      aria-label={`Attendance for ${r.full_name}`}
                      value={r.status ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => set(r.student_id, { status: (e.target.value || null) as Status | null })}
                    >
                      {!r.status ? <option value="">Not marked</option> : null}
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="time"
                      className="marks-input"
                      style={{ width: "110px", textAlign: "left" }}
                      aria-label={`Check-in time for ${r.full_name}`}
                      value={r.arrived_at ? r.arrived_at.slice(0, 5) : ""}
                      disabled={!canEdit || r.status === "absent"}
                      onChange={(e) => set(r.student_id, { arrived_at: e.target.value || null })}
                    />
                  </td>
                  <td>
                    <input
                      className="marks-input"
                      style={{ width: "180px", textAlign: "left" }}
                      placeholder={canEdit ? "Add a note" : ""}
                      aria-label={`Attendance note for ${r.full_name}`}
                      value={r.remark ?? ""}
                      maxLength={300}
                      disabled={!canEdit}
                      onChange={(e) => set(r.student_id, { remark: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={shown.length > 0 || view.loading}>
          {rows.length ? "No students with this status." : "No active students in this section."}
        </div>
      </Panel>
      <div className="form-footer" style={{ border: "0", background: "transparent" }}>
        <span>{lastSaved ? `Last saved ${dateTime(lastSaved)}` : "Not saved yet for this day"}</span>
        <button type="submit" className="btn primary" disabled={saving || !canEdit}>
          <Icon name="check" className="sm" />
          {saving ? "Saving…" : "Save attendance"}
        </button>
      </div>
    </form>
  );
}
