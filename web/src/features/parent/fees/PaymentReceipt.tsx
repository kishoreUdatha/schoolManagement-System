"use client";

/* PM-028 · Payment receipt for a server-verified online payment (?order=), with the school's PDF. */

import { useState } from "react";
import { initialsOf, useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { PmEmpty, PmLoading, PmError, useGoTo, useQueryId } from "../comms/ui";
import { periodLabel, paymentsPath, type OnlineOrder } from "./common";

export function PaymentReceipt() {
  const { childId, notify } = useParent();
  const goTo = useGoTo();
  const orderId = useQueryId("order");
  const orders = useApi<OnlineOrder[]>(childId ? paymentsPath(childId) : null);
  const [busy, setBusy] = useState<"open" | "download" | null>(null);

  if (!childId || orders.loading) return <PmLoading />;
  if (orders.error) return <PmError>{orders.error}</PmError>;
  const o = (orders.data ?? []).find((x) => x.id === orderId && x.student_id === childId);
  if (!o || o.status !== "paid")
    return (
      <>
        <PmEmpty title="No receipt">
          {o ? "A receipt is issued only after the school confirms the payment." : "This receipt is not on the selected child’s account."}
        </PmEmpty>
        <button className="action secondary" onClick={() => (o ? goTo(26, { order: o.id }) : goTo(27))}>
          {o ? "View payment status" : "Payments & receipts"}
        </button>
      </>
    );

  const pdf = `${paymentsPath(childId)}/${o.id}/receipt.pdf`;
  async function run(kind: "open" | "download") {
    setBusy(kind);
    try {
      if (kind === "open") await api.open(pdf);
      else await api.download(pdf, `receipt-${o!.receipt_no ?? o!.id}.pdf`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="report">
        {/* Not wired: school name and logo on screen — not in the order response (the PDF carries them). */}
        <div className="report-logo">{initialsOf(o.student_name)}</div>
        <h3>PAYMENT RECEIPT</h3>
        <p>Online fee payment</p>
        <hr />
        <dl>
          <div>
            <dt>Receipt</dt>
            <dd>{o.receipt_no ?? "—"}</dd>
          </div>
          <div>
            <dt>Student</dt>
            <dd>
              <span className="child-name">{o.student_name}</span>
            </dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{dateTime(o.paid_at)}</dd>
          </div>
          {o.items.map((i) => (
            <div key={i.student_fee_id}>
              <dt>{`${i.fee_head_name} · ${periodLabel(i.period)}`}</dt>
              <dd>{money(i.applied_amount)}</dd>
            </div>
          ))}
          {Number(o.excess_amount) > 0 ? (
            <div>
              <dt>Held as credit</dt>
              <dd>{money(o.excess_amount)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Total paid</dt>
            <dd>{money(o.amount)}</dd>
          </div>
        </dl>
        <hr />
        <p className="micro">{`Transaction ${o.provider_payment_id ?? o.provider_order_id}`}</p>
      </div>
      <button className="action" disabled={busy !== null} onClick={() => run("download")}>
        {busy === "download" ? "Preparing…" : "Download receipt"}
      </button>
      <button className="action secondary" disabled={busy !== null} onClick={() => run("open")}>
        {busy === "open" ? "Opening…" : "Open receipt PDF"}
      </button>
    </>
  );
}
