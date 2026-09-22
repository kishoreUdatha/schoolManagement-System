"use client";

/* PM-023 · Fees: what is outstanding for the selected child, and recent online payments. */

import { useParent } from "@/components/parent/ParentShell";
import { date, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { BAD_STATUS, PmError, PmLoading, useGoTo } from "../comms/ui";
import { feeName, feesPath, ofChild, orderState, orderTitle, payableFees, paymentsPath, sum, type OnlineOrder, type StudentFee } from "./common";

const ReceiptIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 2h14v21l-3-2-4 2-4-2-3 2z" />
    <path d="M8 7h8M8 11h8M8 15h4" className="cut" />
  </svg>
);

function dueBadge(fees: StudentFee[]) {
  if (!fees.length) return <span className="status">Nothing due</span>;
  if (fees.some((f) => f.is_overdue)) return <span className="status" style={BAD_STATUS}>Overdue</span>;
  const days = (new Date(fees[0].due_date).getTime() - Date.now()) / 86_400_000;
  return days <= 7 ? <span className="status amber">Due soon</span> : <span className="status blue">Due</span>;
}

export function Fees() {
  const { childId } = useParent();
  const goTo = useGoTo();
  const fees = useApi<StudentFee[]>(childId ? feesPath(childId) : null);
  const orders = useApi<OnlineOrder[]>(childId ? paymentsPath(childId) : null);

  if (!childId || fees.loading) return <PmLoading />;
  if (fees.error) return <PmError>{fees.error}</PmError>;

  const payable = payableFees(fees.data, childId);
  const total = sum(payable);
  const recent = ofChild(orders.data, childId).slice(0, 2);

  return (
    <>
      <section className="invoice-sheet">
        <div className="between">
          <div>
            <h3>{payable.length ? "Fees due" : "All fees paid"}</h3>
            <p>{payable.length ? `Next due ${date(payable[0].due_date)}` : "Thank you."}</p>
          </div>
          {dueBadge(payable)}
        </div>
        <div className="invoice-amount">
          <div>
            <p className="payable-label">Total payable</p>
            <h1 className="invoice-total">{money(total)}</h1>
          </div>
          <span className="v-icon amber">
            <ReceiptIcon />
          </span>
        </div>
        {payable.length ? (
          <div className="invoice-lines">
            {payable.map((f) => (
              <div key={f.id}>
                <span>{`${feeName(f)}${f.is_overdue ? " · overdue" : ""}`}</span>
                <b>{money(f.amount_outstanding)}</b>
              </div>
            ))}
          </div>
        ) : null}
        {payable.length ? (
          <button className="action pay-action" onClick={() => goTo(24)}>
            <span className="v-icon white mini">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2" y="5" width="20" height="15" rx="3" />
                <path d="M2 10h20M6 15h4M14 15h4" className="cut" />
              </svg>
            </span>
            {`Pay ${money(total)} `}
            <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </section>
      <div className="section-head">
        <h3>Payment history</h3>
        <button className="quiet-link" onClick={() => goTo(27)}>
          View all
        </button>
      </div>
      <PmError>{orders.error}</PmError>
      <div className="row-group receipt-group">
        {recent.map((o, i) => {
          const st = orderState(o);
          return (
            <button key={o.id} className="payment-row" onClick={() => goTo(st.key === "paid" ? 28 : 26, { order: o.id })}>
              <span className={`v-icon ${i % 2 ? "purple" : "blue"}`}>
                <ReceiptIcon />
              </span>
              <span>
                <strong>{orderTitle(o)}</strong>
                <small>{`${date(o.paid_at ?? o.created_at)} · Online`}</small>
              </span>
              <span className="receipt-right">
                <b>{money(o.amount)}</b>
                <span className={st.cls} style={st.style}>
                  {st.label}
                </span>
              </span>
            </button>
          );
        })}
        {!recent.length && !orders.loading ? <p className="micro">No online payments yet. Payments made at the school counter are listed under View all.</p> : null}
      </div>
      <button className="help-strip" onClick={() => goTo(45)}>
        <span className="v-icon blue">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5" className="cut" />
            <circle cx="12" cy="17" r="1" className="cutfill" />
          </svg>
        </span>
        <span>
          <b>Questions about your fees?</b>
          <small>Contact school accounts</small>
        </span>
        <span className="v-icon neutral mini">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
      </button>
    </>
  );
}
