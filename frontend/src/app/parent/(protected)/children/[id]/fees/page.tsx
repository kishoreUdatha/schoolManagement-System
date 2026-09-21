"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PaidOrder, PayOnlineButton } from "@/components/PayOnline";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";

type FeeStatus = "pending" | "paid" | "waived";

type Fee = {
  id: number;
  fee_head_name: string;
  fee_head_code: string;
  period: string;
  amount_due: string;
  amount_paid: string;
  amount_outstanding: string;
  due_date: string;
  status: FeeStatus;
  is_overdue: boolean;
  paid_at: string | null;
  payment_mode: string | null;
  payment_ref: string | null;
};

type Payment = {
  id: number;
  amount: string;
  status: "created" | "paid" | "failed";
  receipt_no: string | null;
  paid_at: string | null;
  created_at: string;
  failure_reason: string | null;
  excess_amount: string;
  items: { fee_head_name: string; period: string }[];
};

export default function ChildFeesPage() {
  const params = useParams<{ id: string }>();
  const [fees, setFees] = useState<Fee[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    api
      .get<Fee[]>(`/api/v1/parent/me/children/${params.id}/fees`)
      .then((r) => setFees(r.data))
      .catch((e) => setError(apiError(e)));
    api
      .get<Payment[]>(`/api/v1/parent/me/children/${params.id}/payments`)
      .then((r) => setPayments(r.data.filter((p) => p.status !== "created")))
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const payable = fees.filter((f) => f.status === "pending" && Number(f.amount_outstanding) > 0);
  const selectedTotal = fees
    .filter((f) => selected.has(f.id))
    .reduce((s, f) => s + Number(f.amount_outstanding), 0);

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function onPaid(o: PaidOrder) {
    setSelected(new Set());
    setError(null);
    setNotice(`Payment of ₹${Number(o.amount).toLocaleString("en-IN")} received. Receipt ${o.receipt_no}.`);
    load();
  }

  function receipt(p: Payment) {
    openAuthed(
      `/api/v1/parent/me/children/${params.id}/payments/${p.id}/receipt.pdf`
    ).catch((e) => setError(apiError(e)));
  }

  const totals = useMemo(() => {
    let due = 0,
      paid = 0,
      out = 0,
      overdue = 0;
    fees.forEach((f) => {
      due += Number(f.amount_due);
      paid += Number(f.amount_paid);
      if (f.status === "pending") {
        out += Number(f.amount_outstanding);
        if (f.is_overdue) overdue += Number(f.amount_outstanding);
      }
    });
    return { due, paid, out, overdue };
  }, [fees]);

  return (
    <div className="space-y-4">
      <Link
        href={`/parent/children/${params.id}`}
        className="text-sm text-brand-700 hover:underline"
      >
        ← Back to child profile
      </Link>

      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Fees</h1>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <SummaryCard label="Total billed" value={`₹${totals.due.toLocaleString("en-IN")}`} />
        <SummaryCard
          label="Paid"
          value={`₹${totals.paid.toLocaleString("en-IN")}`}
          accent="emerald"
        />
        <SummaryCard
          label="Outstanding"
          value={`₹${totals.out.toLocaleString("en-IN")}`}
          accent={totals.out > 0 ? "amber" : "emerald"}
        />
        <SummaryCard
          label="Overdue"
          value={`₹${totals.overdue.toLocaleString("en-IN")}`}
          accent={totals.overdue > 0 ? "rose" : "emerald"}
        />
      </div>

      {payable.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border bg-white px-4 py-3">
          <div className="text-sm text-ink-muted">
            {selected.size
              ? `${selected.size} selected`
              : "Select the fees you want to pay online."}{" "}
            <button
              className="ml-2 text-brand-700 hover:underline"
              onClick={() => setSelected(new Set(payable.map((f) => f.id)))}
            >
              Select all dues
            </button>
          </div>
          <PayOnlineButton
            studentId={params.id}
            feeIds={Array.from(selected)}
            total={selectedTotal}
            onPaid={onPaid}
            onError={(m) => {
              setNotice(null);
              setError(m);
            }}
          />
        </div>
      )}

      <Card>
        <table className="min-w-full divide-y divide-surface-border text-[13px]">
          <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="px-4 py-3 font-bold">Head</th>
              <th className="px-4 py-3 font-bold">Period</th>
              <th className="px-4 py-3 font-bold">Due</th>
              <th className="px-4 py-3 font-bold">Paid</th>
              <th className="px-4 py-3 font-bold">Outstanding</th>
              <th className="px-4 py-3 font-bold">Due date</th>
              <th className="px-4 py-3 font-bold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {fees.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-3">
                  {f.status === "pending" && Number(f.amount_outstanding) > 0 && (
                    <input
                      type="checkbox"
                      aria-label={`Pay ${f.fee_head_name} ${f.period}`}
                      checked={selected.has(f.id)}
                      onChange={() => toggle(f.id)}
                    />
                  )}
                </td>
                <td className="px-4 py-3 font-medium text-ink">{f.fee_head_name}</td>
                <td className="px-4 py-3">{f.period}</td>
                <td className="px-4 py-3">₹{Number(f.amount_due).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3">₹{Number(f.amount_paid).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 font-medium">
                  ₹{Number(f.amount_outstanding).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 text-ink-muted">{f.due_date}</td>
                <td className="px-4 py-3">
                  {f.status === "paid" ? (
                    <Badge tone="emerald">paid</Badge>
                  ) : f.status === "waived" ? (
                    <Badge tone="neutral">waived</Badge>
                  ) : f.is_overdue ? (
                    <Badge tone="rose">overdue</Badge>
                  ) : (
                    <Badge tone="amber">pending</Badge>
                  )}
                </td>
              </tr>
            ))}
            {fees.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-ink-muted">
                  No fee records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {payments.length > 0 && (
        <Card>
          <div className="border-b border-surface-border px-4 py-3 text-sm font-semibold text-ink">
            Online payments
          </div>
          <ul className="divide-y divide-surface-border text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <div className="font-medium text-ink">
                    ₹{Number(p.amount).toLocaleString("en-IN")} ·{" "}
                    {p.items.map((i) => `${i.fee_head_name} ${i.period}`).join(", ")}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {new Date(p.paid_at ?? p.created_at).toLocaleString()}
                    {p.failure_reason && ` · ${p.failure_reason}`}
                    {Number(p.excess_amount) > 0 &&
                      ` · ₹${Number(p.excess_amount).toLocaleString("en-IN")} paid twice — the school will refund it`}
                  </div>
                </div>
                {p.status === "paid" ? (
                  <Button size="sm" variant="secondary" onClick={() => receipt(p)}>
                    Receipt {p.receipt_no}
                  </Button>
                ) : (
                  <Badge tone="rose">failed</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent = "brand",
}: {
  label: string;
  value: string;
  accent?: "brand" | "emerald" | "amber" | "rose";
}) {
  const tone =
    accent === "brand"
      ? "text-brand-700"
      : accent === "emerald"
      ? "text-emerald-700"
      : accent === "amber"
      ? "text-amber-700"
      : "text-rose-700";
  return (
    <Card className="p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
    </Card>
  );
}
