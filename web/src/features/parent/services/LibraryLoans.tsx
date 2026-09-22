"use client";

/*
 * PM-051 · Library loans. Books the child has borrowed (GET …/library):
 * current loans with their due dates, fines, and returned books.
 */

import { date, label, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading, useChildPath } from "../support/pm";

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
  const loans = useApi<Loan[]>(useChildPath("/library"));

  if (loans.loading && !loans.data) return <PmLoading />;
  if (!loans.data) return <PmError>{loans.error}</PmError>;

  const current = loans.data.filter((l) => !l.returned_on && !l.lost_on);
  const past = loans.data.filter((l) => l.returned_on || l.lost_on);
  const balance = loans.data.reduce((s, l) => s + owed(l), 0);

  return (
    <>
      <PmError>{loans.error}</PmError>
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
          {/* Not wired: "Request renewal" — no parent renewal endpoint; renewals are done at the library desk. */}
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
