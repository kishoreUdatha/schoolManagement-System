"use client";

/*
 * PM-027 · Payments & receipts: every online attempt for the child (paid,
 * pending, cancelled, failed) and fees settled at the school counter.
 */

import { useParent } from "@/components/parent/ParentShell";
import { date, label, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { PmError, PmLoading, useGoTo } from "../comms/ui";
import { feeName, feesPath, ofChild, orderState, orderTitle, paymentsPath, type OnlineOrder, type StudentFee } from "./common";

const VALUE_CLS = { paid: "good", pending: "", cancelled: "warning", failed: "bad" };

export function PaymentsReceipts() {
  const { childId } = useParent();
  const goTo = useGoTo();
  const orders = useApi<OnlineOrder[]>(childId ? paymentsPath(childId) : null);
  const fees = useApi<StudentFee[]>(childId ? feesPath(childId) : null);

  if (!childId || orders.loading || fees.loading) return <PmLoading />;

  const online = ofChild(orders.data, childId);
  const onlineFeeIds = new Set(online.filter((o) => o.status === "paid").flatMap((o) => o.items.map((i) => i.student_fee_id)));
  // Fees paid at the counter (not through an online order here).
  const counter = ofChild(fees.data, childId)
    .filter((f) => Number(f.amount_paid) > 0 && !onlineFeeIds.has(f.id))
    .sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""));

  return (
    <>
      {/* Not wired: academic-year filter — the payments endpoint has no year parameter. */}
      <PmError>{orders.error ?? fees.error}</PmError>
      {online.map((o) => {
        const st = orderState(o);
        const when = st.key === "paid" ? `Paid ${date(o.paid_at)} · Online` : `${st.label} · started ${date(o.created_at)}`;
        return (
          <button key={o.id} className="item" onClick={() => goTo(st.key === "paid" ? 28 : 26, { order: o.id })}>
            <span>
              <strong>{orderTitle(o)}</strong>
              <small>{when}</small>
            </span>
            <span className={`value ${VALUE_CLS[st.key]}`}>{money(o.amount)}</span>
          </button>
        );
      })}
      {counter.map((f) => (
        <div key={`f${f.id}`} className="item">
          <span>
            <strong>{feeName(f)}</strong>
            <small>{`${f.status === "paid" ? "Paid" : "Part paid"}${f.paid_at ? ` ${date(f.paid_at)}` : ""} · ${f.payment_mode ? label(f.payment_mode) : "At school"}${f.payment_ref ? ` · ${f.payment_ref}` : ""}`}</small>
          </span>
          {/* Not wired: receipts for counter payments — the parent portal only serves receipts for online payments. */}
          <span className="value good">{money(f.amount_paid)}</span>
        </div>
      ))}
      {!online.length && !counter.length ? <p className="muted">No payments recorded yet.</p> : null}
      <div className="panel soft">
        <h3>Payment records</h3>
        <p>Receipts become available after the school confirms the payment. Pending payments are not counted as paid.</p>
      </div>
    </>
  );
}
