"use client";

/*
 * PM-027 · Payments & receipts: every online attempt for the child (paid,
 * pending, cancelled, failed) and receipts for fees paid at the school
 * counter (GET …/counter-receipts, each with a PDF), filtered by academic
 * year (GET /parent/me/academic-years; both lists take ?academic_year_id=).
 */

import { useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { PmError, PmLoading, useGoTo } from "../comms/ui";
import { ME } from "../support/services";
import { ofChild, orderState, orderTitle, paymentsPath, periodLabel, type OnlineOrder } from "./common";

const VALUE_CLS = { paid: "good", pending: "", cancelled: "warning", failed: "bad" };

type Year = { id: number; name: string; is_current: boolean };
type CounterReceipt = {
  id: number;
  receipt_no: string;
  student_id: number;
  fee_head_name: string | null;
  period: string | null;
  amount: string;
  mode: string;
  reference: string | null;
  collected_on: string;
};

export function PaymentsReceipts() {
  const { childId, notify } = useParent();
  const goTo = useGoTo();
  const years = useApi<Year[]>(`${ME}/academic-years`);
  const [pick, setPick] = useState<string | null>(null);
  // Start on the current academic year once the list arrives; "" means all years.
  const yearId = pick ?? String(years.data?.find((y) => y.is_current)?.id ?? "");
  const params = { academic_year_id: yearId || undefined };
  const orders = useApi<OnlineOrder[]>(childId ? paymentsPath(childId) : null, params);
  const counter = useApi<CounterReceipt[]>(childId ? `${ME}/children/${childId}/counter-receipts` : null, params);
  const [opening, setOpening] = useState<number | null>(null);

  if (!childId || (orders.loading && !orders.data) || (counter.loading && !counter.data)) return <PmLoading />;

  const online = ofChild(orders.data, childId);
  const receipts = ofChild(counter.data, childId);

  async function openReceipt(r: CounterReceipt) {
    setOpening(r.id);
    try {
      await api.open(`${ME}/children/${childId}/counter-receipts/${r.id}/receipt.pdf`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setOpening(null);
    }
  }

  return (
    <>
      <label className="field">
        Academic year
        <select value={yearId} onChange={(e) => setPick(e.target.value)}>
          <option value="">All years</option>
          {(years.data ?? []).map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
              {y.is_current ? " (current)" : ""}
            </option>
          ))}
        </select>
      </label>
      <PmError>{orders.error ?? counter.error}</PmError>
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
      {receipts.map((r) => (
        <button key={`c${r.id}`} className="item" disabled={opening !== null} onClick={() => openReceipt(r)}>
          <span>
            <strong>{[r.fee_head_name, r.period ? periodLabel(r.period) : null].filter(Boolean).join(" · ") || "Fee payment"}</strong>
            <small>{`Paid ${date(r.collected_on)} · ${label(r.mode)} at school · ${r.receipt_no}${r.reference ? ` · ${r.reference}` : ""}`}</small>
          </span>
          <span className="value good">{opening === r.id ? "Opening…" : money(r.amount)}</span>
        </button>
      ))}
      {!online.length && !receipts.length ? <p className="muted">{yearId ? "No payments recorded in this academic year." : "No payments recorded yet."}</p> : null}
      <div className="panel soft">
        <h3>Payment records</h3>
        <p>Receipts become available after the school confirms the payment. Tap a school-counter payment to open its receipt. Pending payments are not counted as paid.</p>
      </div>
    </>
  );
}
