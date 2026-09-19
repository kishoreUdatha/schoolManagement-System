"use client";

import { FormEvent, useEffect, useState } from "react";

import { AudienceFields, type Audience } from "@/components/events/AudienceFields";
import { Button } from "@/components/ui/Button";
import { ErrorBox, Select, Textarea } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

export type SchoolEvent = {
  id: number;
  title: string;
  kind: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  description: string | null;
  audience: Audience;
  class_id: number | null;
  section_id: number | null;
  audience_label: string;
  requires_consent: boolean;
  consent_deadline: string | null;
  fee_amount: string | null;
  is_published: boolean;
  published_at: string | null;
  is_cancelled: boolean;
  consent_yes: number;
  consent_no: number;
};

export const EVENT_KINDS = ["academic", "cultural", "sports", "trip", "celebration", "meeting", "other"];

const blank = {
  title: "",
  kind: "other",
  start_date: "",
  end_date: "",
  start_time: "",
  end_time: "",
  venue: "",
  description: "",
  audience: "everyone" as Audience,
  classId: "",
  sectionId: "",
  requires_consent: false,
  consent_deadline: "",
  fee_amount: "",
};

export function EventForm({
  open,
  event,
  onClose,
  onSaved,
}: {
  open: boolean;
  event: SchoolEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError(null);
    setF(
      event
        ? {
            title: event.title,
            kind: event.kind,
            start_date: event.start_date,
            end_date: event.end_date,
            start_time: event.start_time?.slice(0, 5) ?? "",
            end_time: event.end_time?.slice(0, 5) ?? "",
            venue: event.venue ?? "",
            description: event.description ?? "",
            audience: event.audience,
            classId: event.class_id ? String(event.class_id) : "",
            sectionId: event.section_id ? String(event.section_id) : "",
            requires_consent: event.requires_consent,
            consent_deadline: event.consent_deadline ?? "",
            fee_amount: event.fee_amount ?? "",
          }
        : blank
    );
  }, [event, open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const n = (v: string) => (v.trim() ? v.trim() : null);
    const body = {
      title: f.title,
      kind: f.kind,
      start_date: f.start_date,
      end_date: n(f.end_date),
      start_time: n(f.start_time),
      end_time: n(f.end_time),
      venue: n(f.venue),
      description: n(f.description),
      audience: f.audience,
      class_id: f.classId ? Number(f.classId) : null,
      section_id: f.sectionId ? Number(f.sectionId) : null,
      requires_consent: f.requires_consent,
      consent_deadline: f.requires_consent ? n(f.consent_deadline) : null,
      fee_amount: n(f.fee_amount),
    };
    try {
      if (event) await api.put(`/api/v1/school/events/${event.id}`, body);
      else await api.post("/api/v1/school/events", body);
      onSaved();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal open={open} onClose={onClose} title={event ? "Edit event" : "New event"} size="lg">
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox>{error}</ErrorBox>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Title *" value={f.title} onChange={set("title")} required minLength={2} />
          <Select label="Kind" value={f.kind} onChange={set("kind")}>
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k[0].toUpperCase() + k.slice(1)}
              </option>
            ))}
          </Select>
          <Input label="Starts on *" type="date" value={f.start_date} onChange={set("start_date")} required />
          <Input label="Ends on" type="date" value={f.end_date} min={f.start_date} onChange={set("end_date")} />
          <Input label="Start time (blank = all day)" type="time" value={f.start_time} onChange={set("start_time")} />
          <Input label="End time" type="time" value={f.end_time} onChange={set("end_time")} disabled={!f.start_time} />
          <Input label="Venue" value={f.venue} onChange={set("venue")} />
          <Input label="Cost per student (info only)" type="number" min={0} step="0.01" value={f.fee_amount} onChange={set("fee_amount")} />
          <AudienceFields
            audience={f.audience}
            classId={f.classId}
            sectionId={f.sectionId}
            onChange={(v) => setF({ ...f, ...v, requires_consent: v.audience === "staff" ? false : f.requires_consent })}
          />
        </div>
        <Textarea label="Description" rows={3} value={f.description} onChange={set("description")} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={f.requires_consent}
              disabled={f.audience === "staff"}
              onChange={(e) => setF({ ...f, requires_consent: e.target.checked })}
            />
            Ask parents for consent (trips, activities)
          </label>
          {f.requires_consent && (
            <Input
              label="Consent by"
              type="date"
              max={f.start_date || undefined}
              value={f.consent_deadline}
              onChange={set("consent_deadline")}
            />
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
