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

type LedgerHead = { student_id: number; student_name: string; admission_no: string; class_name: string | null; section_name: string | null };
type Paid = { receipt_no: string; collection_id: number; lines: number; total: string };

/**
 * SCR-158, live: the counter. Find the student (a parent gives the name or
 * admission number; Outstanding dues is where the office looks for who owes),
 * tick the fees being paid (all of them to start with, each amount editable
 * down to a part payment) and record them on one receipt:
 * POST /school/fees/student-fees/pay. Unpaid fees from
 * GET /school/fees/student-fees?student_id=&status=outstanding; recent receipts
 * from GET /school/accounts/collections?student_id=. Opens on ?student=<id>.
 */
export function FeeCollection() {
  const params = useSearchParams();
  const preset = params.get("student");
  const [student, setStudent] = useState<PickedStudent | null>(null);
  // fee id -> the amount being paid on it; a fee not in here is not ticked
  const [paying, setPaying] = useState<Record<number, string>>({});
  const [mode, setMode] = useState("cash");
  const [paidOn, setPaidOn] = useState(isoToday());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  // paid beyond the ticked fees: kept as the student's advance, on the same receipt
  const [extra, setExtra] = useState("");
  const [usingAdvance, setUsingAdvance] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<Paid | null>(null);

  // ?student= from Outstanding dues or a ledger: look the student up by id. The
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
  const pendingKey = pending.map((f) => `${f.id}:${f.amount_outstanding}`).join(",");

  // A parent usually clears everything due: tick every unpaid fee, in full.
  useEffect(() => {
    setPaying(Object.fromEntries(pending.map((f) => [f.id, String(Number(f.amount_outstanding))])));
  }, [pendingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalOwed = pending.reduce((s, f) => s + Number(f.amount_outstanding), 0);
  const ticked = pending.filter((f) => f.id in paying);
  const total = ticked.reduce((s, f) => s + (Number(paying[f.id]) || 0), 0) + (Number(extra) || 0);
  const advance = useApi<{ balance: string }>(sid ? `/api/v1/school/accounts/advances/${sid}` : null);
  const held = Number(advance.data?.balance ?? 0);

  // pay the ticked fees from the advance, oldest first, as far as it goes
  async function useAdvance() {
    if (!student) return;
    let left = held;
    const lines: { fee_id: number; amount: string }[] = [];
    for (const f of ticked) {
      if (left <= 0) break;
      const amt = Math.min(left, Number(paying[f.id]) || 0);
      if (amt > 0) {
        lines.push({ fee_id: f.id, amount: amt.toFixed(2) });
        left -= amt;
      }
    }
    if (!lines.length) return setError("Tick the fees to pay from the advance.");
    setUsingAdvance(true);
    setError(null);
    try {
      const r = await api.post<{ used: string; balance: string }>(`/api/v1/school/accounts/advances/${student.id}/use`, { lines });
      notify(`${money(r.used)} paid from the advance. ${money(r.balance)} left in it.`);
      fees.reload();
      advance.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUsingAdvance(false);
    }
  }
  const recent = (receipts.data ?? []).slice(0, 4);

  function choose(s: PickedStudent | null) {
    setPresetDone(true);
    setStudent(s);
    setError(null);
    setPaid(null);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!student || (!ticked.length && !(Number(extra) > 0))) {
      setError(student ? "Tick at least one fee." : "Choose a student first.");
      return;
    }
    for (const f of ticked) {
      const n = Number(paying[f.id]);
      if (!(n > 0)) return setError(`Enter an amount above zero for ${f.fee_head_name}.`);
      if (n > Number(f.amount_outstanding)) return setError(`${f.fee_head_name}: that is more than the ${money(f.amount_outstanding)} outstanding.`);
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<Paid>("/api/v1/school/fees/student-fees/pay", {
        student_id: student.id,
        lines: ticked.map((f) => ({ fee_id: f.id, amount: paying[f.id] })),
        advance: Number(extra) > 0 ? extra : null,
        payment_mode: mode,
        payment_ref: reference.trim() || null,
        paid_at: paidOn && paidOn !== isoToday() ? `${paidOn}T12:00:00` : null,
        notes: notes.trim() || null,
      });
      setPaid(r);
      setExtra("");
      advance.reload();
      notify(`Receipt ${r.receipt_no}: ${money(r.total)} for ${r.lines} ${r.lines === 1 ? "fee" : "fees"}.`);
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
        <form id="fee-collection-form" className="stack" onSubmit={submit}>
          {!student ? (
            <Panel title="Find the student">
              <div className="form-grid">
                <StudentPicker value={student} onChange={choose} />
              </div>
              <p className="muted small" style={{ marginTop: 10 }}>
                {presetStudent.loading ? "Loading the student…" : "Type the name or admission number the parent gives you. "}
                {presetStudent.loading ? null : (
                  <>
                    Looking for who owes? <Link href={routeOf(162)}>Outstanding dues</Link> lists everyone, most overdue first.
                  </>
                )}
              </p>
            </Panel>
          ) : (
            <>
              {paid ? (
                <div className="tip collect-done" role="status">
                  <Icon name="check" className="sm" />
                  <span>{`Receipt ${paid.receipt_no} recorded: ${money(paid.total)} for ${paid.lines} ${paid.lines === 1 ? "fee" : "fees"}.`}</span>
                  <Link className="btn" href={`${routeOf(160)}?receipt=${paid.collection_id}`}>
                    <Icon name="file" className="sm" />
                    Print receipt
                  </Link>
                  <button type="button" className="btn" onClick={() => choose(null)}>
                    Next student
                  </button>
                </div>
              ) : null}
              <section className="panel">
                <div className="panel-head">
                  <div className="person">
                    <span className="avatar mint">{initials(student.full_name)}</span>
                    <div>
                      {student.full_name}
                      <small>{[student.section_label, student.admission_no ? `Admission no. ${student.admission_no}` : null].filter(Boolean).join(" · ")}</small>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 14 }}>
                    <Link className="btn text" href={`${routeOf(161)}?id=${student.id}`}>
                      Ledger
                    </Link>
                    <button type="button" className="btn text" onClick={() => choose(null)}>
                      Change student
                    </button>
                  </div>
                </div>
                <ErrorNote>{presetStudent.error ?? fees.error}</ErrorNote>
                {held > 0 ? (
                  <div className="tip advance-held">
                    <Icon name="money" className="sm" />
                    <span>{`${money(held)} held as advance (paid beyond what was due).`}</span>
                    {pending.length ? (
                      <button type="button" className="btn" disabled={usingAdvance || !ticked.length} onClick={useAdvance}>
                        {usingAdvance ? "Using…" : "Use it on the ticked fees"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {fees.loading && !fees.data ? (
                  <p className="muted small panel-pad">Loading their fees…</p>
                ) : pending.length ? (
                  <div className="table-wrap">
                    <table className="data-table collect-lines">
                      <thead>
                        <tr>
                          <th className="checkcell">
                            <input
                              type="checkbox"
                              aria-label="Pay every fee"
                              checked={ticked.length === pending.length}
                              onChange={(e) => setPaying(e.target.checked ? Object.fromEntries(pending.map((f) => [f.id, String(Number(f.amount_outstanding))])) : {})}
                            />
                          </th>
                          <th>Fee</th>
                          <th>Due</th>
                          <th className="num">Outstanding</th>
                          <th className="num">Paying now</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pending.map((f) => {
                          const on = f.id in paying;
                          return (
                            <tr key={f.id} className={on ? "" : "off"}>
                              <td className="checkcell">
                                <input
                                  type="checkbox"
                                  aria-label={`Pay ${f.fee_head_name} ${f.period}`}
                                  checked={on}
                                  onChange={(e) => {
                                    const next = { ...paying };
                                    if (e.target.checked) next[f.id] = String(Number(f.amount_outstanding));
                                    else delete next[f.id];
                                    setPaying(next);
                                  }}
                                />
                              </td>
                              <td>
                                {f.fee_head_name}
                                {f.fee_head_code === "PREV_DUES" ? <span className="badge warn" style={{ marginLeft: 6 }}>Previous year</span> : null}
                                <small className="muted" style={{ display: "block", fontWeight: 500 }}>{f.fee_head_code === "PREV_DUES" ? (f.notes ?? "") : f.period}</small>
                              </td>
                              <td>
                                {date(f.due_date)}
                                {f.is_overdue ? <span className="badge warn" style={{ marginLeft: 6 }}>Overdue</span> : null}
                              </td>
                              <td className="num">{money(f.amount_outstanding)}</td>
                              <td className="num">
                                <input
                                  className="collect-amount"
                                  type="number"
                                  min={0.01}
                                  step="0.01"
                                  max={Number(f.amount_outstanding)}
                                  aria-label={`Amount for ${f.fee_head_name}`}
                                  disabled={!on}
                                  value={on ? paying[f.id] : ""}
                                  onChange={(e) => setPaying({ ...paying, [f.id]: e.target.value })}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td />
                          <td colSpan={2}>{`${ticked.length} of ${pending.length} fees ticked`}</td>
                          <td className="num muted">{money(totalOwed)}</td>
                          <td className="num">
                            <strong>{money(total)}</strong>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="muted small panel-pad">{paid ? "Everything is paid up." : "Nothing unpaid for this student."}</p>
                )}
              </section>
              <section className="panel">
                <div className="panel-head">
                  <h2>Payment</h2>
                </div>
                <div className="panel-body">
                  <ErrorNote>{error}</ErrorNote>
                  <div className="form-grid">
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
                    <Field label="Remarks">
                      <input value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
                    </Field>
                    <Field label="Extra paid, kept as advance (₹)">
                      <input type="number" min={0} step="0.01" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0" />
                    </Field>
                  </div>
                </div>
                <div className="form-footer">
                  <span>
                    {ticked.length || Number(extra) > 0
                      ? `One receipt for ${ticked.length} ${ticked.length === 1 ? "fee" : "fees"}${Number(extra) > 0 ? ` and ${money(extra)} advance` : ""}`
                      : "Tick the fees being paid"}
                  </span>
                  <button type="submit" className="btn primary" disabled={saving || (!ticked.length && !(Number(extra) > 0)) || !(total > 0)}>
                    <Icon name="check" className="sm" />
                    {saving ? "Recording…" : `Record ${money(total)}`}
                  </button>
                </div>
              </section>
            </>
          )}
        </form>
        {student ? (
          <aside className="stack">
            <Panel title="Recent receipts" sub={student.full_name}>
              {recent.map((c) => (
                <div className="event-row" key={c.id}>
                  <div className="event-content">
                    <h4>
                      <Link href={`${routeOf(160)}?receipt=${c.id}`}>{c.receipt_no}</Link>
                    </h4>
                    <p>{`${date(c.collected_on)} · ${modeLabel(c.mode)}${c.lines && c.lines.length > 1 ? ` · ${c.lines.length} fees` : ""}`}</p>
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
