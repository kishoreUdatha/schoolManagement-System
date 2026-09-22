"use client";

/*
 * PM-026 · Payment status for one online order (?order=), exactly as the
 * server records it. "Paid" appears only when the server has verified the
 * payment; an unconfirmed order is pending (with a warning not to pay again),
 * and cancelled and failed are kept apart.
 */

import { useParent } from "@/components/parent/ParentShell";
import { dateTime, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { BAD_STATUS, PmEmpty, PmError, PmLoading, useGoTo, useQueryId } from "../comms/ui";
import { orderState, orderTitle, paymentsPath, type OnlineOrder } from "./common";

const TITLE = { paid: "Payment successful", pending: "Payment pending", cancelled: "Payment cancelled", failed: "Payment failed" };

export function PaymentStatus() {
  const { childId } = useParent();
  const goTo = useGoTo();
  const orderId = useQueryId("order");
  const orders = useApi<OnlineOrder[]>(childId ? paymentsPath(childId) : null);

  if (!childId || (orders.loading && !orders.data)) return <PmLoading />;
  if (orders.error) return <PmError>{orders.error}</PmError>;
  const o = (orders.data ?? []).find((x) => x.id === orderId && x.student_id === childId);
  if (!o)
    return (
      <>
        <PmEmpty title="Payment not found">This payment is not on the selected child’s account.</PmEmpty>
        <button className="action secondary" onClick={() => goTo(27)}>
          Payments & receipts
        </button>
      </>
    );

  const st = orderState(o);
  return (
    <>
      {st.key === "paid" ? (
        <div className="success-icon">✓</div>
      ) : (
        <div className="success-icon" style={st.key === "pending" ? { background: "#e3ebff", color: "var(--blue)" } : st.key === "failed" ? BAD_STATUS : { background: "#fff0d1", color: "#905d08" }}>
          {st.key === "pending" ? "…" : "!"}
        </div>
      )}
      <h1 className="center">{TITLE[st.key]}</h1>
      <p className="center">
        {st.key === "paid"
          ? "Confirmed by the school."
          : st.key === "pending"
            ? "The school has not confirmed this payment yet. If money left your account, do not pay again — the school will reconcile it."
            : st.key === "cancelled"
              ? "The payment was cancelled before it was completed. No money was taken."
              : (o.failure_reason ?? "The payment did not go through.")}
      </p>
      <div className="panel">
        <dl>
          <div>
            <dt>Amount</dt>
            <dd>{money(o.amount)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className={st.cls} style={st.style}>
                {st.label}
              </span>
            </dd>
          </div>
          <div>
            <dt>Transaction</dt>
            <dd>{o.provider_payment_id ?? o.provider_order_id}</dd>
          </div>
          <div>
            <dt>Paid for</dt>
            <dd>{orderTitle(o)}</dd>
          </div>
          <div>
            <dt>{st.key === "paid" ? "Paid" : "Started"}</dt>
            <dd>{dateTime(o.paid_at ?? o.created_at)}</dd>
          </div>
          {st.key === "paid" ? (
            <div>
              <dt>Receipt</dt>
              <dd>{o.receipt_no ?? "—"}</dd>
            </div>
          ) : null}
          {Number(o.excess_amount) > 0 ? (
            <div>
              <dt>Held as credit</dt>
              <dd>{money(o.excess_amount)}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      {st.key === "paid" ? (
        <button className="action" onClick={() => goTo(28, { order: o.id })}>
          View receipt
        </button>
      ) : st.key === "pending" ? (
        <button className="action" disabled={orders.loading} onClick={orders.reload}>
          {orders.loading ? "Checking…" : "Check again"}
        </button>
      ) : (
        <button className="action" onClick={() => goTo(24)}>
          Try again
        </button>
      )}
      <button className="action secondary" onClick={() => goTo(23)}>
        Back to fees
      </button>
    </>
  );
}
