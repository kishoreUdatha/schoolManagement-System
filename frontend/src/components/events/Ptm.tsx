"use client";

import { FormEvent, useEffect, useState } from "react";

import { AudienceFields, type Audience } from "@/components/events/AudienceFields";
import { Button } from "@/components/ui/Button";
import { ErrorBox, Textarea } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

export type PtmSession = {
  id: number;
  title: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  venue: string | null;
  notes: string | null;
  class_id: number | null;
  section_id: number | null;
  scope_label: string;
  booking_closes_at: string | null;
  is_published: boolean;
  teacher_count: number;
  slot_count: number;
  booked_count: number;
};

export type PtmSlot = {
  id: number;
  start_time: string;
  end_time: string;
  status: "open" | "booked" | "done" | "no_show";
  student_id: number | null;
  student_name: string | null;
  class_label: string | null;
  parent_name: string | null;
  parent_note: string | null;
  teacher_notes: string | null;
};

export type PtmDetail = PtmSession & {
  teachers: { teacher_user_id: number; teacher_name: string; slots: PtmSlot[] }[];
};

export const slotTone = { open: "neutral", booked: "brand", done: "emerald", no_show: "rose" } as const;

/** datetime-local value <-> ISO with the browser's offset. */
const toLocalInput = (v: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function PtmForm({
  open,
  session,
  onClose,
  onSaved,
}: {
  open: boolean;
  session: PtmSession | null;
  onClose: () => void;
  onSaved: (s: PtmSession) => void;
}) {
  const blank = {
    title: "",
    meeting_date: "",
    start_time: "09:00",
    end_time: "12:00",
    slot_minutes: "10",
    venue: "",
    notes: "",
    audience: "parents" as Audience,
    classId: "",
    sectionId: "",
    booking_closes_at: "",
  };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setF(
      session
        ? {
            title: session.title,
            meeting_date: session.meeting_date,
            start_time: session.start_time.slice(0, 5),
            end_time: session.end_time.slice(0, 5),
            slot_minutes: String(session.slot_minutes),
            venue: session.venue ?? "",
            notes: session.notes ?? "",
            audience: session.section_id ? "section_parents" : session.class_id ? "class_parents" : "parents",
            classId: session.class_id ? String(session.class_id) : "",
            sectionId: session.section_id ? String(session.section_id) : "",
            booking_closes_at: toLocalInput(session.booking_closes_at),
          }
        : blank
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, open]);

  const slots = (() => {
    const [sh, sm] = f.start_time.split(":").map(Number);
    const [eh, em] = f.end_time.split(":").map(Number);
    const len = Number(f.slot_minutes);
    if ([sh, sm, eh, em].some(Number.isNaN) || !len) return 0;
    return Math.max(0, Math.floor((eh * 60 + em - sh * 60 - sm) / len));
  })();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      title: f.title,
      meeting_date: f.meeting_date,
      start_time: f.start_time,
      end_time: f.end_time,
      slot_minutes: Number(f.slot_minutes),
      venue: f.venue.trim() || null,
      notes: f.notes.trim() || null,
      class_id: f.audience !== "parents" && f.classId ? Number(f.classId) : null,
      section_id: f.audience === "section_parents" && f.sectionId ? Number(f.sectionId) : null,
      booking_closes_at: f.booking_closes_at ? new Date(f.booking_closes_at).toISOString() : null,
    };
    try {
      const r = session
        ? await api.put<PtmSession>(`/api/v1/school/ptm/${session.id}`, body)
        : await api.post<PtmSession>("/api/v1/school/ptm", body);
      onSaved(r.data);
    } catch (err) {
      setError(apiError(err));
    }
  }

  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal open={open} onClose={onClose} title={session ? "Edit meeting" : "New parent-teacher meeting"} size="lg">
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox>{error}</ErrorBox>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Title *" value={f.title} onChange={set("title")} required minLength={2} placeholder="Term 1 PTM" />
          <Input label="Date *" type="date" value={f.meeting_date} onChange={set("meeting_date")} required />
          <Input label="From *" type="time" value={f.start_time} onChange={set("start_time")} required />
          <Input label="To *" type="time" value={f.end_time} onChange={set("end_time")} required />
          <Input label="Minutes per meeting *" type="number" min={5} max={120} value={f.slot_minutes} onChange={set("slot_minutes")} required />
          <Input label="Venue" value={f.venue} onChange={set("venue")} />
          <AudienceFields
            scopeOnly
            audience={f.audience}
            classId={f.classId}
            sectionId={f.sectionId}
            onChange={(v) => setF({ ...f, ...v })}
          />
          <Input label="Bookings close" type="datetime-local" value={f.booking_closes_at} onChange={set("booking_closes_at")} />
        </div>
        <Textarea label="Notes for parents" rows={2} value={f.notes} onChange={set("notes")} />
        <p className="text-xs text-ink-subtle">
          {slots} slot{slots === 1 ? "" : "s"} per teacher. Date, times and slot length are locked once teachers are added.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
