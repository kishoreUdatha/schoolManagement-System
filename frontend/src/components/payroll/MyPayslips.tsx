"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, inr, td, tdStrong } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";

import { Payslip, monthLabel } from "./types";

/** Any employee's own payslips (teacher, principal, accountant, staff portals). */
export function MyPayslips() {
  const [items, setItems] = useState<Payslip[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Payslip[]>("/api/v1/staff/payslips")
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="My payslips" subtitle="Payslips appear here once the school finalizes the month's payroll." />
      <ErrorBox>{error}</ErrorBox>
      <Card>
        <Table head={["Month", "Paid days", "Gross", "Deductions", "Net pay", ""]} empty={items.length === 0 && "No payslips yet."}>
          {items.map((p) => (
            <tr key={p.id}>
              <td className={tdStrong}>{monthLabel(p.period)}</td>
              <td className={td}>
                {Number(p.paid_days)}/{p.days_in_month}
              </td>
              <td className={td}>{inr(p.gross)}</td>
              <td className={td}>{inr(p.total_deductions)}</td>
              <td className={tdStrong}>{inr(p.net_pay)}</td>
              <td className="px-3 py-2 text-right">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openAuthed(`/api/v1/staff/payslips/${p.id}/pdf`).catch((e) => setError(apiError(e)))}
                >
                  Download
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
