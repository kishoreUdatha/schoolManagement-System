"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText, type Paginated } from "@/lib/api";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, isoToday, monthLabel, StudentPicker, sum } from "./common";
import { useNewFlag } from "./extra";
import type { Cheque, ChequeStatus, FeeHead, PickedStudent, StudentFee } from "./types";

type Action = "deposit" | "clear" | "bounce" | "return";

const STATUS: Record<ChequeStatus, string> = { received: "Received", deposited: "Deposited", cleared: "Cleared", bounced: "Bounced", returned: "Returned" };
const ACTIONS: Record<ChequeStatus, Action[]> = { received: ["deposit", "clear", "return"], deposited: ["clear", "bounce"], cleared: [], bounced: [], returned: [] };
const VERB: Record<Action, string> = { deposit: "Deposit", clear: "Clear", bounce: "Bounce", return: "Return" };
const PAST: Record<Action, string> = { deposit: "deposited", clear: "cleared and receipted against the fees", bounce: "marked bounced", return: "returned" };
const NOTE: Record<Action, string> = {
  deposit: "The cheque goes to the bank. A post-dated cheque cannot be deposited before its date.",
  clear: "The bank has credited it. The amount is receipted against the fees, oldest due first.",
  bounce: "The bank returned it unpaid. The fees stay owed; you can add a bounce charge.",
  return: "Hand the cheque back to the parent without depositing it.",
};

/**
 * NEW-045, live: GET /school/accounts/cheques (every cheque; counted and
 * filtered here), POST to record one against a student's pending fees
 * (GET /fees/student-fees?student_id=&status=outstanding), POST /{id}/action
 * to deposit, clear (credits the fees), bounce (optional charge under a
 * fee type) or return it.
 */
export function Cheques() {
  const list = useApi<Cheque[]>("/api/v1/school/accounts/cheques");
  const [adding, setAdding] = useNewFlag();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [acting, setActing] = useState<{ cheque: Cheque; action: Action } | null>(null);

  const all = list.data ?? [];
  const items = all.filter((c) => {
    const term = q.trim().toLowerCase();
    if (term && !`${c.student_name} ${c.cheque_no} ${c.bank_name} ${c.drawer_name ?? ""}`.toLowerCase().includes(term)) return false;
    if (status === "due") return c.due_for_deposit;
    if (status && c.status !== status) return false;
    return true;
  });
  const of = (s: ChequeStatus[]) => all.filter((c) => s.includes(c.status));
  const count = (xs: Cheque[]) => `${xs.length} cheque${xs.length === 1 ? "" : "s"}`;
  const v = (xs: Cheque[]) => (list.data ? money(sum(xs.map((c) => c.amount))) : "…");
  const received = of(["received"]);
  const due = all.filter((c) => c.due_for_deposit);
  const stats = [
    { label: "In hand", value: v(received), note: `${count(received)} · ${due.length} due for deposit` },
    { label: "In clearing", value: v(of(["deposited"])), note: `${count(of(["deposited"]))} at the bank` },
    { label: "Cleared", value: v(of(["cleared"])), note: `${count(of(["cleared"]))} receipted` },
    { label: "Bounced or returned", value: v(of(["bounced", "returned"])), note: count(of(["bounced", "returned"])) },
  ];

  const rows: Row[] = items.map((c) => [
    { name: c.student_name, sub: c.section_label ?? undefined },
    c.cheque_no,
    `${c.bank_name}${c.drawer_name ? ` · ${c.drawer_name}` : ""}`,
    date(c.cheque_date),
    money(c.amount),
    c.fees_label || "—",
    c.status === "bounced" && c.bounce_reason ? `Bounced · ${c.bounce_reason}` : c.due_for_deposit ? "Received · due for deposit" : STATUS[c.status],
  ]);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student, cheque no. or bank…" aria-label="Search cheques" />
        </div>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="due">Due for deposit</option>
          {Object.entries(STATUS).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel title="Cheques" sub={`Fee cheques from parents, by cheque date${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Student", "Cheque no.", "Bank", "Cheque date", "Amount", "Fees", "Status"]}
          rows={rows}
          actions={(i) => {
            const c = items[i];
            const acts = ACTIONS[c.status];
            if (!acts.length) return <span className="muted small">{c.cleared_on ? `Cleared ${date(c.cleared_on)}` : "—"}</span>;
            return acts.map((a) => (
              <button key={a} type="button" className={`btn ${a === "bounce" ? "danger" : ""}`} onClick={() => setActing({ cheque: c, action: a })}>
                {VERB[a]}
              </button>
            ));
          }}
          empty={list.loading ? "Loading cheques…" : q || status ? "No cheques match these filters." : undefined}
          emptyState={{
            title: "No cheques recorded yet",
            note: "Record a cheque from a parent here, then deposit, clear, bounce or return it as it moves through the bank.",
            action: (
              <button type="button" className="btn primary" onClick={() => setAdding(true)}>
                Record cheque
              </button>
            ),
          }}
        />
      </Panel>
      {adding ? (
        <NewCheque
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            list.reload();
          }}
        />
      ) : null}
      {acting ? (
        <ActionDialog
          cheque={acting.cheque}
          action={acting.action}
          onClose={() => setActing(null)}
          onSaved={() => {
            setActing(null);
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}

function NewCheque({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [f, setF] = useState({ amount: "", cheque_no: "", bank_name: "", drawer_name: "", cheque_date: isoToday(), received_on: isoToday() });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fees = useApi<Paginated<StudentFee>>(student ? "/api/v1/school/fees/student-fees" : null, { student_id: student?.id, status: "outstanding", page_size: 200 });
  const pending = fees.data?.items ?? [];
  const owed = sum(pending.filter((x) => picked.includes(x.id)).map((x) => x.amount_outstanding));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  useEffect(() => setPicked([]), [student]);
  useEffect(() => setF((x) => ({ ...x, amount: owed ? String(Math.round(owed * 100) / 100) : "" })), [owed]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!student || !picked.length) {
      setError("Choose the student and the fees this cheque pays.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/v1/school/accounts/cheques", {
        student_id: student.id,
        fee_ids: picked,
        amount: f.amount,
        cheque_no: f.cheque_no.trim(),
        bank_name: f.bank_name.trim(),
        drawer_name: f.drawer_name.trim() || null,
        cheque_date: f.cheque_date,
        received_on: f.received_on || null,
      });
      notify(`Cheque ${f.cheque_no} for ${money(f.amount)} recorded. Fees are credited when it clears.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title="Record a cheque"
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving || !picked.length}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Record cheque"}
          </button>
        </>
      }
    >
      <ErrorNote>{error ?? fees.error}</ErrorNote>
      <div className="form-grid">
        <StudentPicker value={student} onChange={setStudent} />
        <Field label="Amount (₹)" required>
          <input type="number" min={0.01} step="0.01" max={owed || undefined} value={f.amount} onChange={set("amount")} required />
        </Field>
        {student ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <p className="small strong">Fees this cheque pays</p>
            {pending.length ? (
              <div className="checklist">
                {pending.map((x) => (
                  <label key={x.id} className="check-item" style={{ padding: "10px 0" }}>
                    <input type="checkbox" checked={picked.includes(x.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, x.id] : picked.filter((id) => id !== x.id))} />
                    {`${x.fee_head_name} · ${monthLabel(x.period)} · ${money(x.amount_outstanding)} due ${date(x.due_date)}`}
                  </label>
                ))}
              </div>
            ) : (
              <p className="muted small">{fees.loading ? "Loading fees…" : "Nothing is pending for this student."}</p>
            )}
          </div>
        ) : null}
        <Field label="Cheque no." required>
          <input value={f.cheque_no} onChange={set("cheque_no")} pattern="\d{6}" inputMode="numeric" maxLength={6} title="Six digits" required placeholder="000123" />
        </Field>
        <Field label="Bank" required>
          <input value={f.bank_name} onChange={set("bank_name")} minLength={2} maxLength={120} required placeholder="State Bank of India" />
        </Field>
        <Field label="Drawer (account holder)">
          <input value={f.drawer_name} onChange={set("drawer_name")} maxLength={160} />
        </Field>
        <Field label="Cheque date" required>
          <input type="date" value={f.cheque_date} onChange={set("cheque_date")} required />
        </Field>
        <Field label="Received on">
          <input type="date" value={f.received_on} max={isoToday()} onChange={set("received_on")} />
        </Field>
      </div>
    </Dialog>
  );
}

function ActionDialog({ cheque: c, action, onClose, onSaved }: { cheque: Cheque; action: Action; onClose: () => void; onSaved: () => void }) {
  const [on, setOn] = useState(isoToday());
  const [reason, setReason] = useState("");
  const [charge, setCharge] = useState("");
  const [headId, setHeadId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heads = useApi<FeeHead[]>(action === "bounce" ? "/api/v1/school/fees/heads" : null, { active_only: true });

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const bounce = action === "bounce";
    try {
      await api.post(`/api/v1/school/accounts/cheques/${c.id}/action`, {
        action,
        on,
        bounce_reason: bounce ? reason.trim() : null,
        bounce_charge: bounce && Number(charge) > 0 ? charge : null,
        bounce_fee_head_id: bounce && Number(charge) > 0 ? Number(headId) : null,
      });
      notify(`Cheque ${c.cheque_no} ${PAST[action]}.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      title={`${VERB[action]} cheque ${c.cheque_no}`}
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`btn ${action === "bounce" ? "danger" : "primary"}`} disabled={saving}>
            {saving ? "Saving…" : VERB[action]}
          </button>
        </>
      }
    >
      <p className="muted small" style={{ marginBottom: 14 }}>{`${c.student_name} · ${money(c.amount)} · ${c.bank_name}. ${NOTE[action]}`}</p>
      <ErrorNote>{error ?? heads.error}</ErrorNote>
      <div className="form-grid">
        <Field label="Date" required>
          <input type="date" value={on} max={isoToday()} onChange={(e) => setOn(e.target.value)} required />
        </Field>
        {action === "bounce" ? (
          <>
            <Field label="Reason" required>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required placeholder="Insufficient funds" />
            </Field>
            <Field label="Bounce charge (₹)">
              <input type="number" min={0} step="0.01" value={charge} onChange={(e) => setCharge(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Charge under fee type" required={Number(charge) > 0}>
              <select value={headId} onChange={(e) => setHeadId(e.target.value)} required={Number(charge) > 0} disabled={!(Number(charge) > 0)}>
                <option value="">{Number(charge) > 0 ? "Select fee type" : "No charge"}</option>
                {heads.data?.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
