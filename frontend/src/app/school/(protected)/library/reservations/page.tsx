"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, td, tdStrong } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";

import { LibraryTabs } from "../LibraryTabs";

type Reservation = {
  id: number;
  title: string;
  borrower_name: string;
  status: "waiting" | "ready" | "fulfilled" | "cancelled" | "expired";
  queue_position: number | null;
  hold_until: string | null;
  held_accession_no: string | null;
  created_at: string;
};

export default function ReservationsPage() {
  const [items, setItems] = useState<Reservation[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { data } = await api.get<Reservation[]>("/api/v1/school/library/reservations");
      setItems(data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function cancel(r: Reservation) {
    try {
      await api.post(`/api/v1/school/library/reservations/${r.id}/cancel`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Library" subtitle="Holds waiting for pickup, and the queue for books that are out." />
      <LibraryTabs />
      <ErrorBox>{error}</ErrorBox>
      <Card>
        <Table head={["Book", "For", "Status", "Reserved on", ""]} empty={items.length === 0 && "No active reservations."}>
          {items.map((r) => (
            <tr key={r.id}>
              <td className={tdStrong}>{r.title}</td>
              <td className={td}>{r.borrower_name}</td>
              <td className="px-4 py-3">
                {r.status === "ready" ? (
                  <>
                    <Badge tone="amber">ready</Badge>
                    <div className="text-xs text-ink-subtle">
                      Copy {r.held_accession_no} held until {r.hold_until}
                    </div>
                  </>
                ) : (
                  <>
                    <Badge>waiting</Badge>
                    <div className="text-xs text-ink-subtle">#{r.queue_position} in queue</div>
                  </>
                )}
              </td>
              <td className={td}>{r.created_at.slice(0, 10)}</td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="ghost" onClick={() => cancel(r)}>
                  Cancel
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
