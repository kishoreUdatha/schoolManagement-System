"use client";

import { useEffect, useState } from "react";

import { hhmm } from "@/components/events/CalendarFeed";
import { Card } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, td, tdStrong } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";

type Cover = {
  id: number;
  sub_date: string;
  period_number: number;
  start_time: string;
  end_time: string;
  section_label: string;
  subject_name: string;
  absent_name: string | null;
  note: string | null;
};

export default function MyCoverPage() {
  const [items, setItems] = useState<Cover[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Cover[]>("/api/v1/school/cover/mine")
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="My cover" subtitle="Classes you're taking for absent colleagues over the next two weeks." />
      <ErrorBox>{error}</ErrorBox>
      <Card>
        <Table head={["Date", "Period", "Class", "Subject", "For", "Note"]} empty={items.length === 0 && "No cover assigned to you."}>
          {items.map((c) => (
            <tr key={c.id}>
              <td className={tdStrong}>{new Date(c.sub_date + "T00:00:00").toDateString()}</td>
              <td className={td}>
                P{c.period_number} · {hhmm(c.start_time)}–{hhmm(c.end_time)}
              </td>
              <td className={td}>{c.section_label}</td>
              <td className={td}>{c.subject_name}</td>
              <td className={td}>{c.absent_name}</td>
              <td className={td}>{c.note}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
