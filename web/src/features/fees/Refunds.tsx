"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { Dialog, Field, isoToday, MODES, modeLabel, StudentPicker } from "./common";
import type { PickedStudent, Refund, RefundOption } from "./types";

const TONES = ["mint", "", "peach", "lilac"];
const STATUS_LABEL: Record<Refund["status"], string> = { requested: "Pending", approved: "Approved", rejected: "Declined", processed: "Paid out" };

/**
 * SCR-165, live: GET /school/fees/refunds; POST /refunds to request one
 * (against a paid fee from /refunds/options/{student}); POST /{id}/decide to
 * approve or reject (school admin / principal; the server refuses others);
 * POST /{id}/process to record the payout with its reference.
 */
export function Refunds() {
  const sess = useSession();
  const canDecide = sess ? sess.user.role !== "accountant" : false;
  const list = useApi<Refund[]>("/api/v1/school/fees/refunds");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("requested");
  const [paying, setPaying] = useState<Refund | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = list.data ?? [];
  const count = (s: Refund["status"]) => all.filter((r) => r.status === s);
  const oldest = count("requested").reduce<string | null>((o, r) => (!o || r.created_at < o ? r.created_at : o), null);
  const n = (v: number) => (list.data ? v.toLocaleString("en-IN") : "…");
  const stats = [
    { label: "Awaiting decision", value: n(count("requested").length), note: money(count("requested").reduce((s, r) => s + Number(r.amount), 0)) + " requested" },
    { label: "Approved, to pay out", value: n(count("approved").length), note: money(count("approved").reduce((s, r) => s + Number(r.amount), 0)) + " to return" },
    // The API returns the latest 500 refunds; past that this count is a floor.
    { label: "Paid out", value: n(count("processed").length) + (all.length >= 500 ? "+" : ""), note: all.length >= 500 ? "Among the latest 500 refunds" : "Refunds completed" },
    { label: "Oldest request", value: oldest ? date(oldest) : "—", note: oldest ? "Still waiting" : "Nothing waiting" },
  ];

  const items = all.filter((r) => {
    const term = q.trim().toLowerCase();
    if (term && !`${r.student_name} ${r.fee_label ?? ""} ${r.reason}`.toLowerCase().includes(term)) return false;
    return !status || r.status === status;
  });
  const decided = all.filter((r) => r.decided_at).sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? "")).slice(0, 3);

  async function decide(r: Refund, approve: boolean) {
    const note = window.prompt(approve ? "A note for the record (optional):" : "Why is this refund being declined?");
    if (note === null) return;
    setError(null);
    try {
      await api.post(`/api/v1/school/fees/refunds/${r.id}/decide`, { approve, note: note.trim() || null });
      notify(approve ? "Refund approved." : "Refund declined.");
      list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search refunds…" aria-label="Search records" />
        </div>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="requested">Pending</option>
          <option value="approved">Approved</option>
          <option value="processed">Paid out</option>
          <option value="rejected">Declined</option>
          <option value="">All statuses</option>
        </select>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <div className="two-col">
        <div className="panel">
          <div className="approval-summary">
            <strong>{status === "requested" ? "Requests awaiting approval" : status ? `${STATUS_LABEL[status as Refund["status"]]} refunds` : "All refunds"}</strong>
            <span>{list.loading ? "Loading…" : `${items.length} shown`}</span>
          </div>
          {items.map((r, i) => (
            <article className="request-card" key={r.id}>
              <span className={`avatar ${TONES[i % 4]}`}>{initials(r.student_name)}</span>
              <div className="request-info">
                <h3>{r.student_name}</h3>
                <p>{`${r.section_label ?? "—"} · Against: ${r.fee_label ?? "not tied to a fee"} · Refund amount: ${money(r.amount)} · ${modeLabel(r.mode)}`}</p>
                <p>{`Requested ${date(r.created_at)} by ${r.requested_by_name ?? "—"} · ${r.reason}`}</p>
                {r.decided_at ? <p>{`${r.status === "rejected" ? "Declined" : "Approved"} by ${r.decided_by_name ?? "—"} ${dateTime(r.decided_at)}${r.decision_note ? ` · ${r.decision_note}` : ""}`}</p> : null}
                {r.processed_on ? <p>{`Paid out ${date(r.processed_on)}${r.reference ? ` · ref ${r.reference}` : ""}`}</p> : null}
              </div>
              <div className="actions">
                <Badge>{STATUS_LABEL[r.status]}</Badge>
                {r.status === "requested" && canDecide ? (
                  <>
                    <button type="button" className="btn" onClick={() => decide(r, false)}>
                      Decline
                    </button>
                    <button type="button" className="btn primary" onClick={() => decide(r, true)}>
                      <Icon name="check" className="sm" />
                      Approve
                    </button>
                  </>
                ) : null}
                {r.status === "approved" ? (
                  <button type="button" className="btn primary" onClick={() => setPaying(r)}>
                    <Icon name="money" className="sm" />
                    Pay out
                  </button>
                ) : null}
              </div>
            </article>
          ))}
          {!items.length && !list.loading ? <div className="panel-pad muted">No refunds match these filters.</div> : null}
        </div>
        <aside className="stack">
          <NewRefund onSaved={list.reload} />
          <Panel title="Approval history">
            {decided.map((r) => (
              <div className="timeline-item" key={r.id}>
                <span className="timeline-dot">
                  <Icon name={r.status === "rejected" ? "file" : "check"} />
                </span>
                <div>
                  <h4>{`${r.student_name} · ${money(r.amount)}`}</h4>
                  <p>{`${STATUS_LABEL[r.status]} · ${r.decided_by_name ?? "—"}`}</p>
                </div>
                <time>{date(r.decided_at)}</time>
              </div>
            ))}
            {!decided.length ? <p className="muted small">{list.loading ? "Loading…" : "No decisions yet."}</p> : null}
          </Panel>
        </aside>
      </div>
      {paying ? (
        <PayOut
          r={paying}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null);
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}

function NewRefund({ onSaved }: { onSaved: () => void }) {
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [options, setOptions] = useState<RefundOption[]>([]);
  const [f, setF] = useState({ student_fee_id: "", amount: "", reason: "", mode: "bank_transfer" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOptions([]);
    setF((x) => ({ ...x, student_fee_id: "", amount: "" }));
    if (!student) return;
    api
      .get<RefundOption[]>(`/api/v1/school/fees/refunds/options/${student.id}`)
      .then(setOptions)
      .catch((e) => setError(errorText(e)));
  }, [student]);

  const option = useMemo(() => options.find((o) => String(o.student_fee_id) === f.student_fee_id), [options, f.student_fee_id]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!student) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/v1/school/fees/refunds", {
        student_id: student.id,
        student_fee_id: f.student_fee_id ? Number(f.student_fee_id) : null,
        amount: f.amount,
        reason: f.reason.trim(),
        mode: f.mode,
      });
      notify("Refund requested. It waits for approval before it can be paid out.");
      setStudent(null);
      setF({ student_fee_id: "", amount: "", reason: "", mode: "bank_transfer" });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="aside-panel" onSubmit={save}>
      <h3>Request a refund</h3>
      <ErrorNote>{error}</ErrorNote>
      <div className="stack">
        <StudentPicker value={student} onChange={setStudent} />
        <Field label="Against which fee">
          <select
            value={f.student_fee_id}
            disabled={!student}
            onChange={(e) => {
              const o = options.find((x) => String(x.student_fee_id) === e.target.value);
              setF({ ...f, student_fee_id: e.target.value, amount: o ? String(Number(o.refundable)) : f.amount });
            }}
          >
            <option value="">Not tied to a fee</option>
            {options.map((o) => (
              <option key={o.student_fee_id} value={o.student_fee_id}>
                {`${o.label} · paid ${money(o.paid)} · up to ${money(o.refundable)}${o.receipt_no ? ` · ${o.receipt_no}` : ""}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount (₹)" required>
          <input type="number" min={0.01} step="0.01" max={option ? Number(option.refundable) : undefined} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
        </Field>
        <Field label="Pay back by" required>
          <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
            {MODES.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason" required>
          <textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} minLength={3} maxLength={2000} required />
        </Field>
        <button type="submit" className="btn primary" disabled={saving || !student}>
          <Icon name="check" className="sm" />
          {saving ? "Saving…" : "Request refund"}
        </button>
      </div>
    </form>
  );
}

function PayOut({ r, onClose, onSaved }: { r: Refund; onClose: () => void; onSaved: () => void }) {
  const [on, setOn] = useState(isoToday());
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/fees/refunds/${r.id}/process`, { processed_on: on, reference: reference.trim() || null });
      notify("Refund paid out and the parent told.");
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title={`Pay out ${money(r.amount)} to ${r.student_name}`} onClose={onClose}>
      <form onSubmit={save}>
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <Field label="Paid on" required>
            <input type="date" value={on} max={isoToday()} onChange={(e) => setOn(e.target.value)} required />
          </Field>
          <Field label={`${label(r.mode)} reference`}>
            <input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} placeholder="Transfer / cheque number" />
          </Field>
        </div>
        <div className="row actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Record payout"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
