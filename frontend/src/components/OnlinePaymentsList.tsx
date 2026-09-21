"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBox, Select, Table, inr, td, tdStrong } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";

type Order = {
  id: number;
  student_name: string;
  parent_name: string | null;
  amount: string;
  provider: string;
  provider_payment_id: string | null;
  status: "created" | "paid" | "failed";
  receipt_no: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  excess_amount: string;
  created_at: string;
  items: { fee_head_name: string; period: string }[];
};

const tone = { created: "neutral", paid: "emerald", failed: "rose" } as const;

/** Online fee payments table — shared by the school admin and accountant portals. */
export function OnlinePaymentsList() {
  const [status, setStatus] = useState("paid");
  const [items, setItems] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Order[]>("/api/v1/school/payments/online", { params: status ? { status } : {} })
      .then((r) => {
        setItems(r.data);
        setError(null);
      })
      .catch((e) => setError(apiError(e)));
  }, [status]);

  const refunds = items.filter((o) => Number(o.excess_amount) > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="paid">Paid</option>
          <option value="failed">Failed / cancelled</option>
          <option value="created">Started, not completed</option>
          <option value="">All</option>
        </Select>
        {status === "paid" && (
          <div className="text-sm text-ink-muted">
            {items.length} payments · {inr(items.reduce((s, o) => s + Number(o.amount), 0))}
          </div>
        )}
      </div>
      <ErrorBox>{error}</ErrorBox>
      {refunds.length > 0 && (
        <div className="rounded-lg bg-warning-bg px-4 py-3 text-[13px] font-medium text-warning dark:bg-amber-500/15 dark:text-amber-200">
          {refunds.length} payment(s) include money received for dues that were already paid (
          {inr(refunds.reduce((s, o) => s + Number(o.excess_amount), 0))}). Refund these from the
          Razorpay dashboard.
        </div>
      )}
      <Card>
        <Table
          head={["Date", "Student", "Paid by", "For", "Amount", "Status", "Transaction", ""]}
          empty={items.length === 0 && "No online payments."}
        >
          {items.map((o) => (
            <tr key={o.id} className="hover:bg-surface-hover">
              <td className={td}>{new Date(o.paid_at ?? o.created_at).toLocaleString()}</td>
              <td className={tdStrong}>{o.student_name}</td>
              <td className={td}>{o.parent_name ?? "—"}</td>
              <td className={td}>{o.items.map((i) => `${i.fee_head_name} ${i.period}`).join(", ")}</td>
              <td className={td}>
                {inr(o.amount)}
                {Number(o.excess_amount) > 0 && (
                  <div className="text-xs text-warning">refund {inr(o.excess_amount)}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge tone={tone[o.status]}>{o.status}</Badge>
                {o.failure_reason && <div className="text-xs text-ink-subtle">{o.failure_reason}</div>}
              </td>
              <td className="px-4 py-3 text-[12px] tabular-nums text-ink-subtle">
                {o.provider === "mock" ? "test mode" : o.provider_payment_id ?? "—"}
              </td>
              <td className="px-4 py-3 text-right">
                {o.status === "paid" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      openAuthed(`/api/v1/school/payments/online/${o.id}/receipt.pdf`).catch((e) =>
                        setError(apiError(e))
                      )
                    }
                  >
                    {o.receipt_no}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
