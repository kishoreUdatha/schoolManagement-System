"use client";

import { useEffect, useState } from "react";

import { hhmm } from "@/components/events/CalendarFeed";
import { slotTone, type PtmSession, type PtmSlot } from "@/components/events/Ptm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Textarea, humanize } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Mine = PtmSession & { slots: PtmSlot[] };

export default function TeacherPtmPage() {
  const [items, setItems] = useState<Mine[]>([]);
  const [slot, setSlot] = useState<PtmSlot | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api
      .get<Mine[]>("/api/v1/teacher/ptm")
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
  }, []);

  async function save(status: "done" | "no_show" | "booked") {
    if (!slot) return;
    try {
      await api.put(`/api/v1/teacher/ptm/slots/${slot.id}`, { status, teacher_notes: notes.trim() || null });
      setNotice(status === "done" && notes.trim() ? "Saved. Your notes were shared with the parent." : "Saved.");
      setSlot(null);
      setError(null);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Parent-teacher meetings" subtitle="Your booked slots. After each meeting, mark it done and add notes for the parent." />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      {items.length === 0 && <p className="text-sm text-ink-subtle">You aren&apos;t in any upcoming meetings.</p>}
      {items.map((s) => {
        const booked = s.slots.filter((x) => x.student_id);
        return (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>
                {s.title}{" "}
                <span className="text-sm font-normal text-ink-subtle">
                  {s.meeting_date} · {hhmm(s.start_time)}–{hhmm(s.end_time)}
                  {s.venue && ` · ${s.venue}`} · {booked.length}/{s.slots.length} booked
                </span>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {s.slots.map((x) => (
                  <div key={x.id} className="rounded-md border border-surface-border p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-ink">{hhmm(x.start_time)}</span>
                      <Badge tone={slotTone[x.status]}>{humanize(x.status)}</Badge>
                    </div>
                    {x.student_name ? (
                      <div className="mt-1 text-ink-muted">
                        {x.student_name}
                        {x.class_label && ` · ${x.class_label}`}
                        {x.parent_name && <div className="text-xs text-ink-subtle">Parent: {x.parent_name}</div>}
                        {x.parent_note && <div className="text-xs italic text-ink-subtle">“{x.parent_note}”</div>}
                        {x.teacher_notes && <div className="mt-1 text-xs text-ink">Notes: {x.teacher_notes}</div>}
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-2"
                          onClick={() => {
                            setSlot(x);
                            setNotes(x.teacher_notes ?? "");
                          }}
                        >
                          {x.status === "booked" ? "Record meeting" : "Edit notes"}
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-ink-subtle">Free</div>
                    )}
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        );
      })}
      <Modal open={!!slot} onClose={() => setSlot(null)} title={`Meeting: ${slot?.student_name ?? ""}`}>
        <div className="space-y-3">
          <Textarea
            label="Notes for the parent"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What you discussed, and what to work on at home"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => save("no_show")}>
              Parent didn&apos;t come
            </Button>
            <Button onClick={() => save("done")}>Mark done</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
