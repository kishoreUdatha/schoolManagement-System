"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { hhmm } from "@/components/events/CalendarFeed";
import { PtmForm, type PtmSession } from "@/components/events/Ptm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, td, tdStrong } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";

export default function PtmListPage() {
  const router = useRouter();
  const [items, setItems] = useState<PtmSession[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<PtmSession[]>("/api/v1/school/ptm")
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parent-teacher meetings"
        subtitle="Set a meeting window, add teachers, and parents book their own slots."
        actions={<Button onClick={() => setOpen(true)}>New meeting</Button>}
      />
      <ErrorBox>{error}</ErrorBox>
      <Card>
        <Table head={["Date", "Meeting", "For", "Teachers", "Booked", "Status"]} empty={items.length === 0 && "No meetings yet."}>
          {items.map((s) => (
            <tr key={s.id}>
              <td className={td}>
                {s.meeting_date}
                <div className="text-xs text-ink-subtle">
                  {hhmm(s.start_time)}–{hhmm(s.end_time)}
                </div>
              </td>
              <td className={tdStrong}>
                <Link href={`/school/ptm/${s.id}`} className="text-brand-500 hover:underline">
                  {s.title}
                </Link>
                {s.venue && <div className="text-xs font-normal text-ink-subtle">{s.venue}</div>}
              </td>
              <td className={td}>{s.scope_label}</td>
              <td className={td}>{s.teacher_count}</td>
              <td className={td}>
                {s.booked_count} / {s.slot_count}
              </td>
              <td className={td}>
                <Badge tone={s.is_published ? "emerald" : "neutral"}>{s.is_published ? "open for booking" : "draft"}</Badge>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      <PtmForm open={open} session={null} onClose={() => setOpen(false)} onSaved={(s) => router.push(`/school/ptm/${s.id}`)} />
    </div>
  );
}
