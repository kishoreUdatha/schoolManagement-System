"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { usePageAction } from "./shared";
import { EV, type StudentLeave } from "./types";

const TONES = ["mint", "", "peach", "lilac"];
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
export const leaveDates = (lv: StudentLeave) => (lv.from_date === lv.to_date ? date(lv.from_date) : `${date(lv.from_date)} – ${date(lv.to_date)}`);

/**
 * SCR-115, live: parents' leave requests for a child, decided by the class
 * teacher (their sections) or the office (all).
 * GET /school/student-leaves?status, POST /school/student-leaves/{id}/decide.
 */
export function LeaveApproval() {
  const [status, setStatus] = useState("pending");
  const [typed, setTyped] = useState("");
  const [section, setSection] = useState("");
  const list = useApi<StudentLeave[]>("/api/v1/school/student-leaves", { status });
  const [picked, setPicked] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => [...(list.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)), [list.data]);
  const sections = [...new Set(all.map((l) => l.section_label).filter(Boolean))];
  const q = typed.trim().toLowerCase();
  const rows = all.filter((l) => (!section || l.section_label === section) && (!q || `${l.student_name} ${l.reason}`.toLowerCase().includes(q)));
  const waiting = all.filter((l) => l.status === "pending");
  const mine = waiting.filter((l) => l.can_decide);
  const oldest = waiting.reduce<StudentLeave | null>((o, l) => (!o || l.created_at < o.created_at ? l : o), null);
  const current = all.find((l) => l.id === picked) ?? mine[0] ?? null;
  const history = all.filter((l) => l.decided_at).sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? "")).slice(0, 5);

  const stats = [
    { label: "Awaiting review", value: String(waiting.length), note: "Among the requests shown" },
    { label: "Yours to decide", value: String(mine.length), note: "The rest belong to another class teacher" },
    { label: "Days requested", value: String(waiting.reduce((n, l) => n + l.days, 0)), note: "Across pending requests" },
    { label: "Oldest request", value: oldest ? `${daysSince(oldest.created_at)} days` : "—", note: oldest ? `Submitted ${date(oldest.created_at)}` : "Nothing waiting" },
  ];

  async function decide(lv: StudentLeave, approve: boolean) {
    if (!approve && !note.trim()) {
      setPicked(lv.id);
      setError("Say why the leave is not approved; the parent sees the note.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/student-leaves/${lv.id}/decide`, { approve, note: note.trim() || null });
      notify(approve ? "Approved. The parent was notified." : "Rejected. The parent was notified.");
      setNote("");
      setPicked(null);
      list.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  usePageAction(EV.approveLeave, () => {
    if (current?.status === "pending" && current.can_decide) decide(current, true);
    else setError("There is no pending request of yours to approve.");
  });

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search student leave approval…" aria-label="Search records" />
        </div>
        <select aria-label="Filter by section" value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">All classes</option>
          {sections.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <div className="two-col">
        <div className="panel">
          <div className="approval-summary">
            <strong>{status === "pending" ? "Requests awaiting approval" : "Leave requests"}</strong>
            <span>{list.loading ? "Loading…" : `${rows.length} shown`}</span>
          </div>
          {rows.map((lv, i) => (
            <article className="request-card" key={lv.id}>
              <span className={`avatar ${TONES[i % 4]}`}>{initials(lv.student_name)}</span>
              <div className="request-info">
                <h3>{lv.student_name}</h3>
                <p>{`Class: ${lv.section_label} · Leave type: ${label(lv.kind)} leave · Dates: ${leaveDates(lv)} (${lv.days} ${lv.days === 1 ? "day" : "days"})`}</p>
                <p>{`Submitted ${date(lv.created_at)} · Requested by ${lv.applied_by_name ?? "parent"} · ${lv.reason}`}</p>
              </div>
              <div className="actions">
                <Badge>{label(lv.status)}</Badge>
                <button type="button" className="btn" onClick={() => setPicked(lv.id)}>
                  Review
                </button>
                {lv.status === "pending" && lv.can_decide ? (
                  <button type="button" className="btn primary" disabled={busy} onClick={() => decide(lv, true)}>
                    <Icon name="check" className="sm" />
                    Approve
                  </button>
                ) : null}
              </div>
            </article>
          ))}
          {!rows.length && !list.loading ? <div className="panel-pad muted">No leave requests here.</div> : null}
        </div>
        <aside className="stack">
          <Panel title="Review" sub={current ? `${current.student_name} · ${leaveDates(current)}` : undefined}>
            {current ? (
              <>
                <dl className="kv">
                  <div>
                    <dt>Class</dt>
                    <dd>{current.section_label}</dd>
                  </div>
                  <div>
                    <dt>Leave type</dt>
                    <dd>{label(current.kind)}</dd>
                  </div>
                  <div>
                    <dt>Days</dt>
                    <dd>{String(current.days)}</dd>
                  </div>
                  <div>
                    <dt>Reason</dt>
                    <dd>{current.reason}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{`${label(current.status)}${current.decided_by_name ? ` · ${current.decided_by_name}` : ""}${current.decision_note ? ` · ${current.decision_note}` : ""}`}</dd>
                  </div>
                </dl>
                {current.status === "pending" && current.can_decide ? (
                  <>
                    <label className="field" style={{ marginTop: 14 }}>
                      <span>Note for the parent</span>
                      <textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Optional when approving; required when rejecting" />
                    </label>
                    <div className="row" style={{ marginTop: 12, gap: 8 }}>
                      <button type="button" className="btn primary" disabled={busy} onClick={() => decide(current, true)}>
                        <Icon name="check" className="sm" />
                        Approve
                      </button>
                      <button type="button" className="btn" disabled={busy} onClick={() => decide(current, false)}>
                        Reject
                      </button>
                    </div>
                  </>
                ) : current.status === "pending" ? (
                  <p className="muted" style={{ marginTop: 12 }}>
                    This request belongs to another class teacher.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="muted">Nothing is waiting on you.</p>
            )}
          </Panel>
          <Panel title="Approval history">
            {history.length ? (
              history.map((lv) => (
                <div className="timeline-item" key={lv.id}>
                  <span className="timeline-dot">
                    <Icon name={lv.status === "approved" ? "check" : "file"} />
                  </span>
                  <div>
                    <h4>{`${lv.student_name} · ${label(lv.status)}`}</h4>
                    <p>{`${lv.decided_by_name ?? "—"} · ${leaveDates(lv)}`}</p>
                  </div>
                  <time>{date(lv.decided_at).slice(0, 6)}</time>
                </div>
              ))
            ) : (
              <p className="muted">No decisions among the requests shown.</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
