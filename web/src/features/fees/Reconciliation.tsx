"use client";

import Link from "next/link";
import { useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { isoToday, monthStart } from "./common";
import { DateRange } from "./IncomeList";
import type { OnlineOrder, ReconRow, Reconciliation as Recon } from "./types";

const receipt = (orderId: number) =>
  api.open(`/api/v1/school/payments/online/${orderId}/receipt.pdf`).catch((e) => notify(errorText(e)));

const orderStatus = (o: OnlineOrder) => (o.status === "paid" ? "Paid" : o.status === "failed" ? "Failed" : "Abandoned");

/**
 * NEW-044, live. GET /school/payments/reconciliation?from=&to= compares what
 * the gateway took with what reached fee rows: paid orders not fully applied
 * (the office must chase them) and overpayments (a refund). Every order in
 * the range comes from GET /school/payments/online (the server sends them
 * all; filtered here by the day they were started, as the reconciliation
 * counts them). Receipts: GET /payments/online/{id}/receipt.pdf.
 */
export function Reconciliation() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoToday());
  const [status, setStatus] = useState("");
  const recon = useApi<Recon>("/api/v1/school/payments/reconciliation", { from, to });
  const orders = useApi<OnlineOrder[]>("/api/v1/school/payments/online");

  const r = recon.data;
  const n = (v: number | undefined) => (v === undefined ? "…" : String(v));
  const stats = [
    { label: "Orders started", value: n(r?.orders), note: r ? `${r.abandoned} abandoned · ${r.failed} failed` : "In this range" },
    { label: "Settled", value: r ? money(r.settled_amount) : "…", note: r ? `${r.settled} paid order${r.settled === 1 ? "" : "s"}` : "Paid online" },
    { label: "Not applied to fees", value: r ? money(r.unapplied_amount) : "…", note: r ? `${r.unapplied.length} order${r.unapplied.length === 1 ? "" : "s"} to chase` : "Paid but not credited" },
    { label: "Overpaid", value: r ? money(r.excess_amount) : "…", note: r ? `${r.excess.length} to refund or adjust` : "More than was owed" },
  ];

  const inRange = (orders.data ?? []).filter((o) => {
    const d = o.created_at.slice(0, 10);
    if (d < from || d > to) return false;
    if (status && o.status !== status) return false;
    return true;
  });
  const orderRows: Row[] = inRange.map((o) => [
    dateTime(o.created_at),
    { name: o.student_name, sub: o.parent_name ? `Paid by ${o.parent_name}` : undefined },
    o.provider_order_id,
    o.provider_payment_id ?? "—",
    money(o.amount),
    o.receipt_no ?? "—",
    orderStatus(o),
  ]);

  const reconRows = (rows: ReconRow[], excess: boolean): Row[] =>
    rows.map((x) => [
      x.paid_at ? dateTime(x.paid_at) : "—",
      x.student_name ?? `Student ${x.student_id}`,
      x.provider_payment_id ?? x.provider_order_id,
      money(x.amount),
      money(x.applied),
      excess ? money(x.excess) : money(x.difference),
      x.receipt_no ?? "—",
    ]);

  return (
    <>
      <StatStrip items={stats} />
      <div className="filterbar">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <select aria-label="Filter orders by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All orders</option>
          <option value="paid">Paid</option>
          <option value="created">Abandoned</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      <ErrorNote>{recon.error ?? orders.error}</ErrorNote>
      {r?.clean ? (
        <div className="tip" role="status">
          <Icon name="check" className="sm" />
          <span>Everything the gateway took in this range reached the students&apos; fees. Nothing to reconcile.</span>
        </div>
      ) : null}
      {r && r.unapplied.length ? (
        <>
          <Panel title="Paid but not applied to fees" sub={`${money(r.unapplied_amount)} the gateway took that is not on any fee. Check the student's ledger and record it.`} flush>
            <DataTable
              columns={["Paid at", "Student", "Gateway ref.", "Amount", "Applied", "Difference", "Receipt"]}
              rows={reconRows(r.unapplied, false)}
              selectable={false}
              actions={(i) => (
                <>
                  <Link href={`${routeOf(161)}?id=${r.unapplied[i].student_id}`} className="btn">
                    Ledger
                  </Link>
                  <button type="button" className="btn" onClick={() => receipt(r.unapplied[i].order_id)}>
                    Receipt
                  </button>
                </>
              )}
            />
          </Panel>
          <div className="gap" />
        </>
      ) : null}
      {r && r.excess.length ? (
        <>
          <Panel title="Overpaid" sub={`${money(r.excess_amount)} received beyond what was owed. Refund it or keep it against the next fees.`} flush>
            <DataTable
              columns={["Paid at", "Student", "Gateway ref.", "Amount", "Applied", "Excess", "Receipt"]}
              rows={reconRows(r.excess, true)}
              selectable={false}
              actions={(i) => (
                <>
                  <Link href={routeOf(165)} className="btn">
                    Refund
                  </Link>
                  <button type="button" className="btn" onClick={() => receipt(r.excess[i].order_id)}>
                    Receipt
                  </button>
                </>
              )}
            />
          </Panel>
          <div className="gap" />
        </>
      ) : null}
      <Panel title="Online orders" sub={`Started between the dates above${orders.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Started", "Student", "Gateway order", "Payment ID", "Amount", "Receipt", "Status"]}
          rows={orderRows}
          actions={(i) =>
            inRange[i].status === "paid" ? (
              <button type="button" className="btn" onClick={() => receipt(inRange[i].id)}>
                <Icon name="download" className="sm" />
                Receipt
              </button>
            ) : (
              <span className="muted small">{inRange[i].failure_reason ?? "—"}</span>
            )
          }
          empty={orders.loading ? "Loading orders…" : "No online payments were started in this range."}
        />
      </Panel>
    </>
  );
}
