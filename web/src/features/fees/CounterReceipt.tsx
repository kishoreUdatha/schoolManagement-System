"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { askText } from "@/lib/dialog";
import { dateTime, initials, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/useApi";
import { Dialog } from "@/components/ui/Dialog";
import { DownloadButton, StudentPicker } from "./common";
import type { PickedStudent } from "./types";

type Receipt = {
  id: number;
  receipt_no: string;
  issued_at: string | null;
  collected_on: string;
  amount: string;
  amount_in_words: string;
  mode_label: string;
  reference: string | null;
  collected_by_name: string | null;
  school: { name: string; address: string | null; logo_url: string | null; campus: string | null };
  student: { id: number; name: string; admission_no: string; class_name: string | null; section_name: string | null; academic_year: string | null; campus: string | null; has_login: boolean };
  payer: { name: string | null; relation: string | null; phone: string | null };
  lines: { collection_id: number; fee_head_name: string; period: string; fee_type: string; amount: string }[];
  account: { total_demand: string; previously_paid: string; paid_to_date: string; balance: string };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const period = (p: string) => {
  if (p === "ONETIME") return "";
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  return m ? ` · ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ` · ${p}`;
};

/**
 * SCR-160 for a counter receipt (?receipt=): the receipt as the parent gets
 * it, with the student's account after it. GET /school/accounts/collections/{id}/receipt,
 * its PDF at …/receipt.pdf, and POST …/send to put it in the parents' or the
 * student's app.
 */
export function CounterReceipt({ id }: { id: string }) {
  const r = useApi<Receipt>(`/api/v1/school/accounts/collections/${id}/receipt`);
  const [sending, setSending] = useState<string | null>(null);
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = r.data;
  if (!d) return r.error ? <ErrorNote>{r.error}</ErrorNote> : <Loading what="Loading the receipt…" />;
  const s = d.student;
  const klass = [s.class_name, s.section_name].filter(Boolean).join(" ");
  const issued = d.issued_at ? dateTime(d.issued_at) : d.collected_on;

  async function send(to: "parent" | "student") {
    setSending(to);
    setError(null);
    try {
      await api.post(`/api/v1/school/accounts/collections/${id}/send`, { to });
      notify(to === "parent" ? "Receipt sent to the parents' app." : `Receipt sent to ${s.name}'s app.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(null);
    }
  }

  async function cancelReceipt() {
    const reason = await askText(
      `Cancel receipt ${d!.receipt_no} (${money(d!.amount)})? Its fees become unpaid again; a copy is kept under cancelled receipts. The school admin or principal approves an accountant's request.`,
      { placeholder: "Why, e.g. wrong student or wrong amount", required: true },
    );
    if (!reason) return;
    setError(null);
    try {
      const r = await api.post<{ status: string }>(`/api/v1/school/accounts/collections/${id}/cancel`, { reason });
      if (r.status === "cancelled") {
        notify(`Receipt ${d!.receipt_no} cancelled. Its fees are due again.`);
        router.push(routeOf(160));
      } else {
        notify(`Sent to the principal: cancel receipt ${d!.receipt_no}. It stands until approved.`);
      }
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function share() {
    const text = `${d!.school.name}: fee receipt ${d!.receipt_no} for ${s.name} — ${money(d!.amount)} received on ${issued} by ${d!.mode_label}${d!.reference ? ` (ref ${d!.reference})` : ""}. Balance ${money(d!.account.balance)}.`;
    try {
      if (navigator.share) await navigator.share({ title: `Receipt ${d!.receipt_no}`, text });
      else {
        await navigator.clipboard.writeText(text);
        notify("Receipt details copied. Paste them into a message.");
      }
    } catch {
      /* the person closed the share sheet */
    }
  }

  return (
    <div className="rc">
      <Link href={routeOf(160)} className="btn text rc-back">
        <Icon name="arrow" className="sm rc-flip" />
        Back to receipts
      </Link>
      <div className="rc-head">
        <div>
          <div className="row" style={{ gap: 12 }}>
            <h2>Payment Receipt</h2>
            <span className="rc-ok">
              <Icon name="check" className="sm" />
              Confirmed
            </span>
          </div>
          <p className="muted">{`Receipt ${d.receipt_no} · Issued ${issued}`}</p>
        </div>
        <div className="row rc-actions" style={{ gap: 10 }}>
          <DownloadButton primary path={`/api/v1/school/accounts/collections/${id}/receipt.pdf`} filename={`${d.receipt_no}.pdf`}>
            Download PDF
          </DownloadButton>
          <button type="button" className="btn" onClick={() => window.print()}>
            <Icon name="file" className="sm" />
            Print
          </button>
          <button type="button" className="btn" onClick={share}>
            <Icon name="message" className="sm" />
            Share
          </button>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>

      <article className="rc-card">
        <header className="rc-band">
          <div className="row" style={{ gap: 16 }}>
            {d.school.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.school.logo_url} alt="" className="rc-logo" />
            ) : (
              <span className="rc-logo rc-initial">{initials(d.school.name).slice(0, 1)}</span>
            )}
            <div>
              <strong>{d.school.name}</strong>
              <small>{[d.school.campus, d.school.address].filter(Boolean).join(" · ")}</small>
            </div>
          </div>
          <span className="rc-title">FEE PAYMENT RECEIPT</span>
        </header>

        <div className="rc-top">
          <div>
            <span className="rc-label">AMOUNT RECEIVED</span>
            <strong className="rc-amount">{money(d.amount)}</strong>
          </div>
          <dl className="rc-meta">
            <dt>Receipt No.</dt>
            <dd>{d.receipt_no}</dd>
            <dt>Issued</dt>
            <dd>{issued}</dd>
            <dt />
            <dd className="rc-confirmed">
              <Icon name="check" className="sm" />
              Payment confirmed
            </dd>
          </dl>
        </div>

        <div className="rc-cols">
          <section>
            <h4>STUDENT DETAILS</h4>
            <dl>
              <dt>Student:</dt>
              <dd>{s.name}</dd>
              <dt>Admission No.:</dt>
              <dd>{s.admission_no}</dd>
              <dt>Class:</dt>
              <dd>{klass || "—"}</dd>
              <dt>Academic Year:</dt>
              <dd>{s.academic_year ?? "—"}</dd>
              {s.campus ? (
                <>
                  <dt>Campus:</dt>
                  <dd>{s.campus}</dd>
                </>
              ) : null}
            </dl>
          </section>
          <section>
            <h4>PAYER DETAILS</h4>
            <dl>
              <dt>Paid by:</dt>
              <dd>{d.payer.name ? `${d.payer.name}${d.payer.relation ? ` (${d.payer.relation})` : ""}` : "—"}</dd>
              <dt>Parent Mobile:</dt>
              <dd>{d.payer.phone ?? "—"}</dd>
              <dt>Payment Mode:</dt>
              <dd>{d.mode_label}</dd>
              <dt>Transaction Reference:</dt>
              <dd>{d.reference ?? "—"}</dd>
              <dt>Collected by:</dt>
              <dd>{d.collected_by_name ?? "—"}</dd>
            </dl>
          </section>
        </div>

        <h3 className="rc-h">Payment breakdown</h3>
        <table className="rc-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Fee Type</th>
              <th className="num">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l) => (
              <tr key={l.collection_id}>
                <td>{`${l.fee_head_name}${period(l.period)}`}</td>
                <td>{l.fee_type}</td>
                <td className="num">{Number(l.amount).toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total received</td>
              <td className="num">{money(d.amount)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="rc-words">
          Amount in words: <span>{`${d.amount_in_words}.`}</span>
        </p>

        <div className="rc-account">
          <div>
            <span>Total fee demand</span>
            <strong>{money(d.account.total_demand)}</strong>
          </div>
          <div>
            <span>Previously paid</span>
            <strong>{money(d.account.previously_paid)}</strong>
          </div>
          <div>
            <span>Paid to date</span>
            <strong>{money(d.account.paid_to_date)}</strong>
          </div>
          <div className="due">
            <span>Remaining balance</span>
            <strong>{money(d.account.balance)}</strong>
          </div>
        </div>
        <p className="rc-foot">Computer-generated receipt</p>
      </article>

      <div className="rc-bottom">
        <Link href={`${routeOf(161)}?id=${s.id}`} className="btn text">
          <Icon name="file" className="sm" />
          View student fee ledger
          <Icon name="arrow" className="sm" />
        </Link>
        <div className="row" style={{ gap: 18 }}>
          <button type="button" className="btn text" disabled={sending !== null} onClick={() => send("parent")}>
            <Icon name="message" className="sm" />
            {sending === "parent" ? "Sending…" : "Send to parent"}
          </button>
          <button type="button" className="btn text" onClick={() => setMoving(true)}>
            Move to another student
          </button>
          <button type="button" className="btn text rc-cancel" onClick={cancelReceipt}>
            Cancel receipt
          </button>
          {s.has_login ? (
            <button type="button" className="btn text" disabled={sending !== null} onClick={() => send("student")}>
              <Icon name="message" className="sm" />
              {sending === "student" ? "Sending…" : "Send to student"}
            </button>
          ) : null}
        </div>
      </div>
      {moving ? (
        <MoveDialog
          receiptId={id}
          receiptNo={d.receipt_no}
          amount={d.amount}
          fromName={s.name}
          onClose={() => setMoving(false)}
          onDone={(moved) => {
            setMoving(false);
            if (moved) router.push(routeOf(160));
          }}
        />
      ) : null}
    </div>
  );
}

/** Move the payment to another student: cancelled here, recorded on their unpaid fees (the rest as their advance). */
function MoveDialog({ receiptId, receiptNo, amount, fromName, onClose, onDone }: { receiptId: string; receiptNo: string; amount: string; fromName: string; onClose: () => void; onDone: (moved: boolean) => void }) {
  const [to, setTo] = useState<PickedStudent | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!to) return setError("Choose the student it belongs to.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ status: string; receipt_no?: string; as_advance?: string }>(`/api/v1/school/accounts/collections/${receiptId}/move`, { student_id: to.id, reason });
      if (r.status === "moved") {
        notify(`Moved to ${to.full_name}: new receipt ${r.receipt_no}${Number(r.as_advance) ? `, ${money(r.as_advance)} kept as their advance` : ""}.`);
        onDone(true);
      } else {
        notify(`Sent to the principal: move receipt ${receiptNo} to ${to.full_name}.`);
        onDone(false);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={`Move receipt ${receiptNo}`}
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !to || reason.trim().length < 3}>
            {busy ? "Moving…" : "Move payment"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <p className="muted small" style={{ marginBottom: 10 }}>
        {`${money(amount)} was recorded for ${fromName}. Moving it cancels this receipt (their fees become unpaid again) and records the same money, same day and method, on the other student's unpaid fees, oldest first; anything left becomes their advance. The principal approves an accountant's move.`}
      </p>
      <div className="form-grid">
        <StudentPicker value={to} onChange={setTo} label="It belongs to" />
        <label className="field">
          <span>
            Why<span className="req">*</span>
          </span>
          <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Paid for his sister by mistake" />
        </label>
      </div>
    </Dialog>
  );
}
