"use client";

import { useEffect, useState } from "react";

import { hhmm } from "@/components/events/CalendarFeed";
import type { PtmSession } from "@/components/events/Ptm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Slot = {
  id: number;
  start_time: string;
  end_time: string;
  state: "open" | "mine" | "taken";
  student_id: number | null;
  status: "booked" | "done" | "no_show" | null;
  teacher_notes: string | null;
};
type Meeting = PtmSession & {
  booking_open: boolean;
  eligible_children: number[];
  teachers: { teacher_user_id: number; teacher_name: string; teaches: number[]; slots: Slot[] }[];
};
type Child = { id: number; full_name: string };

export default function ParentMeetingsPage() {
  const [items, setItems] = useState<Meeting[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [childFor, setChildFor] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Meeting[]>("/api/v1/parent/me/ptm")
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
    api
      .get<Child[]>("/api/v1/parent/me/children")
      .then((r) => setChildren(r.data))
      .catch(() => setChildren([]));
  }, []);

  const name = (id: number | null) => children.find((c) => c.id === id)?.full_name ?? "your child";

  async function book(m: Meeting, slot: Slot) {
    const sid = childFor[m.id] ?? String(m.eligible_children[0]);
    const note = window.prompt(`Book ${hhmm(slot.start_time)} for ${name(Number(sid))}? Anything the teacher should know (optional):`, "");
    if (note === null) return;
    try {
      const r = await api.post<Meeting[]>("/api/v1/parent/me/ptm/book", {
        slot_id: slot.id,
        student_id: Number(sid),
        note: note.trim() || null,
      });
      setItems(r.data);
      setNotice(`Booked ${hhmm(slot.start_time)}.`);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function cancel(slot: Slot) {
    if (!window.confirm(`Cancel your ${hhmm(slot.start_time)} meeting?`)) return;
    try {
      const r = await api.delete<Meeting[]>(`/api/v1/parent/me/ptm/slots/${slot.id}`);
      setItems(r.data);
      setNotice("Booking cancelled.");
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Parent-teacher meetings" subtitle="Pick a time with each teacher you'd like to meet." />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      {items.length === 0 && <p className="text-sm text-ink-subtle">No meetings scheduled right now.</p>}
      {items.map((m) => {
        const child = Number(childFor[m.id] ?? m.eligible_children[0]);
        return (
          <Card key={m.id}>
            <CardHeader>
              <CardTitle>{m.title}</CardTitle>
              <div className="text-sm text-ink-muted">
                {m.meeting_date} · {hhmm(m.start_time)}–{hhmm(m.end_time)}
                {m.venue && ` · ${m.venue}`}
                {m.booking_closes_at && ` · bookings close ${new Date(m.booking_closes_at).toLocaleString()}`}
              </div>
              {m.notes && <p className="mt-1 text-sm text-ink">{m.notes}</p>}
            </CardHeader>
            <CardBody className="space-y-4">
              {!m.booking_open && <Badge tone="amber">booking closed</Badge>}
              {m.booking_open && m.eligible_children.length > 1 && (
                <div className="max-w-xs">
                  <Select label="Booking for" value={String(child)} onChange={(e) => setChildFor({ ...childFor, [m.id]: e.target.value })}>
                    {m.eligible_children.map((id) => (
                      <option key={id} value={id}>
                        {name(id)}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {m.teachers.map((t) => {
                const mineForChild = t.slots.find((x) => x.state === "mine" && x.student_id === child);
                return (
                  <div key={t.teacher_user_id}>
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-ink">{t.teacher_name}</span>
                      {t.teaches.length > 0 && <Badge tone="brand">teaches {t.teaches.map(name).join(", ")}</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {t.slots.map((x) => {
                        const mine = x.state === "mine";
                        return (
                          <button
                            key={x.id}
                            type="button"
                            disabled={!m.booking_open || x.state === "taken" || (!mine && !!mineForChild)}
                            onClick={() => (mine ? x.status === "booked" && cancel(x) : book(m, x))}
                            title={mine ? `Booked for ${name(x.student_id)}${x.status === "booked" ? " · click to cancel" : ""}` : undefined}
                            className={cn(
                              "rounded-md border px-2 py-1 text-xs",
                              mine && "border-brand-500 bg-brand-500 text-white",
                              x.state === "taken" && "border-surface-border text-ink-subtle line-through",
                              x.state === "open" && "border-surface-border text-ink hover:border-brand-500 disabled:opacity-40"
                            )}
                          >
                            {hhmm(x.start_time)}
                          </button>
                        );
                      })}
                    </div>
                    {t.slots
                      .filter((x) => x.state === "mine")
                      .map((x) => (
                        <div key={x.id} className="mt-1 text-xs text-ink-muted">
                          {name(x.student_id)} at {hhmm(x.start_time)}
                          {x.status === "done" && " · met"}
                          {x.status === "no_show" && " · marked as missed"}
                          {x.teacher_notes && <div className="mt-1 rounded bg-surface-subtle p-2 text-ink">Teacher&apos;s notes: {x.teacher_notes}</div>}
                        </div>
                      ))}
                  </div>
                );
              })}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
