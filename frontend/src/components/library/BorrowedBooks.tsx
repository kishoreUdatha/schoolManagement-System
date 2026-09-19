"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ErrorBox, Table, inr, td, tdStrong } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";

type Loan = {
  id: number;
  title: string;
  accession_no: string;
  issued_on: string;
  due_on: string;
  returned_on: string | null;
  lost_on: string | null;
  overdue_days: number;
  fine_amount: string;
  accruing_fine: string;
  fine_status: string;
};

/** Read-only list of a borrower's loans (parent's child, or the signed-in staff member). */
export function BorrowedBooks({ endpoint }: { endpoint: string }) {
  const [items, setItems] = useState<Loan[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Loan[]>(endpoint)
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, [endpoint]);

  const out = items.filter((l) => !l.returned_on && !l.lost_on);
  const past = items.filter((l) => l.returned_on || l.lost_on);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <Card>
        <div className="border-b border-surface-border px-4 py-3 text-sm font-semibold">Currently borrowed</div>
        <Table head={["Book", "Borrowed", "Due back", ""]} empty={out.length === 0 && "Nothing borrowed right now."}>
          {out.map((l) => (
            <tr key={l.id}>
              <td className={tdStrong}>{l.title}</td>
              <td className={td}>{l.issued_on}</td>
              <td className={`px-3 py-2 ${l.due_on < today ? "font-medium text-rose-500" : "text-ink-muted"}`}>
                {l.due_on}
                {l.due_on < today && <div className="text-xs">{l.overdue_days} day(s) late</div>}
              </td>
              <td className="px-3 py-2 text-right text-xs text-amber-600">
                {Number(l.accruing_fine) > 0 && `Late fine so far ${inr(l.accruing_fine)}`}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      {past.length > 0 && (
        <Card>
          <div className="border-b border-surface-border px-4 py-3 text-sm font-semibold">History</div>
          <Table head={["Book", "Borrowed", "Returned", "Fine"]}>
            {past.map((l) => (
              <tr key={l.id}>
                <td className={tdStrong}>{l.title}</td>
                <td className={td}>{l.issued_on}</td>
                <td className={td}>{l.lost_on ? <Badge tone="rose">lost</Badge> : l.returned_on}</td>
                <td className={td}>
                  {Number(l.fine_amount) > 0 ? (
                    <>
                      {inr(l.fine_amount)} <Badge>{l.fine_status === "billed" ? "added to fees" : l.fine_status}</Badge>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
