"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { ApiError, api, errorText } from "@/lib/api";
import { date as fmtDate } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { ASSIGN_EVENT } from "./events";
import { Modal, span, todayIso, useHeadEvent } from "./shared";
import type { Candidate, CoverDay, CoverSlot, StaffLite } from "./types";

import { ask } from "@/lib/dialog";
type CoverStat = { user_id: number; full_name: string; covers: number };
type MyCover = { id: number; sub_date: string; period_number: number; start_time: string; end_time: string; section_label: string; subject_name: string; absent_name: string | null; note: string | null };

/** YYYY-MM-DD shifted by whole days. */
function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d + days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

const REASON: Record<string, string> = { leave: "on leave", pending_leave: "leave pending", marked_absent: "marked absent", manual: "cover arranged" };
const STATUS: Record<Candidate["status"], string> = { free: "Available", busy_teaching: "Busy · teaching", busy_covering: "Busy · covering", on_leave: "On leave", unavailable: "Unavailable" };

/**
 * SCR-127, live: GET /school/cover/day?date=&absent= lists the lessons left by
 * absent teachers; GET /cover/candidates for a slot; POST /cover/assign
 * (force after a 409 warning), POST /cover/auto-assign, DELETE /cover/{id};
 * who has covered most (GET /cover/stats) and the viewer's own cover duties
 * (GET /cover/mine).
 */
export function CoverBoard() {
  const [date, setDate] = useState(todayIso());
  const [extra, setExtra] = useState<number[]>([]);
  const [typed, setTyped] = useState("");
  const [status, setStatus] = useState("");
  const [pick, setPick] = useState<CoverSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const day = useApi<CoverDay>("/api/v1/school/cover/day", { date, absent: extra.join(",") });
  const [rangeDays, setRangeDays] = useState(30);
  const stats = useApi<CoverStat[]>("/api/v1/school/cover/stats", { start: shiftDay(date, -rangeDays), end: date });
  const mine = useApi<MyCover[]>("/api/v1/school/cover/mine");
  const staff = useApi<StaffLite[]>("/api/v1/school/directory/staff");
  const teachers = (staff.data ?? []).filter((s) => s.role === "teacher" || s.role === "principal");
  const d = day.data;
  const absentIds = new Set(d?.absent.map((a) => a.user_id));

  const q = typed.trim().toLowerCase();
  const slots = (d?.slots ?? []).filter((s) => {
    if (status === "covered" && !s.substitute_user_id) return false;
    if (status === "open" && s.substitute_user_id) return false;
    return !q || [s.section_label, s.subject_name, s.absent_name, s.substitute_name].some((v) => v?.toLowerCase().includes(q));
  });
  const rows: Row[] = slots.map((s) => [
    fmtDate(date),
    { name: s.absent_name ?? "—", sub: REASON[s.reason] ?? s.reason },
    s.section_label,
    `Period ${s.period_number} · ${span(s.start_time, s.end_time)}`,
    s.subject_name,
    s.substitute_name ?? "Not covered",
  ]);

  const onDay = fmtDate(date);
  const strip = [
    { label: "Teachers away", value: d ? String(d.absent.length) : "…", note: onDay },
    { label: "Lessons to cover", value: d ? String(d.slots.length) : "…", note: `${d?.covered ?? 0} covered` },
    { label: "Not covered", value: d ? String(d.uncovered) : "…", note: "need a substitute" },
    { label: "Covers given", value: stats.data ? String(stats.data.reduce((t, x) => t + x.covers, 0)) : "…", note: `last ${rangeDays} days` },
  ];

  const openFirst = useCallback(() => {
    const first = day.data?.slots.find((s) => !s.substitute_user_id) ?? day.data?.slots[0];
    if (first) setPick(first);
    else notify("No lessons need cover on this day.");
  }, [day.data]);
  useHeadEvent(ASSIGN_EVENT, openFirst);

  async function autoAssign() {
    if (!(await ask("Assign a free teacher to every uncovered lesson in this view?"))) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ assigned: number }>("/api/v1/school/cover/auto-assign", { date, absent: extra });
      notify(`${r.assigned} slot(s) filled.`);
      day.reload();
      stats.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StatStrip items={strip} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search class, subject or teacher…" aria-label="Search records" />
        </div>
        <select aria-label="Also absent" value="" onChange={(e) => e.target.value && setExtra([...extra, Number(e.target.value)])}>
          <option value="">Add a teacher who is away…</option>
          {teachers
            .filter((t) => !absentIds.has(t.user_id))
            .map((t) => (
              <option key={t.user_id} value={t.user_id}>
                {t.full_name}
              </option>
            ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Not covered</option>
          <option value="covered">Covered</option>
        </select>
        <input type="date" aria-label="Date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>
      <ErrorNote>{error ?? day.error}</ErrorNote>
      {d ? (
        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {d.is_holiday ? <span className="badge warn">Holiday</span> : null}
          {d.absent.length ? (
            d.absent.map((a) => (
              <span className="badge neutral" key={a.user_id}>
                {`${a.full_name} · ${REASON[a.reason] ?? a.reason} · ${a.periods} period${a.periods === 1 ? "" : "s"}`}
                {a.reason === "marked_absent" && extra.includes(a.user_id) ? (
                  <button type="button" aria-label={`Remove ${a.full_name}`} style={{ border: 0, background: "none", cursor: "pointer" }} onClick={() => setExtra(extra.filter((x) => x !== a.user_id))}>
                    ✕
                  </button>
                ) : null}
              </span>
            ))
          ) : (
            <span className="muted small">{`Nobody is away on ${fmtDate(date)}.`}</span>
          )}
        </div>
      ) : null}
      <Panel
        title="Allocation workspace"
        sub={d ? `${d.slots.length} lessons need cover · ${d.covered} covered · ${d.uncovered} open` : "Loading…"}
        action={
          <button type="button" className="btn" disabled={busy || !d?.uncovered} onClick={autoAssign}>
            <Icon name="users" className="sm" />
            {busy ? "Assigning…" : d?.uncovered ? `Bulk assign ${d.uncovered}` : "Bulk assign"}
          </button>
        }
        flush
      >
        <DataTable
          columns={["Date", "Absent teacher", "Class", "Period", "Subject", "Substitute"]}
          rows={rows}
          selectable={false}
          onView={(i) => setPick(slots[i])}
          empty={day.loading ? "Loading…" : d?.slots.length ? "No lessons match these filters." : "No lessons need cover on this day."}
        />
      </Panel>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>Absences come from approved and pending staff leave and today&apos;s staff attendance. Add anyone else who is away above; the substitute is notified when assigned.</span>
      </div>
      <div className="gap" />
      <div className="two-col">
        <Panel
          title="Cover load"
          sub={`Lessons covered per teacher, ${fmtDate(shiftDay(date, -rangeDays))} – ${fmtDate(date)}`}
          action={
            <select aria-label="Period" value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          }
          flush
        >
          <DataTable
            columns={["Teacher", "Covers"]}
            rows={[...(stats.data ?? [])].sort((a, b) => b.covers - a.covers).map((x) => [x.full_name, String(x.covers)])}
            selectable={false}
            rowAction={false}
            empty={stats.loading ? "Loading…" : (stats.error ?? "Nobody has covered a lesson in this period.")}
          />
        </Panel>
        <Panel title="Your cover duties" sub="Lessons you are covering, from yesterday to two weeks ahead" flush>
          <DataTable
            columns={["Date", "Period", "Class", "Subject", "For"]}
            rows={(mine.data ?? []).map((c) => [fmtDate(c.sub_date), `Period ${c.period_number} · ${span(c.start_time, c.end_time)}`, c.section_label, c.subject_name, c.absent_name ?? "—"])}
            selectable={false}
            rowAction={false}
            empty={mine.loading ? "Loading…" : (mine.error ?? "You are not covering any lessons.")}
          />
        </Panel>
      </div>
      {pick ? (
        <PickSubstitute
          date={date}
          slot={pick}
          onClose={() => setPick(null)}
          onDone={(msg) => {
            setPick(null);
            notify(msg);
            day.reload();
            stats.reload();
            mine.reload();
          }}
        />
      ) : null}
    </>
  );
}

function PickSubstitute({ date, slot, onClose, onDone }: { date: string; slot: CoverSlot; onClose: () => void; onDone: (msg: string) => void }) {
  const cands = useApi<Candidate[]>("/api/v1/school/cover/candidates", { date, entry_id: slot.timetable_entry_id });
  const [note, setNote] = useState(slot.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setNote(slot.note ?? ""), [slot]);

  async function assign(userId: number | null, force = false): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/v1/school/cover/assign", {
        sub_date: date,
        timetable_entry_id: slot.timetable_entry_id,
        substitute_user_id: userId,
        note: note.trim() || null,
        force,
      });
      onDone(userId ? "Substitute assigned and notified." : "Saved as uncovered.");
    } catch (e) {
      // A 409 is a warning (busy, already covering…) the office may override.
      if (e instanceof ApiError && e.status === 409 && !force && (await ask(`${e.message}\n\nAssign anyway?`))) return assign(userId, true);
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    if (!slot.substitution_id) return;
    if (!(await ask("Remove the cover from this lesson? It goes back to uncovered."))) return;
    setSaving(true);
    try {
      await api.delete(`/api/v1/school/cover/${slot.substitution_id}`);
      onDone("Cover removed.");
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  }

  return (
    <Modal title={`Cover ${slot.section_label} · Period ${slot.period_number} ${slot.subject_name}`} onClose={onClose} wide>
      <ErrorNote>{error ?? cands.error}</ErrorNote>
      <label className="field" style={{ marginBottom: 12 }}>
        <span>Note for the substitute</span>
        <input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Revise chapter 3, worksheet on the desk" />
      </label>
      <div className="table-wrap" style={{ maxHeight: "45vh", overflow: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Teacher</th>
              <th>Status</th>
              <th>Knows class</th>
              <th>Covers this week</th>
              <th>Periods today</th>
              <th className="right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(cands.data ?? []).map((c) => (
              <tr key={c.user_id}>
                <td>
                  {c.full_name}
                  {slot.substitute_user_id === c.user_id ? <small className="muted"> (current)</small> : null}
                </td>
                <td>
                  <span className={`badge ${c.status === "free" ? "" : c.status === "on_leave" || c.status === "busy_teaching" ? "bad" : "warn"}`}>{STATUS[c.status]}</span>
                  {c.detail ? <small className="muted" style={{ display: "block" }}>{c.detail}</small> : null}
                </td>
                <td>{c.teaches_this_class ? "Yes" : "—"}</td>
                <td>{c.covers_this_week}</td>
                <td>{c.periods_today}</td>
                <td className="right">
                  <button type="button" className={`btn ${c.status === "free" ? "primary" : ""}`} disabled={saving || c.status === "on_leave"} onClick={() => assign(c.user_id)}>
                    Assign
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cands.data?.length ? <p className="muted">{cands.loading ? "Finding who is free…" : "Nobody is available for this slot."}</p> : null}
      </div>
      <div className="actions row">
        {slot.substitution_id ? (
          <button type="button" className="btn" disabled={saving} onClick={clear}>
            Clear cover
          </button>
        ) : null}
        <button type="button" className="btn" disabled={saving} onClick={() => assign(null)}>
          Leave uncovered (note only)
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
