"use client";

import { useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, pct } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Modal, useSchoolDay } from "./shared";
import { CONTACT_METHODS, type AtRisk, type AtRiskStudent, type Contact } from "./types";

/**
 * SCR-118, live: children under the attendance threshold, next to who has
 * rung home. GET /school/attendance-ops/at-risk?below&days,
 * GET /school/attendance-ops/contacts/{student_id}, POST …/contacts.
 */
export function ChronicAbsence() {
  const [below, setBelow] = useState(75);
  const [days, setDays] = useState(120);
  const [typed, setTyped] = useState("");
  const [section, setSection] = useState("");
  const risk = useApi<AtRisk>("/api/v1/school/attendance-ops/at-risk", { below, days });

  const all = risk.data?.students ?? [];
  const sections = [...new Set(all.map((s) => s.section_label).filter(Boolean))] as string[];
  const q = typed.trim().toLowerCase();
  const items = all.filter((s) => (!section || s.section_label === section) && (!q || `${s.student_name} ${s.admission_no}`.toLowerCase().includes(q)));
  const rows: Row[] = items.map((s) => [
    { name: s.student_name, sub: s.admission_no },
    s.section_label ?? "—",
    String(s.absent_days),
    pct(s.percent),
    s.last_contact_on ? `${date(s.last_contact_on)} · ${label(s.last_contact_method)}` : "Never contacted",
    s.follow_up_on ? `${date(s.follow_up_on)}${s.follow_up_due ? " · due" : ""}` : "—",
  ]);

  const r = risk.data;
  const n = (v: number | undefined) => (v === undefined || (risk.loading && !r) ? "…" : String(v));
  const stats = [
    { label: "At risk", value: n(r?.count), note: r ? `below ${r.below}% in ${days} days` : `below ${below}%` },
    { label: "Never contacted", value: n(r?.never_contacted), note: "no call home yet" },
    { label: "Follow-ups due", value: n(r?.follow_ups_due), note: "agreed date reached" },
    { label: "Under 50%", value: n(r ? all.filter((s) => s.percent < 50).length : undefined), note: "missing half the days" },
  ];

  // One child's contact log, and recording another call home.
  const today = useSchoolDay();
  const [open, setOpen] = useState<AtRiskStudent | null>(null);
  const log = useApi<Contact[]>(open ? `/api/v1/school/attendance-ops/contacts/${open.student_id}` : null);
  const blank = { method: "phone", spoke_to: "", note: "", agreed_action: "", follow_up_on: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function record() {
    if (!open) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/school/attendance-ops/contacts", {
        student_id: open.student_id,
        method: f.method,
        note: f.note.trim(),
        spoke_to: f.spoke_to.trim() || null,
        agreed_action: f.agreed_action.trim() || null,
        follow_up_on: f.follow_up_on || null,
        contacted_on: today,
      });
      notify("Contact recorded.");
      setF(blank);
      log.reload();
      risk.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search chronic absence alerts…" aria-label="Search records" />
        </div>
        <select aria-label="Filter by class" value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">All classes</option>
          {sections.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select aria-label="Attendance below" value={below} onChange={(e) => setBelow(Number(e.target.value))}>
          {[60, 75, 85, 90].map((n) => (
            <option key={n} value={n}>{`Below ${n}%`}</option>
          ))}
        </select>
        <select aria-label="Window" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[30, 60, 90, 120, 180].map((n) => (
            <option key={n} value={n}>{`Last ${n} days`}</option>
          ))}
        </select>
      </div>
      <ErrorNote>{risk.error}</ErrorNote>
      <Panel flush>
        <DataTable
          columns={["Student", "Class", "Absent days", "Attendance", "Last contact", "Follow-up"]}
          rows={rows}
          selectable={false}
          onView={(i) => {
            setOpen(items[i]);
            setF(blank);
            setError(null);
          }}
          empty={risk.loading ? "Loading…" : all.length ? "No children match these filters." : `No child is below ${below}% in this window.`}
        />
      </Panel>
      <Modal
        open={Boolean(open)}
        title={open ? `${open.student_name} · ${pct(open.percent)}` : ""}
        onClose={() => setOpen(null)}
        footer={
          <button type="button" className="btn primary" disabled={busy || f.note.trim().length < 3} onClick={record}>
            <Icon name="check" className="sm" />
            {busy ? "Saving…" : "Record contact"}
          </button>
        }
      >
        <div style={{ gridColumn: "1 / -1" }}>
          <ErrorNote>{error ?? log.error}</ErrorNote>
          {log.data?.length ? (
            log.data.map((c) => (
              <div className="timeline-item" key={c.id}>
                <span className="timeline-dot">
                  <Icon name="message" />
                </span>
                <div>
                  <h4>{`${label(c.method)}${c.spoke_to ? ` · ${c.spoke_to}` : ""}`}</h4>
                  <p>{[c.note, c.agreed_action ? `Agreed: ${c.agreed_action}` : null, c.recorded_by].filter(Boolean).join(" · ")}</p>
                </div>
                <time>{date(c.contacted_on).slice(0, 6)}</time>
              </div>
            ))
          ) : (
            <p className="muted">{log.loading ? "Loading…" : "Nobody has contacted home about this yet."}</p>
          )}
        </div>
        <label className="field">
          <span>Method</span>
          <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
            {CONTACT_METHODS.map((m) => (
              <option key={m} value={m}>
                {label(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Spoke to</span>
          <input value={f.spoke_to} maxLength={120} onChange={(e) => setF({ ...f, spoke_to: e.target.value })} placeholder="e.g. Mother" />
        </label>
        <label className="field full">
          <span>
            What was said<span className="req">*</span>
          </span>
          <textarea value={f.note} maxLength={4000} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        <label className="field">
          <span>Agreed action</span>
          <input value={f.agreed_action} onChange={(e) => setF({ ...f, agreed_action: e.target.value })} />
        </label>
        <label className="field">
          <span>Follow up on</span>
          <input type="date" value={f.follow_up_on} onChange={(e) => setF({ ...f, follow_up_on: e.target.value })} />
        </label>
      </Modal>
    </>
  );
}
