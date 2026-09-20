"use client";

import { useEffect, useState } from "react";

import { hhmm } from "@/components/events/CalendarFeed";
import { slotTone, type PtmSession, type PtmSlot } from "@/components/events/Ptm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Textarea, humanize } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";
import { toIso } from "@/lib/dates";

type Mine = PtmSession & { slots: PtmSlot[] };
type Scope = { section_id: number; class_id: number; label: string };

/** A class teacher may arrange a meeting for their own class. Anything
 *  wider is a decision about everybody else's diary, so it stays with the
 *  office — the picker below only ever lists classes you are class teacher
 *  of, and is empty for a teacher who is nobody's. */
const BLANK = {
  title: "",
  meeting_date: "",
  start_time: "16:00",
  end_time: "17:00",
  slot_minutes: "10",
  venue: "",
};

export default function TeacherPtmPage() {
  const [items, setItems] = useState<Mine[]>([]);
  const [slot, setSlot] = useState<PtmSlot | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [arranging, setArranging] = useState(false);
  const [sectionId, setSectionId] = useState<number | "">("");
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get<Mine[]>("/api/v1/teacher/ptm")
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    api
      .get<Scope[]>("/api/v1/teacher/ptm/my-classes")
      .then((r) => {
        setScopes(r.data);
        if (r.data.length) setSectionId(r.data[0].section_id);
      })
      .catch(() => setScopes([]));
  }, []);

  async function arrange() {
    if (sectionId === "") return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/teacher/ptm/sessions?section_id=${sectionId}`, {
        title: form.title.trim(),
        meeting_date: form.meeting_date,
        start_time: `${form.start_time}:00`,
        end_time: `${form.end_time}:00`,
        slot_minutes: Number(form.slot_minutes),
        venue: form.venue.trim() || null,
      });
      setNotice(
        "Arranged. Parents cannot book until you publish it from the office " +
          "list, so there is time to check the slots first."
      );
      setArranging(false);
      setForm(BLANK);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

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
      <PageHeader
        title="Parent-teacher meetings"
        subtitle="Your booked slots. After each meeting, mark it done and add notes for the parent."
        actions={
          scopes.length > 0 ? (
            <Button onClick={() => setArranging(true)}>Arrange a meeting</Button>
          ) : undefined
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      {items.length === 0 && (
        <p className="text-sm text-ink-subtle">
          You aren&apos;t in any upcoming meetings.
          {scopes.length === 0 &&
            " You are not a class teacher, so arranging one is the office's to do."}
        </p>
      )}
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
      <Modal
        open={arranging}
        onClose={() => setArranging(false)}
        title="Arrange a meeting for your class"
      >
        <div className="space-y-3">
          <Select
            label="Class"
            value={sectionId}
            onChange={(e) => setSectionId(Number(e.target.value))}
          >
            {scopes.map((s2) => (
              <option key={s2.section_id} value={s2.section_id}>
                {s2.label}
              </option>
            ))}
          </Select>
          <Input
            label="Title"
            value={form.title}
            placeholder="Autumn parents' evening"
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Input
            label="Date"
            type="date"
            min={toIso()}
            value={form.meeting_date}
            onChange={(e) => setForm({ ...form, meeting_date: e.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="From"
              type="time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            />
            <Input
              label="To"
              type="time"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            />
            <Input
              label="Minutes each"
              type="number"
              min={5}
              max={120}
              value={form.slot_minutes}
              onChange={(e) => setForm({ ...form, slot_minutes: e.target.value })}
            />
          </div>
          <Input
            label="Where"
            value={form.venue}
            placeholder="Your classroom"
            onChange={(e) => setForm({ ...form, venue: e.target.value })}
          />
          <p className="text-[12px] text-ink-subtle">
            Slots are made for you across that hour. Parents can only book once it is
            published, so nothing goes out by accident.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setArranging(false)}>
              Cancel
            </Button>
            <Button
              onClick={arrange}
              loading={busy}
              disabled={!form.title.trim() || !form.meeting_date || sectionId === ""}
            >
              Arrange it
            </Button>
          </div>
        </div>
      </Modal>

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
