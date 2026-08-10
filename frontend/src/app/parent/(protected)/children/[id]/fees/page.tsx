"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

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

export default function ChildFeesPage() {
  const params = useParams<{ id: string }>();
  const [fees, setFees] = useState<Fee[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Fee[]>(`/api/v1/parent/me/children/${params.id}/fees`)
      .then((r) => setFees(r.data))
      .catch((e) => setError(apiError(e)));
  }, [params.id]);

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

      <h1 className="text-2xl font-bold text-slate-900">Fees</h1>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
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

      <Card>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Head</th>
              <th className="px-3 py-2 font-medium">Period</th>
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 font-medium">Paid</th>
              <th className="px-3 py-2 font-medium">Outstanding</th>
              <th className="px-3 py-2 font-medium">Due date</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {fees.map((f) => (
              <tr key={f.id}>
                <td className="px-3 py-2 font-medium text-slate-900">{f.fee_head_name}</td>
                <td className="px-3 py-2">{f.period}</td>
                <td className="px-3 py-2">₹{Number(f.amount_due).toLocaleString("en-IN")}</td>
                <td className="px-3 py-2">₹{Number(f.amount_paid).toLocaleString("en-IN")}</td>
                <td className="px-3 py-2 font-medium">
                  ₹{Number(f.amount_outstanding).toLocaleString("en-IN")}
                </td>
                <td className="px-3 py-2 text-slate-600">{f.due_date}</td>
                <td className="px-3 py-2">
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
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  No fee records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
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
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
    </Card>
  );
}
