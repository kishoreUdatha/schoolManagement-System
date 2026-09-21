"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, initials } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Modal, StudentSearch, statusLabel, usePageAction, useSchoolDay } from "./shared";
import { EV, STATUSES, type Correction, type StudentHit } from "./types";

const TONES = ["mint", "", "peach", "lilac"];
const STATE: Record<string, string> = { pending: "Pending", approved: "Approved", rejected: "Refused" };
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/**
 * SCR-113, live: asking for a register mark to change, and agreeing to it.
 * GET /school/attendance-ops/corrections?state, POST …/corrections,
 * POST …/corrections/{id}/decide. Only an approved request moves the
 * register, and the server refuses a decision by the person who asked.
 */
export function Corrections() {
  const [state, setState] = useState("");
  const [typed, setTyped] = useState("");
  const [section, setSection] = useState("");
  const list = useApi<Correction[]>("/api/v1/school/attendance-ops/corrections", { state });
  const [picked, setPicked] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => {
    const order: Record<string, number> = { pending: 0, approved: 1, rejected: 1 };
    return [...(list.data ?? [])].sort((a, b) => order[a.status] - order[b.status] || b.created_at.localeCompare(a.created_at));
  }, [list.data]);
  const sections = [...new Set(all.map((c) => c.section_label).filter(Boolean))] as string[];
  const q = typed.trim().toLowerCase();
  const rows = all.filter((c) => (!section || c.section_label === section) && (!q || `${c.student_name} ${c.admission_no}`.toLowerCase().includes(q)));
  const pending = all.filter((c) => c.status === "pending");
  const oldest = pending.reduce<Correction | null>((o, c) => (!o || c.created_at < o.created_at ? c : o), null);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const current = all.find((c) => c.id === picked) ?? pending[0] ?? null;
  const history = all.filter((c) => c.decided_at).sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? "")).slice(0, 5);

  const stats = [
    { label: "Awaiting review", value: String(pending.length), note: "Among the requests shown" },
    { label: "Approved this week", value: String(all.filter((c) => c.status === "approved" && c.decided_at && new Date(c.decided_at).getTime() >= weekAgo).length), note: "Last seven days" },
    { label: "Refused", value: String(all.filter((c) => c.status === "rejected").length), note: "The register was left alone" },
    { label: "Oldest request", value: oldest ? `${daysSince(oldest.created_at)} days` : "—", note: oldest ? `Submitted ${date(oldest.created_at)}` : "Nothing waiting" },
  ];

  async function decide(c: Correction, approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/attendance-ops/corrections/${c.id}/decide`, { approve, note: note.trim() || null });
      notify(approve ? "Approved — the register has been changed." : "Refused. The register is unchanged.");
      setNote("");
      setPicked(null);
      list.reload();
    } catch (e) {
      // Shown as sent: the useful case is "somebody else has to agree".
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  // The page head's "Approve correction" acts on the request under review.
  usePageAction(EV.approveCorrection, () => {
    if (current?.status === "pending") decide(current, true);
    else setError("There is no pending correction to approve.");
  });

  // Asking for a correction
  const schoolDay = useSchoolDay();
  const [asking, setAsking] = useState(false);
  const [student, setStudent] = useState<StudentHit | null>(null);
  const [form, setForm] = useState({ date: "", to_status: "present", reason: "" });
  async function ask() {
    if (!student) return setError("Choose the student.");
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/school/attendance-ops/corrections", { student_id: student.id, date: form.date || schoolDay, to_status: form.to_status, reason: form.reason.trim() });
      notify("Asked for. Somebody else has to agree before the register moves.");
      setAsking(false);
      setStudent(null);
      setForm({ date: "", to_status: "present", reason: "" });
      list.reload();
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
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search attendance correction…" aria-label="Search records" />
        </div>
        <select aria-label="Filter by section" value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">All classes</option>
          {sections.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select aria-label="Filter status" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Refused</option>
        </select>
        <button type="button" className="btn" onClick={() => setAsking(true)}>
          <Icon name="plus" className="sm" />
          Ask for a correction
        </button>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <div className="two-col">
        <div className="panel">
          <div className="approval-summary">
            <strong>{state === "pending" ? "Requests awaiting approval" : "Correction requests"}</strong>
            <span>{list.loading ? "Loading…" : `${rows.length} shown`}</span>
          </div>
          {rows.map((c, i) => (
            <article className="request-card" key={c.id}>
              <span className={`avatar ${TONES[i % 4]}`}>{initials(c.student_name ?? "?")}</span>
              <div className="request-info">
                <h3>{c.student_name ?? "Student"}</h3>
                <p>{`Date: ${date(c.date)} · Recorded status: ${statusLabel(c.from_status)} · Requested status: ${statusLabel(c.to_status)}`}</p>
                <p>{`Submitted ${date(c.created_at)} · Requested by ${c.requested_by ?? "—"}${c.section_label ? ` · ${c.section_label}` : ""}`}</p>
                <p>{c.reason}</p>
              </div>
              <div className="actions">
                <Badge>{STATE[c.status] ?? c.status}</Badge>
                <button type="button" className="btn" onClick={() => setPicked(c.id)}>
                  Review
                </button>
                {c.status === "pending" ? (
                  <button type="button" className="btn primary" disabled={busy} onClick={() => decide(c, true)}>
                    <Icon name="check" className="sm" />
                    Approve
                  </button>
                ) : null}
              </div>
            </article>
          ))}
          {!rows.length && !list.loading ? <div className="panel-pad muted">Nobody has asked for a correction{state ? " in this state" : ""}.</div> : null}
        </div>
        <aside className="stack">
          <Panel title="Review" sub={current ? `${current.student_name ?? "Student"} · ${date(current.date)}` : undefined}>
            {current ? (
              <>
                <dl className="kv">
                  <div>
                    <dt>Change</dt>
                    <dd>{`${statusLabel(current.from_status)} → ${statusLabel(current.to_status)}`}</dd>
                  </div>
                  <div>
                    <dt>Reason</dt>
                    <dd>{current.reason}</dd>
                  </div>
                  <div>
                    <dt>Asked by</dt>
                    <dd>{current.requested_by ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{STATE[current.status] ?? current.status}</dd>
                  </div>
                  {current.decided_by ? (
                    <div>
                      <dt>Decided by</dt>
                      <dd>{`${current.decided_by}${current.decision_note ? ` · ${current.decision_note}` : ""}`}</dd>
                    </div>
                  ) : null}
                </dl>
                {current.status === "pending" ? (
                  <>
                    <label className="field" style={{ marginTop: 14 }}>
                      <span>Note (optional)</span>
                      <textarea value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Why it was agreed or refused" />
                    </label>
                    <div className="row" style={{ marginTop: 12, gap: 8 }}>
                      <button type="button" className="btn primary" disabled={busy} onClick={() => decide(current, true)}>
                        <Icon name="check" className="sm" />
                        Approve
                      </button>
                      <button type="button" className="btn" disabled={busy} onClick={() => decide(current, false)}>
                        Refuse
                      </button>
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <p className="muted">Nothing is waiting for a decision.</p>
            )}
          </Panel>
          <Panel title="Approval history">
            {history.length ? (
              history.map((c) => (
                <div className="timeline-item" key={c.id}>
                  <span className="timeline-dot">
                    <Icon name={c.status === "approved" ? "check" : "file"} />
                  </span>
                  <div>
                    <h4>{`${c.student_name ?? "Student"} · ${STATE[c.status]}`}</h4>
                    <p>{`${c.decided_by ?? "—"} · ${statusLabel(c.from_status)} → ${statusLabel(c.to_status)}`}</p>
                  </div>
                  <time>{date(c.decided_at).slice(0, 6)}</time>
                </div>
              ))
            ) : (
              <p className="muted">No decisions yet.</p>
            )}
          </Panel>
        </aside>
      </div>
      <Modal
        open={asking}
        title="Ask for a correction"
        onClose={() => setAsking(false)}
        footer={
          <button type="button" className="btn primary" disabled={busy || !student || form.reason.trim().length < 3} onClick={ask}>
            <Icon name="check" className="sm" />
            {busy ? "Sending…" : "Ask for correction"}
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
            Day<span className="req">*</span>
          </span>
          <input type="date" value={form.date || schoolDay || ""} max={schoolDay ?? undefined} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label className="field">
          <span>
            Should be<span className="req">*</span>
          </span>
          <select value={form.to_status} onChange={(e) => setForm({ ...form, to_status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field full">
          <span>
            Reason<span className="req">*</span>
          </span>
          <textarea value={form.reason} minLength={3} maxLength={2000} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Why the register is wrong" />
        </label>
      </Modal>
    </>
  );
}
