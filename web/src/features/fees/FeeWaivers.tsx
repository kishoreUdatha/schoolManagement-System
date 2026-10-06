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
import { useSession } from "@/lib/useSession";
import { Field, monthLabel, StudentPicker } from "./common";
import type { Ledger, PickedStudent, StudentFee } from "./types";

const PAGE_SIZE = 25;

const statusText = (f: StudentFee) => (f.status === "waived" ? "Waived" : f.status === "paid" ? "Paid" : f.is_overdue ? "Overdue" : Number(f.amount_paid) > 0 ? "Part paid" : "Pending");
const untouched = (f: StudentFee) => f.status === "pending" && Number(f.amount_paid) === 0;

/**
 * NEW-042, live. Charges from GET /school/fees/student-fees (student, month,
 * status; paged by the server). Adjust = PATCH /student-fees/{id} (amount,
 * due date, note), which the server allows only while nothing has been
 * collected, and lowers a charge only by up to the waiver limit for an
 * accountant. Waive = POST /student-fees/{id}/waive with the reason: done at
 * once, or above the school's limit (GET/PUT /fees/waiver-limit) sent to the
 * principal's Approval requests.
 * With a student chosen, the headline comes from GET /finance/ledger/{id}.
 */
export function FeeWaivers() {
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [adjust, setAdjust] = useState<StudentFee | null>(null);
  const [waive, setWaive] = useState<StudentFee | null>(null);

  useEffect(() => setPage(1), [student, period, status]);

  const list = useApi<Paginated<StudentFee>>("/api/v1/school/fees/student-fees", { student_id: student?.id, period, status, page, page_size: PAGE_SIZE });
  const limit = useApi<{ waiver_approval_above: string | null }>("/api/v1/school/fees/waiver-limit");
  const role = useSession()?.user.role;
  const approver = role === "school_admin" || role === "principal";
  const ledger = useApi<Ledger>(student ? `/api/v1/school/finance/ledger/${student.id}` : null);
  const items = list.data?.items ?? [];

  const rows: Row[] = items.map((f) => [
    { name: f.student_name, sub: f.section_label ?? undefined },
    `${f.fee_head_name} · ${f.fee_head_code}`,
    monthLabel(f.period),
    date(f.due_date),
    money(f.amount_due),
    money(f.amount_paid),
    money(f.status === "waived" ? 0 : f.amount_outstanding),
    statusText(f),
  ]);

  const l = ledger.data;
  const stats = l
    ? [
        { label: "Charged", value: money(l.total_charged), note: `${l.student_name} · all time` },
        { label: "Paid", value: money(l.total_paid), note: "Receipts on the ledger" },
        { label: "Waived", value: money(l.total_waived), note: "Written off" },
        { label: "Balance", value: money(l.balance), note: l.balance > 0 ? "Still owed" : "Nothing owed" },
      ]
    : null;

  const done = () => {
    setAdjust(null);
    setWaive(null);
    list.reload();
    ledger.reload();
  };

  return (
    <>
      {stats ? <StatStrip items={stats} compact /> : null}
      <WaiverLimit value={limit.data?.waiver_approval_above ?? null} loaded={Boolean(limit.data)} canEdit={role === "school_admin"} onSaved={limit.reload} />
      <Panel title="Find charges" sub="Choose a student, or leave it empty to see the whole school.">
        <div className="form-grid three">
          <StudentPicker value={student} onChange={setStudent} required={false} />
          <Field label="Month">
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="pending">Pending (can be adjusted or waived)</option>
              <option value="paid">Paid</option>
              <option value="waived">Waived</option>
            </select>
          </Field>
        </div>
      </Panel>
      <div className="gap" />
      <ErrorNote>{list.error ?? ledger.error}</ErrorNote>
      <Panel
        title={student ? `${student.full_name}'s charges` : "Charges"}
        sub={`${list.data ? `${list.data.total} charge${list.data.total === 1 ? "" : "s"}` : ""}${period ? ` · ${monthLabel(period)}` : ""}${list.loading ? " · Loading…" : ""}`}
        flush
      >
        <DataTable
          columns={["Student", "Fee head", "Month", "Due date", "Charged", "Paid", "Outstanding", "Status"]}
          rows={rows}
          total={list.data?.total}
          page={page}
          pages={list.data?.pages ?? 1}
          onPage={setPage}
          actions={(i) => {
            const f = items[i];
            if (f.status !== "pending") return <span className="muted small">—</span>;
            return (
              <>
                {untouched(f) ? (
                  <button type="button" className="btn" onClick={() => setAdjust(f)}>
                    Adjust
                  </button>
                ) : null}
                <button type="button" className="btn danger" onClick={() => setWaive(f)}>
                  Waive
                </button>
              </>
            );
          }}
          empty={list.loading ? "Loading charges…" : "No charges match. Try another month or status."}
        />
      </Panel>
      {adjust ? <AdjustDialog fee={adjust} onClose={() => setAdjust(null)} onSaved={done} /> : null}
      {waive ? <WaiveDialog limit={limit.data?.waiver_approval_above ?? null} approver={approver} fee={waive} onClose={() => setWaive(null)} onSaved={done} /> : null}
    </>
  );
}

function AdjustDialog({ fee, onClose, onSaved }: { fee: StudentFee; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(Number(fee.amount_due)));
  const [due, setDue] = useState(fee.due_date);
  const [notes, setNotes] = useState(fee.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/v1/school/fees/student-fees/${fee.id}`, { amount_due: amount, due_date: due, notes: notes.trim() || null });
      notify(`${fee.fee_head_name} ${monthLabel(fee.period)} for ${fee.student_name} corrected.`);
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
      title={`Adjust ${fee.fee_head_name} · ${monthLabel(fee.period)}`}
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Save correction"}
          </button>
        </>
      }
    >
      <p className="muted small" style={{ marginBottom: 14 }}>{`${fee.student_name}${fee.section_label ? ` · ${fee.section_label}` : ""}. A charge can be corrected only while nothing has been collected against it.`}</p>
      <ErrorNote>{error}</ErrorNote>
      <div className="form-grid">
        <Field label="Amount (₹)" required>
          <input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Due date" required>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} required />
        </Field>
        <Field label="Note" full>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="Why it changed" />
        </Field>
      </div>
    </Dialog>
  );
}

function WaiveDialog({ fee, limit, approver, onClose, onSaved }: { fee: StudentFee; limit: string | null; approver: boolean; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paid = Number(fee.amount_paid);
  // above the limit, an accountant's waiver goes to the principal
  const needsApproval = !approver && limit !== null && Number(fee.amount_outstanding) > Number(limit);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<{ status: string }>(`/api/v1/school/fees/student-fees/${fee.id}/waive`, { reason: reason.trim() });
      notify(
        r.status === "requested"
          ? `Sent to the principal: waive ${money(fee.amount_outstanding)} of ${fee.fee_head_name} for ${fee.student_name}. It stays due until approved.`
          : `${money(fee.amount_outstanding)} of ${fee.fee_head_name} ${monthLabel(fee.period)} waived for ${fee.student_name}.`,
      );
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
      title={`Waive ${fee.fee_head_name} · ${monthLabel(fee.period)}`}
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn danger" disabled={saving}>
            {saving ? "Sending…" : needsApproval ? "Send for approval" : `Waive ${money(fee.amount_outstanding)}`}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <dl className="kv">
        <div>
          <dt>Student</dt>
          <dd>{`${fee.student_name}${fee.section_label ? ` · ${fee.section_label}` : ""}`}</dd>
        </div>
        <div>
          <dt>Charged</dt>
          <dd>{`${money(fee.amount_due)} · due ${date(fee.due_date)}`}</dd>
        </div>
        <div>
          <dt>Already paid</dt>
          <dd>{money(paid)}</dd>
        </div>
        <div>
          <dt>Written off</dt>
          <dd>{money(fee.amount_outstanding)}</dd>
        </div>
      </dl>
      <div className="gap" />
      <Field label="Reason" required full>
        <input value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={200} required placeholder="e.g. Hardship: father lost his job" />
      </Field>
      {paid > 0 ? <p className="muted small">{`${money(paid)} was already collected and stays on the receipt; only the rest is written off.`}</p> : null}
      {needsApproval ? (
        <p className="tip warn" style={{ marginTop: 10 }}>
          <Icon name="shield" className="sm" />
          {`Above the school's limit of ${money(limit)}: the principal approves it under Approval requests. The fee stays due until then.`}
        </p>
      ) : null}
    </Dialog>
  );
}

/**
 * The line saying when a waiver needs the principal, and for the school
 * admin, the place to change the amount (PUT /fees/waiver-limit; empty: never).
 */
function WaiverLimit({ value, loaded, canEdit, onSaved }: { value: string | null; loaded: boolean; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!loaded) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.put("/api/v1/school/fees/waiver-limit", { waiver_approval_above: amount.trim() === "" ? null : amount });
      notify(amount.trim() === "" ? "The accountant's waivers no longer need approval." : `Waivers above ${money(amount)} now need the principal.`);
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="tip waiver-limit">
      <Icon name="shield" className="sm" />
      {editing ? (
        <form className="row" style={{ gap: 8, flexWrap: "wrap" }} onSubmit={save}>
          <span>Waivers by the accountant above ₹</span>
          <input type="number" min={0} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="no limit" aria-label="Waiver limit" />
          <span>need the principal's approval.</span>
          <button type="submit" className="btn primary">Save</button>
          <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
          <ErrorNote>{error}</ErrorNote>
        </form>
      ) : (
        <>
          <span>
            {value === null
              ? "The accountant's waivers don't need approval. Every waiver needs a reason."
              : `Every waiver needs a reason. The accountant's waivers above ${money(value)} go to the principal to approve.`}
          </span>
          {canEdit ? (
            <button type="button" className="btn text" onClick={() => { setAmount(value === null ? "" : String(Number(value))); setEditing(true); }}>
              Change
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
