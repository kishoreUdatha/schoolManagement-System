"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Modal, StudentSearch, addDays, clock, usePageAction, useSchoolDay } from "./shared";
import { EV, type StudentHit, type TimesRow, type TimesWindow } from "./types";

type Event = { row: TimesRow; kind: "Late entry" | "Early exit"; time: string };

/**
 * SCR-116, live: late arrivals and early departures, recorded on the day's
 * own register entry. GET /school/attendance-ops/times?from&to,
 * PUT /school/attendance-ops/times.
 */
export function LateEarly() {
  const today = useSchoolDay();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => {
    if (today && from === null) {
      setFrom(addDays(today, -30));
      setTo(today);
    }
  }, [today, from]);
  const win = useApi<TimesWindow>(from && to ? "/api/v1/school/attendance-ops/times" : null, { from, to });

  const [typed, setTyped] = useState("");
  const [section, setSection] = useState("");
  const [kind, setKind] = useState("");
  const events: Event[] = useMemo(
    () =>
      (win.data?.rows ?? []).flatMap((r) => [
        ...(r.arrived_at ? [{ row: r, kind: "Late entry" as const, time: r.arrived_at }] : []),
        ...(r.left_at ? [{ row: r, kind: "Early exit" as const, time: r.left_at }] : []),
      ]),
    [win.data],
  );
  const sections = [...new Set(events.map((e) => e.row.section_label).filter(Boolean))] as string[];
  const q = typed.trim().toLowerCase();
  const shown = events.filter((e) => (!section || e.row.section_label === section) && (!kind || e.kind === kind) && (!q || `${e.row.student_name} ${e.row.admission_no}`.toLowerCase().includes(q)));
  const rows: Row[] = shown.map((e) => [
    { name: e.row.student_name, sub: e.row.admission_no },
    e.row.section_label ?? "—",
    e.kind,
    date(e.row.date),
    clock(e.time),
    [e.row.remark, e.row.times_in_window > 1 ? `${e.row.times_in_window} times in this window` : null].filter(Boolean).join(" · ") || "—",
    { name: e.row.authorised_by ?? "—", sub: e.row.recorded_by_name ? `Logged by ${e.row.recorded_by_name}` : undefined },
  ]);

  // The whole window, before the search and filters.
  const n = (v: number) => (!win.data ? (win.loading ? "…" : "—") : String(v));
  const stats = [
    { label: "Late entries", value: n(events.filter((e) => e.kind === "Late entry").length), note: from ? `since ${date(from)}` : "in the window" },
    { label: "Early exits", value: n(events.filter((e) => e.kind === "Early exit").length), note: "in the window" },
    { label: "Today", value: n(events.filter((e) => e.row.date === today).length), note: "late or early" },
    { label: "Repeat cases", value: n(new Set(events.filter((e) => e.row.times_in_window > 1).map((e) => e.row.student_id)).size), note: "students, more than once" },
  ];

  // Recording
  const [open, setOpen] = useState(false);
  const [student, setStudent] = useState<StudentHit | null>(null);
  const [f, setF] = useState({ date: "", arrived_at: "", left_at: "", remark: "", authorised_by: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  usePageAction(EV.recordTime, () => {
    setStudent(null);
    setF({ date: today ?? "", arrived_at: "", left_at: "", remark: "", authorised_by: "" });
    setError(null);
    setOpen(true);
  });
  async function record() {
    if (!student) return setError("Choose the student.");
    if (!f.arrived_at && !f.left_at) return setError("Give an arrival or a departure time.");
    setBusy(true);
    setError(null);
    try {
      await api.put("/api/v1/school/attendance-ops/times", {
        student_id: student.id,
        date: f.date,
        arrived_at: f.arrived_at || null,
        left_at: f.left_at || null,
        remark: f.remark.trim() || null,
        authorised_by: f.authorised_by.trim() || null,
      });
      notify("Recorded on that day's register entry.");
      setOpen(false);
      win.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  usePageAction(EV.exportTimes, () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [["Student", "Admission no.", "Class", "Type", "Date", "Time", "Remark", "Authorised by", "Times in window"], ...shown.map((e) => [e.row.student_name, e.row.admission_no, e.row.section_label ?? "", e.kind, e.row.date, e.time.slice(0, 5), e.row.remark ?? "", e.row.authorised_by ?? "", String(e.row.times_in_window)])]
      .map((r) => r.map(esc).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `late-and-early-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search late entry or early exit…" aria-label="Search records" />
        </div>
        <select aria-label="Filter by class" value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">All classes</option>
          {sections.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select aria-label="Filter by type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          <option>Late entry</option>
          <option>Early exit</option>
        </select>
        <input type="date" className="select-plain" aria-label="From" value={from ?? ""} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        <input type="date" className="select-plain" aria-label="To" value={to ?? ""} onChange={(e) => e.target.value && setTo(e.target.value)} />
      </div>
      <ErrorNote>{win.error ?? (!open ? error : null)}</ErrorNote>
      <Panel flush>
        <DataTable
          columns={["Student", "Class", "Type", "Date", "Time", "Reason", "Authorised by"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          empty={win.loading ? "Loading…" : events.length ? "No records match these filters." : "Nobody was late or left early in this window."}
        />
      </Panel>
      <Modal
        open={open}
        title="Record entry"
        onClose={() => setOpen(false)}
        footer={
          <button type="button" className="btn primary" disabled={busy || !student} onClick={record}>
            <Icon name="check" className="sm" />
            {busy ? "Saving…" : "Record entry"}
          </button>
        }
      >
        {error ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}
        <div className="field full">
          <span>
            Student<span className="req">*</span>
          </span>
          <StudentSearch value={student} onPick={setStudent} />
        </div>
        <label className="field">
          <span>
            Date<span className="req">*</span>
          </span>
          <input type="date" value={f.date} max={today ?? undefined} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </label>
        <label className="field">
          <span>Arrived at</span>
          <input type="time" value={f.arrived_at} onChange={(e) => setF({ ...f, arrived_at: e.target.value })} />
        </label>
        <label className="field">
          <span>Left at</span>
          <input type="time" value={f.left_at} onChange={(e) => setF({ ...f, left_at: e.target.value })} />
        </label>
        <label className="field full">
          <span>Reason</span>
          <input value={f.remark} maxLength={300} onChange={(e) => setF({ ...f, remark: e.target.value })} placeholder="e.g. Doctor's appointment" />
        </label>
        <label className="field full">
          <span>Authorised by</span>
          <input value={f.authorised_by} maxLength={120} onChange={(e) => setF({ ...f, authorised_by: e.target.value })} placeholder="e.g. Principal, or the parent's note" />
        </label>
      </Modal>
    </>
  );
}
