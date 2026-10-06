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
import type { Collection, Defaulter, DuesAgeing, PickedStudent, StudentFee } from "./types";

/** A year back, so a student's recent receipts are not cut at the 1st of the month. */
function yearAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * SCR-158, live. Pick a student, pick one of their unpaid fees
 * (GET /school/fees/student-fees?student_id=&status=outstanding: due and overdue) and record money
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
  const fees = useApi<Paginated<StudentFee>>(sid ? "/api/v1/school/fees/student-fees" : null, { student_id: sid, status: "outstanding", page_size: 200 });
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
    {/* the receipts column only once there is a student to show receipts for */}
    <div className={student ? "two-col" : "stack"}>
      <div className="stack">
        <Panel title={student ? "Student account" : "Who owes"} sub={student ? undefined : "Most overdue first. Pick one, or type a name below."}>
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
              <div className="row" style={{ gap: 16 }}>
                <Link className="btn text" href={`${routeOf(161)}?id=${student.id}`}>
                  Open ledger
                </Link>
                <button type="button" className="btn text" onClick={() => { setStudent(null); setFeeId(null); setAmount(""); }}>
                  Back to who owes
                </button>
              </div>
            </>
          ) : (
            presetStudent.loading ? (
              <p className="muted small">Loading the student…</p>
            ) : (
              <WhoOwes
                onPick={(d) => {
                  setPresetDone(true);
                  setStudent({ id: d.student_id, full_name: d.student_name, admission_no: d.admission_no, section_label: d.section_label });
                  setFeeId(null);
                  setError(null);
                }}
              />
            )
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
      {student ? (
      <aside className="stack">
        <Panel title="Recent receipts" sub={student.full_name}>
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
          {!recent.length ? <p className="muted small">{receipts.loading ? "Loading…" : "No receipts in the last year."}</p> : null}
        </Panel>
      </aside>
      ) : null}
    </div>
    </>
  );
}

/**
 * Before a student is chosen: everyone with fees due, most overdue first
 * (GET /analytics/dues-ageing, as on Outstanding dues), with search and a
 * class filter. Collect picks the student for the form below.
 */
function WhoOwes({ onPick }: { onPick: (d: Defaulter) => void }) {
  const dues = useApi<DuesAgeing>("/api/v1/school/analytics/dues-ageing");
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [all, setAll] = useState(false);
  const list = dues.data?.defaulters ?? [];
  const classes = Array.from(new Set(list.map((x) => x.section_label).filter((x): x is string => Boolean(x)))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const term = q.trim().toLowerCase();
  const shown = list
    .filter((x) => (!term || `${x.student_name} ${x.admission_no}`.toLowerCase().includes(term)) && (!cls || x.section_label === cls))
    .sort((a, b) => b.oldest_days - a.oldest_days || Number(b.owed) - Number(a.owed));
  const SHORT = 6;
  if (dues.loading && !dues.data) return <p className="muted small">Loading who owes…</p>;
  if (dues.error) return <ErrorNote>{dues.error}</ErrorNote>;
  if (!list.length) return <p className="muted small">Nobody owes the school anything right now.</p>;
  return (
    <div className="who-owes">
      <div className="who-owes-filters">
        <input type="search" placeholder="Search name or admission no." aria-label="Search who owes" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Class" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="muted small">{`${shown.length} of ${list.length} · ${money(dues.data!.total)} in all`}</span>
      </div>
      <table className="data-table who-owes-table">
        <tbody>
          {(all ? shown : shown.slice(0, SHORT)).map((d) => (
            <tr key={d.student_id}>
              <td>
                {d.student_name}
                <small className="muted" style={{ display: "block", fontWeight: 500 }}>{[d.section_label, d.admission_no].filter(Boolean).join(" · ")}</small>
              </td>
              <td className="num">{money(d.owed)}</td>
              <td>{d.oldest_days > 0 ? <span className="badge warn">{`${d.oldest_days} days overdue`}</span> : <span className="badge neutral">Not yet due</span>}</td>
              <td className="num">
                <button type="button" className="btn" onClick={() => onPick(d)}>
                  Collect
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length > SHORT ? (
        <button type="button" className="btn text" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${shown.length}`}
        </button>
      ) : null}
      {!shown.length ? <p className="muted small">No one matches.</p> : null}
    </div>
  );
}
