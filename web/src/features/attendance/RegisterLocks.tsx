"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { addDays, longDay, usePageAction, useSchoolDay } from "./shared";
import { EV, type LockDayResult, type RegisterRow } from "./types";

const state = (r: RegisterRow) => (r.status === "locked" ? "Locked" : r.marked ? "Pending lock" : "Pending marking");

/**
 * NEW-030, live: every section's register for a day, and locking it so the
 * marks can no longer change. GET /api/v1/school/attendance/registers?date,
 * POST /attendance/registers/lock {section_id, date}, POST
 * /attendance/registers/lock-day?date (every marked register), POST
 * /attendance/registers/reopen {section_id, date, reason}.
 */
export function RegisterLocks() {
  const schoolDay = useSchoolDay();
  const [day, setDay] = useState<string | null>(null);
  useEffect(() => {
    if (day === null && schoolDay) setDay(schoolDay);
  }, [schoolDay, day]);

  const list = useApi<RegisterRow[]>(day ? "/api/v1/school/attendance/registers" : null, { date: day });
  const [filter, setFilter] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<number | "day" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reopening, setReopening] = useState<RegisterRow | null>(null);
  const [reason, setReason] = useState("");
  const [confirmDay, setConfirmDay] = useState(false);

  usePageAction(EV.lockDay, () => setConfirmDay(true));

  const all = list.data ?? [];
  const q = typed.trim().toLowerCase();
  const rows = useMemo(() => all.filter((r) => (!filter || state(r) === filter) && (!q || r.section_label.toLowerCase().includes(q))), [all, filter, q]);
  const marked = all.filter((r) => r.marked).length;
  const locked = all.filter((r) => r.status === "locked").length;
  const openMarked = all.filter((r) => r.marked && r.status === "open").length;

  async function lock(r: RegisterRow) {
    setBusy(r.section_id);
    setError(null);
    try {
      await api.post<RegisterRow>("/api/v1/school/attendance/registers/lock", { section_id: r.section_id, date: r.date });
      notify(`${r.section_label} locked for ${longDay(r.date)}.`);
      list.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function lockDay() {
    if (!day) return;
    setBusy("day");
    setError(null);
    try {
      const r = await api.post<LockDayResult>("/api/v1/school/attendance/registers/lock-day", {}, { date: day });
      setConfirmDay(false);
      notify(r.locked ? `${r.locked} register(s) locked; ${r.sections - r.locked} were already locked.` : "Every marked register was already locked.");
      list.reload();
    } catch (e) {
      setError(errorText(e));
      setConfirmDay(false);
    } finally {
      setBusy(null);
    }
  }

  async function reopen() {
    if (!reopening) return;
    const r = reopening;
    setBusy(r.section_id);
    setError(null);
    try {
      await api.post<RegisterRow>("/api/v1/school/attendance/registers/reopen", { section_id: r.section_id, date: r.date, reason: reason.trim() });
      notify(`${r.section_label} reopened. Teachers can correct it until it is locked again.`);
      setReopening(null);
      list.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  if (!day) return <Loading what="Working out the school's day…" />;

  const stats = [
    { label: "Sections", value: String(all.length), note: longDay(day) },
    { label: "Marked", value: String(marked), note: `${all.length - marked} not marked yet` },
    { label: "Locked", value: String(locked), note: "Marks can no longer change" },
    { label: "Marked, still open", value: String(openMarked), note: openMarked ? "Ready to lock" : "Nothing waiting" },
  ];

  const table: Row[] = rows.map((r) => [
    r.section_label,
    r.marked ? String(r.marked_count) : "—",
    r.marked ? `${r.present} / ${r.absent}` : "—",
    state(r),
    r.status === "locked" ? `${r.locked_by_name ?? "—"} · ${dateTime(r.locked_at)}` : r.marked_by_name ? `Marked by ${r.marked_by_name}` : "—",
    r.reopen_reason ? `${r.reopened_by_name ?? "Reopened"}: ${r.reopen_reason}` : "—",
  ]);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by class or section…" aria-label="Search sections" />
        </div>
        <button type="button" className="btn" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>
          ‹
        </button>
        <input type="date" className="select-plain" aria-label="Register date" value={day} max={schoolDay ?? undefined} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <button type="button" className="btn" aria-label="Next day" disabled={!!schoolDay && day >= schoolDay} onClick={() => setDay(addDays(day, 1))}>
          ›
        </button>
        <select aria-label="Filter by register state" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Every register</option>
          <option value="Pending lock">Marked, not locked</option>
          <option value="Locked">Locked</option>
          <option value="Pending marking">Not marked yet</option>
        </select>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <Panel title="Class registers" sub={`${longDay(day)}${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Section", "Students marked", "Present / absent", "Register status", "Locked by", "Reopened"]}
          rows={table}
          selectable={false}
          actions={(i) => {
            const r = rows[i];
            if (r.status === "locked")
              return (
                <button
                  type="button"
                  className="btn"
                  disabled={busy !== null}
                  onClick={() => {
                    setReopening(r);
                    setReason("");
                  }}
                >
                  Reopen
                </button>
              );
            return (
              <button type="button" className="btn primary" disabled={!r.marked || busy !== null} title={r.marked ? undefined : "Nothing has been marked for this day"} onClick={() => lock(r)}>
                {busy === r.section_id ? "Locking…" : "Lock"}
              </button>
            );
          }}
          empty={list.loading ? "Loading registers…" : q || filter ? "No registers match these filters." : "No sections set up."}
        />
      </Panel>
      <div className="gap" />
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>A locked register cannot be changed by teachers. Reopening needs a reason, which stays on the register; lock it again once it has been corrected.</span>
      </div>

      <Dialog
        open={confirmDay}
        title="Lock every marked register?"
        onClose={() => setConfirmDay(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setConfirmDay(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={lockDay} disabled={busy === "day"}>
              {busy === "day" ? "Locking…" : `Lock ${openMarked} register${openMarked === 1 ? "" : "s"}`}
            </button>
          </>
        }
      >
        <p>{`Every register marked on ${longDay(day)} and still open (${openMarked}) will be locked. Sections that have not been marked are left open.`}</p>
      </Dialog>

      <Dialog
        open={reopening !== null}
        title="Reopen this register"
        onClose={() => setReopening(null)}
        onSubmit={reopen}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setReopening(null)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={reason.trim().length < 3 || busy !== null}>
              {busy !== null ? "Reopening…" : "Reopen register"}
            </button>
          </>
        }
      >
        <p className="muted small" style={{ marginBottom: 12 }}>
          {reopening ? `${reopening.section_label} · ${longDay(reopening.date)} · locked by ${reopening.locked_by_name ?? "—"}` : ""}
        </p>
        <div className="form-grid">
          <label className="field full">
            <span>
              Reason<span className="req">*</span>
            </span>
            <textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Why the register needs correcting" required minLength={3} />
            <span className="field-hint">Kept on the register for the audit trail. At least 3 characters.</span>
          </label>
        </div>
      </Dialog>
    </>
  );
}
