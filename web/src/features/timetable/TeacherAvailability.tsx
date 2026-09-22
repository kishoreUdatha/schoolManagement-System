"use client";

import { useCallback, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Avatar, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { DAY_NAME, DAY_SHORT, Modal, span, useHeadEvent } from "./shared";
import { BLOCK_EVENT } from "./events";
import type { Block, Period, StaffLite } from "./types";

/**
 * SCR-123, live: the weekly hours a teacher cannot teach.
 * GET /school/directory/staff, /school/periods, /school/cover/unavailability;
 * POST /cover/unavailability and DELETE /cover/unavailability/{id} per slot.
 * The generator and cover both respect these blocks.
 */
export function TeacherAvailability() {
  const staff = useApi<StaffLite[]>("/api/v1/school/directory/staff");
  const periods = useApi<Period[]>("/api/v1/school/periods");
  const blocks = useApi<Block[]>("/api/v1/school/cover/unavailability");
  const [who, setWho] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<{ userId: number; day: number } | null>(null);

  const teachers = useMemo(() => (staff.data ?? []).filter((s) => s.role === "teacher" || s.role === "principal"), [staff.data]);
  const days = useMemo(() => {
    const used = new Set((periods.data ?? []).map((p) => p.day_of_week));
    return [1, 2, 3, 4, 5, 6, 7].filter((d) => used.has(d) || d <= 5);
  }, [periods.data]);
  const all = blocks.data ?? [];
  const blocksOf = (userId: number, day: number) => all.filter((b) => b.user_id === userId && b.day_of_week === day);

  const cellText = (userId: number, day: number) => {
    const mine = blocksOf(userId, day);
    if (mine.some((b) => b.period_number === null)) return "Unavailable";
    if (mine.length) return `Partly · P${mine.map((b) => b.period_number).sort((a, b) => a! - b!).join(", P")} blocked`;
    return "Available";
  };

  const rows = teachers.filter((t) => {
    if (who && String(t.user_id) !== who) return false;
    const blocked = all.some((b) => b.user_id === t.user_id);
    if (status === "available") return !blocked;
    if (status === "unavailable") return blocked;
    return true;
  });

  const wait = (staff.loading && !staff.data) || (blocks.loading && !blocks.data);
  const n = (v: number) => (wait ? "…" : String(v));
  const blockedIds = new Set(all.map((b) => b.user_id));
  const withBlocks = teachers.filter((t) => blockedIds.has(t.user_id)).length;
  const stats = [
    { label: "Teachers", value: n(teachers.length), note: "on the timetable" },
    { label: "Available all week", value: n(teachers.length - withBlocks), note: "no blocked time" },
    { label: "Has blocked time", value: n(withBlocks), note: `${all.length} weekly block${all.length === 1 ? "" : "s"}` },
    { label: "Whole days off", value: n(all.filter((b) => b.period_number === null).length), note: "every week" },
  ];

  const openFirst = useCallback(() => {
    const t = who ? Number(who) : teachers[0]?.user_id;
    if (t) setOpen({ userId: t, day: 1 });
  }, [who, teachers]);
  useHeadEvent(BLOCK_EVENT, openFirst);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <select aria-label="Teacher" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">All teachers</option>
          {teachers.map((t) => (
            <option key={t.user_id} value={t.user_id}>
              {t.full_name}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="available">Available all week</option>
          <option value="unavailable">Has blocked time</option>
        </select>
      </div>
      <ErrorNote>{staff.error ?? periods.error ?? blocks.error}</ErrorNote>
      <Panel title="Weekly availability" sub={`Recurring every week · ${all.length} block${all.length === 1 ? "" : "s"} · click a day to change it`} flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Teacher</th>
                {days.map((d) => (
                  <th key={d}>{DAY_SHORT[d]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={t.user_id}>
                  <td>
                    <div className="person">
                      <Avatar name={t.full_name} index={i} />
                      <div>{t.full_name}</div>
                    </div>
                  </td>
                  {days.map((d) => {
                    const text = cellText(t.user_id, d);
                    return (
                      <td key={d}>
                        <button
                          type="button"
                          className={`badge ${text === "Unavailable" ? "bad" : text === "Available" ? "" : "warn"}`}
                          style={{ border: 0, cursor: "pointer" }}
                          title={`Change ${t.full_name} on ${DAY_NAME[d]}`}
                          onClick={() => setOpen({ userId: t.user_id, day: d })}
                        >
                          {text}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={rows.length > 0}>
          {staff.loading ? "Loading teachers…" : "No teachers match these filters."}
        </div>
        <div className="table-footer">
          <span>{`Showing ${rows.length} of ${teachers.length} teachers`}</span>
          <span>A one-off absence belongs in staff leave; these are the hours that repeat.</span>
        </div>
      </Panel>
      {open ? (
        <DayEditor
          teacher={teachers.find((t) => t.user_id === open.userId)!}
          day={open.day}
          days={days}
          periods={(periods.data ?? []).filter((p) => !p.is_break)}
          blocks={all.filter((b) => b.user_id === open.userId)}
          onDay={(d) => setOpen({ ...open, day: d })}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            blocks.reload();
          }}
        />
      ) : null}
    </>
  );
}

/** One teacher's day: the whole day, or any of its teaching periods. */
function DayEditor({
  teacher,
  day,
  days,
  periods,
  blocks,
  onDay,
  onClose,
  onSaved,
}: {
  teacher: StaffLite;
  day: number;
  days: number[];
  periods: Period[];
  blocks: Block[];
  onDay: (d: number) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = blocks.filter((b) => b.day_of_week === day);
  const initial = useMemo(() => new Set(today.map((b) => (b.period_number === null ? "all" : String(b.period_number)))), [today]);
  const [want, setWant] = useState<Set<string> | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = want ?? initial;
  const slots = periods.filter((p) => p.day_of_week === day).sort((a, b) => a.period_number - b.period_number);

  const toggle = (k: string) => {
    const next = new Set(chosen);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setWant(next);
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      for (const b of today) {
        const k = b.period_number === null ? "all" : String(b.period_number);
        if (!chosen.has(k)) await api.delete(`/api/v1/school/cover/unavailability/${b.id}`);
      }
      for (const k of Array.from(chosen)) {
        if (initial.has(k)) continue;
        await api.post("/api/v1/school/cover/unavailability", {
          user_id: teacher.user_id,
          day_of_week: day,
          period_number: k === "all" ? null : Number(k),
          reason: reason.trim() || null,
        });
      }
      notify(`${teacher.full_name}'s ${DAY_NAME[day]} saved.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`${teacher.full_name} · ${DAY_NAME[day]}`} onClose={onClose}>
      <ErrorNote>{error}</ErrorNote>
      <div className="filterbar" style={{ marginBottom: 12 }}>
        <select
          aria-label="Day"
          value={day}
          onChange={(e) => {
            setWant(null);
            onDay(Number(e.target.value));
          }}
        >
          {days.map((d) => (
            <option key={d} value={d}>
              {DAY_NAME[d]}
            </option>
          ))}
        </select>
      </div>
      <div className="stack" style={{ gap: 8, fontSize: 13 }}>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={chosen.has("all")} onChange={() => toggle("all")} />
          <strong>Unavailable all day</strong>
        </label>
        {slots.map((p) => (
          <label className="row" key={p.id} style={{ gap: 8, opacity: chosen.has("all") ? 0.5 : 1 }}>
            <input type="checkbox" disabled={chosen.has("all")} checked={chosen.has(String(p.period_number))} onChange={() => toggle(String(p.period_number))} />
            {`${p.label ?? `Period ${p.period_number}`} · ${span(p.start_time, p.end_time)}`}
          </label>
        ))}
        {!slots.length ? <span className="muted">No teaching periods on this day.</span> : null}
        <label className="field">
          <span>Reason (for new blocks)</span>
          <input maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Coordinator duties" />
        </label>
      </div>
      <div className="actions row">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={saving} onClick={save}>
          <Icon name="check" className="sm" />
          {saving ? "Saving…" : "Save availability"}
        </button>
      </div>
    </Modal>
  );
}
