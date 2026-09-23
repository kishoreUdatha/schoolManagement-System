"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { Prereq } from "@/components/ui/Prereq";
import type { Paginated } from "@/lib/api";
import { api, errorText } from "@/lib/api";
import { date, initials, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, isoToday, MODES, modeLabel, StudentPicker } from "./common";
import type { Collection, PickedStudent, StudentFee } from "./types";

/** A year back, so a student's recent receipts are not cut at the 1st of the month. */
function yearAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * SCR-158, live. Pick a student, pick one of their unpaid fees
 * (GET /school/fees/student-fees?student_id=&status=pending) and record money
 * against it (POST /school/fees/student-fees/{id}/record-payment). The server
 * refuses more than is outstanding. Recent receipts come from
 * GET /school/accounts/collections?student_id=. Opens on ?student=<id>.
 */
type LedgerHead = { student_id: number; student_name: string; admission_no: string; class_name: string | null; section_name: string | null };

export function FeeCollection() {
  const params = useSearchParams();
  const preset = params.get("student");
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [feeId, setFeeId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [paidOn, setPaidOn] = useState(isoToday());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ?student= from a ledger or dues screen: look the student up by id. The
  // finance ledger names the student and, unlike the student record, is open
  // to the accountant as well as the school admin.
  const [presetDone, setPresetDone] = useState(false);
  const presetStudent = useApi<LedgerHead>(preset && !presetDone ? `/api/v1/school/finance/ledger/${preset}` : null);
  useEffect(() => {
    const p = presetStudent.data;
    if (p && !presetDone) setPresetDone(true);
    if (p && !presetDone) setStudent({ id: p.student_id, full_name: p.student_name, admission_no: p.admission_no, section_label: [p.class_name, p.section_name].filter(Boolean).join(" ") || null });
  }, [presetStudent.data, presetDone]);

  const sid = student?.id ?? null;
  const fees = useApi<Paginated<StudentFee>>(sid ? "/api/v1/school/fees/student-fees" : null, { student_id: sid, status: "pending", page_size: 200 });
  const receipts = useApi<Collection[]>(sid ? "/api/v1/school/accounts/collections" : null, { student_id: sid, from: yearAgo(), to: isoToday() });
  // nothing to collect until the school has raised fees for the year
  const raised = useApi<{ total: number }>("/api/v1/school/fees/student-fees", { page_size: 1 });

  const pending = (fees.data?.items ?? []).filter((f) => Number(f.amount_outstanding) > 0).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const fee = pending.find((f) => f.id === feeId) ?? null;

  // Default to the oldest unpaid fee, and its full outstanding amount.
  useEffect(() => {
    if (!pending.length) {
      setFeeId(null);
      return;
    }
    if (!pending.some((f) => f.id === feeId)) setFeeId(pending[0].id);
  }, [pending, feeId]);
  useEffect(() => {
    if (fee) setAmount(String(Number(fee.amount_outstanding)));
  }, [fee]);

  const totalOwed = pending.reduce((s, f) => s + Number(f.amount_outstanding), 0);
  const recent = (receipts.data ?? []).slice(0, 3);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fee) {
      setError("Choose a student with an unpaid fee.");
      return;
    }
    const n = Number(amount);
    if (!(n > 0)) {
      setError("Enter an amount above zero.");
      return;
    }
    if (n > Number(fee.amount_outstanding)) {
      setError(`That is more than the ${money(fee.amount_outstanding)} outstanding on this fee.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post<StudentFee>(`/api/v1/school/fees/student-fees/${fee.id}/record-payment`, {
        amount_paid: amount,
        payment_mode: mode,
        payment_ref: reference.trim() || null,
        paid_at: paidOn && paidOn !== isoToday() ? `${paidOn}T12:00:00` : null,
        notes: notes.trim() || null,
      });
      notify(`${money(n)} recorded against ${fee.fee_head_name} ${fee.period}.`);
      setReference("");
      setNotes("");
      fees.reload();
      receipts.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Prereq missing={raised.data?.total === 0} screen={1041} cta="Generate fees">
        No fees have been raised yet, so there is nothing to collect.
      </Prereq>
    <div className="two-col">
      <div className="stack">
        <Panel title="Student account">
          {student ? (
            <>
              <div className="person">
                <span className="avatar mint">{initials(student.full_name)}</span>
                <div>
                  {student.full_name}
                  <small>{[student.section_label, student.admission_no ? `Admission no. ${student.admission_no}` : null].filter(Boolean).join(" · ")}</small>
                </div>
              </div>
              <div className="gap" />
              <div className="payment-lines">
                {fee ? (
                  <>
                    <div>
                      <span>{`${fee.fee_head_name} · ${fee.period}`}</span>
                      <strong>{money(fee.amount_due)}</strong>
                    </div>
                    <div>
                      <span>Already paid</span>
                      <strong>{money(fee.amount_paid)}</strong>
                    </div>
                    <div className="sum">
                      <span>Outstanding on this fee</span>
                      <strong>{money(fee.amount_outstanding)}</strong>
                    </div>
                  </>
                ) : null}
                <div>
                  <span>{`All unpaid fees (${pending.length})`}</span>
                  <strong>{fees.loading && !fees.data ? "…" : money(totalOwed)}</strong>
                </div>
              </div>
              <div className="gap" />
              <Link className="btn text" href={`${routeOf(161)}?id=${student.id}`}>
                Open ledger
              </Link>
            </>
          ) : (
            <p className="muted small">{presetStudent.loading ? "Loading the student…" : "Choose a student to see what they owe."}</p>
          )}
        </Panel>
        <form id="fee-collection-form" className="panel" onSubmit={submit}>
          <div className="panel-head">
            <h2>Payment details</h2>
          </div>
          <div className="panel-body">
            <ErrorNote>{error ?? presetStudent.error ?? fees.error}</ErrorNote>
            <div className="form-grid">
              <StudentPicker
                value={student}
                onChange={(s) => {
                  setPresetDone(true);
                  setStudent(s);
                  setFeeId(null);
                  setError(null);
                }}
              />
              <Field label="Fee head" required>
                <select value={feeId ?? ""} onChange={(e) => setFeeId(Number(e.target.value))} required disabled={!pending.length}>
                  {!pending.length ? <option value="">{student ? (fees.loading ? "Loading…" : "Nothing unpaid") : "Choose a student first"}</option> : null}
                  {pending.map((f) => (
                    <option key={f.id} value={f.id}>
                      {`${f.fee_head_name} · ${f.period} · ${money(f.amount_outstanding)} due ${date(f.due_date)}${f.is_overdue ? " (overdue)" : ""}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Amount (₹)" required>
                <input type="number" min={0.01} step="0.01" max={fee ? Number(fee.amount_outstanding) : undefined} value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="Enter amount" />
              </Field>
              <Field label="Payment method" required>
                <select value={mode} onChange={(e) => setMode(e.target.value)} required>
                  {MODES.filter(([k]) => k !== "online").map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Payment date">
                <input type="date" value={paidOn} max={isoToday()} onChange={(e) => setPaidOn(e.target.value)} />
              </Field>
              <Field label="Reference">
                <input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} placeholder="UPI / cheque / transfer reference" />
              </Field>
              {/* Not wired: "Concession" at the counter — concessions are set per student on SCR-163 and reduce the fee itself. */}
              <Field label="Remarks" full>
                <textarea value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} placeholder="Enter remarks" />
              </Field>
            </div>
          </div>
          <div className="form-footer">
            <span>Amounts in INR</span>
            <button type="submit" className="btn primary" disabled={saving || !fee}>
              <Icon name="check" className="sm" />
              {saving ? "Recording…" : "Record payment"}
            </button>
          </div>
        </form>
      </div>
      <aside className="stack">
        <div className="payment-summary">
          <h3>Amount to collect</h3>
          <div className="checkout-total">{fee ? money(Number(amount) || 0) : "—"}</div>
          <p className="stat-note">{fee ? `${fee.fee_head_name} · ${fee.period}` : "Choose a fee"}</p>
          <div className="gap" />
          <dl className="kv">
            <div>
              <dt>Student</dt>
              <dd>{student?.full_name ?? "—"}</dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>{student?.section_label ?? fee?.section_label ?? "—"}</dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd>{fee ? date(fee.due_date) : "—"}</dd>
            </div>
          </dl>
        </div>
        <Panel title="Recent receipts">
          {recent.map((c) => (
            <div className="event-row" key={c.id}>
              <div className="event-content">
                <h4>
                  <Link href={`${routeOf(160)}?receipt=${c.id}`}>{c.receipt_no}</Link>
                </h4>
                <p>{`${date(c.collected_on)} · ${modeLabel(c.mode)}`}</p>
              </div>
              <strong className="small">{money(c.amount)}</strong>
            </div>
          ))}
          {!recent.length ? <p className="muted small">{!student ? "Choose a student." : receipts.loading ? "Loading…" : "No receipts in the last year."}</p> : null}
        </Panel>
      </aside>
    </div>
    </>
  );
}
