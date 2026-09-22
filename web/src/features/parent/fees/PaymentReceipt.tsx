"use client";

/*
 * PM-028 · Payment receipt for a server-verified online payment (?order=),
 * with the school's PDF. The school's name and logo come from the caller's
 * branding (GET /api/v1/branding/me).
 */

import { useState } from "react";
import { initialsOf, useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { PmEmpty, PmLoading, PmError, useGoTo, useQueryId } from "../comms/ui";
import { BRANDING_PATH, type Branding } from "../home/parts";
import { periodLabel, paymentsPath, type OnlineOrder } from "./common";

export function PaymentReceipt() {
  const { childId, notify } = useParent();
  const goTo = useGoTo();
  const orderId = useQueryId("order");
  const orders = useApi<OnlineOrder[]>(childId ? paymentsPath(childId) : null);
  const school = useApi<Branding>(BRANDING_PATH);
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
        <SchoolMark school={school.data} />
        {school.data ? <p>{school.data.name}</p> : null}
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

/** The school's logo, or its initials when it has none. */
export function SchoolMark({ school }: { school: Branding | null }) {
  if (school?.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="report-logo" src={school.logo_url} alt={school.name} style={{ objectFit: "contain", background: "white" }} />
    );
  }
  return <div className="report-logo">{school ? initialsOf(school.name) : "…"}</div>;
}
