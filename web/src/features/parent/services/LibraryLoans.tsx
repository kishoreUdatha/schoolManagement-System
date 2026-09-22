"use client";

/*
 * PM-051 · Library loans. Books the child has borrowed (GET …/library):
 * current loans with their due dates, fines, and returned books. "Request
 * renewal" asks the library (POST /parent/me/children/{id}/library/
 * renewal-requests); the librarian approves it under the library's rules,
 * and the request's status comes from GET /parent/me/requests.
 */

import { useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading, useChildPath } from "../support/pm";
import { ME, REQUEST_STATUS, type ParentRequest } from "../support/services";

type Loan = {
  id: number;
  title: string;
  accession_no: string;
  issued_on: string;
  due_on: string;
  returned_on: string | null;
  lost_on: string | null;
  renew_count: number;
  overdue_days: number;
  fine_amount: string;
  accruing_fine: string;
  fine_status: "none" | "pending" | "billed" | "paid" | "waived";
};

/** What is still owed on a loan: an accruing fine while overdue, else an unpaid fixed fine. */
const owed = (l: Loan) =>
  Number(l.accruing_fine) > 0 ? Number(l.accruing_fine) : l.fine_status === "pending" || l.fine_status === "billed" ? Number(l.fine_amount) : 0;

export function LibraryLoans() {
  return (
    <ChildGate>
      <Loans />
    </ChildGate>
  );
}

function Loans() {
  const { childId, notify } = useParent();
  const loans = useApi<Loan[]>(useChildPath("/library"));
  const renewals = useApi<ParentRequest[]>(childId ? `${ME}/requests` : null, { kind: "library_renewal", student_id: childId });
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function renew(l: Loan) {
    setBusy(l.id);
    setErr(null);
    try {
      await api.post(`${ME}/children/${childId}/library/renewal-requests`, { loan_id: l.id });
      notify("Renewal requested. The library will confirm the new date.");
      renewals.reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  if (loans.loading && !loans.data) return <PmLoading />;
  if (!loans.data) return <PmError>{loans.error}</PmError>;

  const current = loans.data.filter((l) => !l.returned_on && !l.lost_on);
  const past = loans.data.filter((l) => l.returned_on || l.lost_on);
  const balance = loans.data.reduce((s, l) => s + owed(l), 0);

  return (
    <>
      <PmError>{err || loans.error}</PmError>
      {current.length === 0 ? <PmEmpty title="Nothing borrowed right now">Books your child borrows from the school library will appear here.</PmEmpty> : null}
      {current.map((l) => (
        <div key={l.id} className="panel soft">
          <span className="eyebrow">CURRENTLY BORROWED</span>
          <h2>{l.title}</h2>
          <p>Copy {l.accession_no}</p>
          <dl>
            <div>
              <dt>Issued</dt>
              <dd>{date(l.issued_on)}</dd>
            </div>
            <div>
              <dt>Return by</dt>
              <dd>{date(l.due_on)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd className={l.overdue_days > 0 ? "bad" : undefined}>
                {l.overdue_days > 0 ? `Overdue by ${l.overdue_days} day${l.overdue_days === 1 ? "" : "s"}` : "On loan"}
                {l.renew_count ? ` · renewed ${l.renew_count}×` : ""}
              </dd>
            </div>
          </dl>
          <RenewalState loan={l} requests={renewals.data} busy={busy === l.id} onRenew={() => renew(l)} />
        </div>
      ))}
      <div className="item">
        <span>
          <strong>Library balance</strong>
          <small>{balance > 0 ? "Pending library charges" : "No pending library charges"}</small>
        </span>
        <span className={balance > 0 ? "value warning" : "value"}>{money(balance)}</span>
      </div>
      {past.length ? (
        <section className="section">
          <h3>Returned</h3>
          {past.map((l) => (
            <div key={l.id} className="item">
              <span>
                <strong>{l.title}</strong>
                <small>
                  {date(l.issued_on)} – {l.lost_on ? `reported lost ${date(l.lost_on)}` : date(l.returned_on)}
                </small>
              </span>
              <span className={l.lost_on ? "value bad" : "value good"}>
                {l.lost_on ? "Lost" : Number(l.fine_amount) > 0 ? `Fine ${money(l.fine_amount)} · ${label(l.fine_status)}` : "Returned"}
              </span>
            </div>
          ))}
        </section>
      ) : null}
      <p className="micro">Renewal is subject to the school library’s policy.</p>
    </>
  );
}

/** The latest renewal request for this loan, and the button to ask for one. */
function RenewalState({ loan, requests, busy, onRenew }: { loan: Loan; requests: ParentRequest[] | null; busy: boolean; onRenew: () => void }) {
  const last = (requests ?? []).find((r) => Number(r.details.loan_id) === loan.id && r.status !== "cancelled");
  const shown = last && (last.status === "pending" || last.status === "rejected") ? last : null;
  return (
    <>
      {shown ? (
        <div className="item">
          <span>
            <strong>Renewal request</strong>
            <small>
              Sent {date(shown.created_at)}
              {shown.decision_note ? ` · ${shown.decision_note}` : ""}
            </small>
          </span>
          <span className={REQUEST_STATUS[shown.status][1]}>{REQUEST_STATUS[shown.status][0]}</span>
        </div>
      ) : null}
      {shown?.status === "pending" ? null : loan.overdue_days > 0 ? (
        <p className="micro">Overdue books must be returned before they can be renewed.</p>
      ) : (
        <button className="action secondary" disabled={busy || requests === null} onClick={onRenew}>
          {busy ? "Sending…" : "Request renewal"}
        </button>
      )}
    </>
  );
}
