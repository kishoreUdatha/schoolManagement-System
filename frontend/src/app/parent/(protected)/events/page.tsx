"use client";

import { useEffect, useState } from "react";

import { hhmm } from "@/components/events/CalendarFeed";
import type { SchoolEvent } from "@/components/events/EventForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, humanize, inr } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";

type ParentEvent = SchoolEvent & {
  consent_open: boolean;
  children: { student_id: number; student_name: string; response: "yes" | "no" | null; note: string | null }[];
};

export default function ParentEventsPage() {
  const [items, setItems] = useState<ParentEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api
      .get<ParentEvent[]>("/api/v1/parent/me/events", {
        params: { start: new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10) },
      })
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
  }, []);

  async function answer(ev: ParentEvent, studentId: number, response: "yes" | "no") {
    let note: string | null = null;
    if (response === "no") {
      note = window.prompt("Reason (optional)") ?? null;
    }
    try {
      await api.post(`/api/v1/parent/me/events/${ev.id}/consent`, { student_id: studentId, response, note: note?.trim() || null });
      setNotice(response === "yes" ? "Consent given. Thank you." : "Recorded that your child won't take part.");
      setError(null);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  const pending = items.filter((e) => e.consent_open && e.children.some((c) => !c.response));

  return (
    <div className="space-y-6">
      <PageHeader title="Events" subtitle="What's coming up at school, and trips that need your consent." />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      {pending.length > 0 && (
        <div className="rounded-lg bg-warning-bg px-4 py-3 text-[13px] font-medium text-warning dark:bg-amber-500/15 dark:text-amber-200">
          {pending.length} event{pending.length === 1 ? " needs" : "s need"} your consent.
        </div>
      )}
      {items.length === 0 && <p className="text-sm text-ink-subtle">No upcoming events.</p>}
      {items.map((ev) => (
        <Card key={ev.id}>
          <CardBody>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={`text-lg font-semibold text-ink ${ev.is_cancelled ? "line-through" : ""}`}>{ev.title}</h2>
              <Badge tone="brand">{humanize(ev.kind)}</Badge>
              {ev.is_cancelled && <Badge tone="rose">cancelled</Badge>}
            </div>
            <div className="mt-1.5 text-[13px] text-ink-muted">
              {ev.start_date}
              {ev.end_date !== ev.start_date && ` to ${ev.end_date}`}
              {ev.start_time ? ` · ${hhmm(ev.start_time)}${ev.end_time ? `–${hhmm(ev.end_time)}` : ""}` : " · all day"}
              {ev.venue && ` · ${ev.venue}`}
              {ev.fee_amount && ` · Cost ${inr(ev.fee_amount)}`}
            </div>
            {ev.description && <p className="mt-2 whitespace-pre-line text-sm text-ink">{ev.description}</p>}
            {ev.children.length > 0 && (
              <div className="mt-3 space-y-2 rounded-md border border-surface-border p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                  Consent{ev.consent_deadline && ` needed by ${ev.consent_deadline}`}
                </div>
                {ev.children.map((c) => (
                  <div key={c.student_id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-32 font-medium text-ink">{c.student_name}</span>
                    {c.response ? (
                      <Badge tone={c.response === "yes" ? "emerald" : "rose"}>{c.response === "yes" ? "going" : "not going"}</Badge>
                    ) : (
                      <Badge tone="amber">no answer yet</Badge>
                    )}
                    {c.note && <span className="text-xs text-ink-subtle">{c.note}</span>}
                    {ev.consent_open && (
                      <span className="ml-auto flex gap-2">
                        <Button size="sm" variant={c.response === "yes" ? "primary" : "secondary"} onClick={() => answer(ev, c.student_id, "yes")}>
                          I agree
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => answer(ev, c.student_id, "no")}>
                          Decline
                        </Button>
                      </span>
                    )}
                  </div>
                ))}
                {!ev.consent_open && !ev.is_cancelled && <div className="text-xs text-ink-subtle">Consent has closed.</div>}
              </div>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
