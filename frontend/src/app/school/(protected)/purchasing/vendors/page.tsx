"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { VERDICT } from "@/components/charts/theme";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Table,
  WarnBox,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Row = {
  supplier_id: number;
  supplier_name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  is_active: boolean;
  bills: number;
  billed: string;
  paid: string;
  outstanding: string;
  overdue: string;
  unpaid_bills: number;
};
type Payables = {
  suppliers: Row[];
  total_outstanding: string;
  total_overdue: string;
  suppliers_owed: number;
};

/** What the school owes each supplier.
 *
 *  Nothing here is a stored balance — it is their bills less their payments,
 *  worked out when the page is opened. A supplier list that only carried
 *  contact details could not answer the question anybody actually has.
 */
export default function VendorsPage() {
  const [data, setData] = useState<Payables | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Payables>("/api/v1/school/finance/payables")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const rows = (data?.suppliers ?? []).filter((r) =>
    q.trim() ? r.supplier_name.toLowerCase().includes(q.trim().toLowerCase()) : true
  );
  const owed = rows.filter((r) => Number(r.outstanding) > 0);
  const overdue = rows.filter((r) => Number(r.overdue) > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        subtitle="Who the school owes, worked out from their bills and payments."
        actions={
          <Input
            placeholder="Search suppliers"
            aria-label="Search suppliers"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Suppliers billing us" value={rows.length} />
        <StatCard
          label="Outstanding"
          value={data ? inr(data.total_outstanding) : "—"}
          accent={Number(data?.total_outstanding ?? 0) > 0 ? "amber" : "emerald"}
        />
        <StatCard
          label="Overdue"
          value={data ? inr(data.total_overdue) : "—"}
          accent={Number(data?.total_overdue ?? 0) > 0 ? "rose" : "emerald"}
        />
        <StatCard label="Owed something" value={data?.suppliers_owed ?? "—"} />
      </div>

      {overdue.length > 0 && (
        <WarnBox>
          {overdue.length} supplier(s) have bills past their due date —{" "}
          {overdue.map((r) => r.supplier_name).join(", ")}.
        </WarnBox>
      )}

      <ChartCard
        title="Owed by supplier"
        subtitle="Bills raised less payments made."
        empty={owed.length === 0 && "Nothing is owed to anybody."}
        height={Math.max(220, owed.length * 30)}
      >
        <BreakdownChart
          data={owed.slice(0, 12).map((r) => ({
            label: r.supplier_name,
            amount: Number(r.outstanding),
          }))}
          x="label"
          layout="vertical"
          series={[{ key: "amount", name: "Outstanding" }]}
          colorBy={(row) => {
            const s = owed.find((x) => x.supplier_name === row.label);
            return s && Number(s.overdue) > 0 ? VERDICT.poor : VERDICT.fair;
          }}
          xFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
        />
      </ChartCard>

      <Card>
        <CardHeader>
          <CardTitle>Every supplier we have billed</CardTitle>
          <Link
            href="/school/purchasing/orders"
            className="text-[13px] font-bold text-brand-600 hover:underline"
          >
            Orders and bills
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Supplier", "Contact", "Bills", "Billed", "Paid", "Outstanding", "Overdue"]}
            empty={
              rows.length === 0 &&
              "No supplier has been billed yet — add a bill from the orders page."
            }
          >
            {rows.map((r) => (
              <tr key={r.supplier_id}>
                <td className={tdStrong}>
                  {r.supplier_name}
                  {!r.is_active && (
                    <Badge tone="neutral" className="ml-2">
                      Inactive
                    </Badge>
                  )}
                  {r.gstin && (
                    <span className="block font-mono text-[11px] font-normal text-ink-subtle">
                      {r.gstin}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {r.phone ?? "—"}
                  {r.email && (
                    <span className="block text-[11px] text-ink-subtle">{r.email}</span>
                  )}
                </td>
                <td className={td}>
                  {r.bills}
                  {r.unpaid_bills > 0 && (
                    <span className="block text-[11px] text-ink-subtle">
                      {r.unpaid_bills} unpaid
                    </span>
                  )}
                </td>
                <td className={td}>{inr(r.billed)}</td>
                <td className={td}>{inr(r.paid)}</td>
                <td className={tdStrong}>
                  {Number(r.outstanding) > 0 ? inr(r.outstanding) : "—"}
                </td>
                <td className={td}>
                  {Number(r.overdue) > 0 ? (
                    <Badge tone="rose">{inr(r.overdue)}</Badge>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
