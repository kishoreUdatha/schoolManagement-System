"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { AttendanceStatus, StaffAttendance as Record_, StaffMember } from "./types";
import { AVATAR_TONES, clock, today } from "./ui";

const STATUSES: AttendanceStatus[] = ["present", "late", "absent", "on_leave", "sick", "holiday"];
/** The mock's select tones: present, absent, late, leave. */
const TONE: Record<AttendanceStatus, string> = { present: "present", late: "late", absent: "absent", on_leave: "leave", sick: "leave", holiday: "leave" };

type Draft = { status: AttendanceStatus | ""; remark: string };

/**
 * SCR-179, live: GET /api/v1/school/staff (active) and
 * GET /api/v1/school/staff-attendance?date= for the register; saving posts
 * POST /staff-attendance/override for each row whose status changed. A row
 * nobody marked stays unmarked: it is not counted as present.
 */
export function StaffAttendance() {
  const [day, setDay] = useState(today());
  const [dept, setDept] = useState("");
  const [only, setOnly] = useState("");
  const staff = useApi<StaffMember[]>("/api/v1/school/staff", { status: "active" });
  const records = useApi<Record_[]>(day ? "/api/v1/school/staff-attendance" : null, { date: day });
  const [draft, setDraft] = useState<Record<number, Draft>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const byUser = useMemo(() => new Map((records.data ?? []).map((r) => [r.user_id, r])), [records.data]);

  // Start each row from what the server holds for the day.
  useEffect(() => {
    const d: Record<number, Draft> = {};
    (staff.data ?? []).forEach((s) => {
      const r = byUser.get(s.user_id);
      d[s.user_id] = { status: r?.status ?? "", remark: r?.override_remark ?? "" };
    });
    setDraft(d);
  }, [staff.data, byUser]);

  const departments = Array.from(new Set((staff.data ?? []).map((s) => s.department_name).filter(Boolean))) as string[];
  const rows = (staff.data ?? []).filter((s) => (!dept || s.department_name === dept) && (!only || (draft[s.user_id]?.status ?? "") === (only === "unmarked" ? "" : only)));

  const count = (st: AttendanceStatus[]) => Object.values(draft).filter((d) => d.status && st.includes(d.status)).length;
  const unmarked = Object.values(draft).filter((d) => !d.status).length;
  const changed = (staff.data ?? []).filter((s) => {
    const d = draft[s.user_id];
    const r = byUser.get(s.user_id);
    return d?.status && (d.status !== r?.status || (d.remark.trim() || null) !== (r?.override_remark ?? null));
  });

  const set = (userId: number, patch: Partial<Draft>) => setDraft((d) => ({ ...d, [userId]: { ...(d[userId] ?? { status: "", remark: "" }), ...patch } }));

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!changed.length) {
      notify("Nothing has changed.");
      return;
    }
    setSaving(true);
    setErr(null);
    const failed: string[] = [];
    for (const s of changed) {
      const d = draft[s.user_id];
      try {
        await api.post("/api/v1/school/staff-attendance/override", { user_id: s.user_id, date: day, status: d.status, remark: d.remark.trim() || null });
      } catch (x) {
        failed.push(`${s.full_name}: ${errorText(x)}`);
      }
    }
    setSaving(false);
    records.reload();
    if (failed.length) setErr(`Not saved — ${failed.join("; ")}`);
    else {
      setSavedAt(new Date().toISOString());
      notify(`Attendance saved for ${changed.length} staff member(s).`);
    }
  }

  // The strip counts what is saved for the day, not unsaved choices.
  const saved = (st: AttendanceStatus[]) => (staff.data ?? []).filter((s) => st.includes(byUser.get(s.user_id)?.status as AttendanceStatus)).length;
  const n = (v: number) => ((staff.loading && !staff.data) || (records.loading && !records.data) ? "…" : String(v));
  const stats = [
    { label: "Active staff", value: n(staff.data?.length ?? 0), note: `${departments.length} departments` },
    { label: "Present", value: n(saved(["present", "late"])), note: `${saved(["late"])} came late` },
    { label: "Absent", value: n(saved(["absent"])), note: "Saved for the day" },
    { label: "On leave", value: n(saved(["on_leave", "sick", "holiday"])), note: `${(staff.data ?? []).filter((s) => !byUser.has(s.user_id)).length} not marked yet` },
  ];

  const longDay = day ? new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <form id="staff-register" onSubmit={save}>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <select aria-label="Filter by department" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={only} onChange={(e) => setOnly(e.target.value)}>
          <option value="">All statuses</option>
          <option value="unmarked">Not marked</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        <input type="date" aria-label="Register date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} />
      </div>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>Check-ins come from the staff app. Choose a status to record or correct a day, then save the register; a changed row is saved as an override.</span>
      </div>
      <ErrorNote>{err ?? staff.error ?? records.error}</ErrorNote>
      <Panel
        title="Staff register"
        sub={longDay}
        action={
          <button
            type="button"
            className="btn"
            onClick={() => rows.forEach((s) => !draft[s.user_id]?.status && set(s.user_id, { status: "present" }))}
          >
            <Icon name="check" className="sm" />
            Mark unmarked present
          </button>
        }
        flush
      >
        <div className="approval-summary">
          <strong>
            {`${count(["present"])} Present   ${count(["absent"])} Absent   ${count(["late"])} Late   ${count(["on_leave", "sick", "holiday"])} Leave`}
          </strong>
          <span>{staff.loading || records.loading ? "Loading…" : `${staff.data?.length ?? 0} staff · ${unmarked} not marked`}</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Employee no.</th>
                <th>Status</th>
                <th>Check-in</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => {
                const r = byUser.get(s.user_id);
                const d = draft[s.user_id] ?? { status: "", remark: "" };
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="person">
                        <span className={`avatar ${AVATAR_TONES[i % 4]}`}>{initials(s.full_name)}</span>
                        <div>
                          {s.full_name}
                          <small>{[label(s.role), s.department_name].filter((x) => x && x !== "—").join(" · ")}</small>
                        </div>
                      </div>
                    </td>
                    <td>{s.employee_no}</td>
                    <td>
                      <select
                        className={`attendance-choice ${d.status ? TONE[d.status] : ""}`}
                        aria-label={`Attendance for ${s.full_name}`}
                        value={d.status}
                        onChange={(e) => set(s.user_id, { status: e.target.value as AttendanceStatus | "" })}
                      >
                        <option value="" disabled>
                          Not marked
                        </option>
                        {STATUSES.map((x) => (
                          <option key={x} value={x}>
                            {label(x)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{r?.check_in_at ? `${clock(r.check_in_at)}${r.check_out_at ? ` – ${clock(r.check_out_at)}` : ""}` : "—"}</td>
                    <td>
                      <input
                        className="marks-input"
                        style={{ width: "180px", textAlign: "left" }}
                        placeholder={r?.manually_overridden ? "Overridden" : "Add a note"}
                        aria-label={`Attendance note for ${s.full_name}`}
                        maxLength={300}
                        value={d.remark}
                        onChange={(e) => set(s.user_id, { remark: e.target.value })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={rows.length > 0}>
          {staff.loading ? "Loading staff…" : "No staff match these filters."}
        </div>
      </Panel>
      <div className="form-footer" style={{ border: "0", background: "transparent" }}>
        <span>{savedAt ? `Last saved ${clock(savedAt)}` : changed.length ? `${changed.length} unsaved change(s)` : "No unsaved changes"}</span>
        <button type="submit" className="btn primary" disabled={saving}>
          <Icon name="check" className="sm" />
          {saving ? "Saving…" : "Save attendance"}
        </button>
      </div>
    </form>
  );
}
