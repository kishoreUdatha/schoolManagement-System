"use client";

import { FormEvent, useEffect, useState } from "react";

import { StudentPicker, type PickedStudent } from "@/components/StudentPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select, Textarea, humanize } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Session = {
  id: number;
  met_on: string;
  minutes: number | null;
  attendees: string | null;
  notes: string;
  next_session_on: string | null;
  recorded_by_name: string | null;
};
type Case = {
  id: number;
  reference_no: string;
  student_id: number;
  student_name: string;
  section_label: string | null;
  title: string;
  category: string;
  concern: string;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "referred" | "closed";
  is_sensitive: boolean;
  opened_on: string;
  referred_by_name: string | null;
  counsellor_user_id: number | null;
  counsellor_name: string | null;
  parent_informed: boolean;
  referred_to: string | null;
  outcome: string | null;
  closed_on: string | null;
  session_count: number;
  can_write: boolean;
  sessions: Session[];
};
type Staff = { user_id: number; full_name: string; role: string };

const CATEGORIES = ["academic", "behaviour", "emotional", "family", "bullying", "peer_relations", "career", "health", "other"];
const prioTone = { low: "neutral", medium: "amber", high: "rose" } as const;
const statusTone = { open: "amber", in_progress: "brand", referred: "neutral", closed: "emerald" } as const;
const base = "/api/v1/school/discipline/counselling";
const today = () => new Date().toISOString().slice(0, 10);

export function Counselling() {
  const [cases, setCases] = useState<Case[]>([]);
  const [status, setStatus] = useState("");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [open, setOpen] = useState<Case | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [form, setForm] = useState({ title: "", category: "emotional", concern: "", priority: "medium", is_sensitive: false, counsellor_user_id: "" });
  const [sf, setSf] = useState({ met_on: today(), minutes: "30", attendees: "", notes: "", next_session_on: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api
      .get<Case[]>(`${base}/cases`, { params: status ? { status } : {} })
      .then((r) => setCases(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    api
      .get<Staff[]>("/api/v1/school/directory/staff")
      .then((r) => setStaff(r.data))
      .catch(() => setStaff([]));
  }, []);

  const openCase = async (c: Case) => {
    try {
      const r = await api.get<Case>(`${base}/cases/${c.id}`);
      setOpen(r.data);
      setSf({ met_on: today(), minutes: "30", attendees: "", notes: "", next_session_on: "" });
    } catch (e) {
      setError(apiError(e));
    }
  };

  async function run(fn: () => Promise<unknown>, done: string, reopen?: Case | null) {
    try {
      await fn();
      setNotice(done);
      setError(null);
      load();
      if (reopen) await openCase(reopen);
      return true;
    } catch (e) {
      setError(apiError(e));
      return false;
    }
  }

  async function createCase(e: FormEvent) {
    e.preventDefault();
    if (!student) return;
    const ok = await run(
      () => api.post(`${base}/cases`, { ...form, student_id: student.id, counsellor_user_id: form.counsellor_user_id ? Number(form.counsellor_user_id) : null }),
      "Case opened."
    );
    if (ok) {
      setNewOpen(false);
      setStudent(null);
      setForm({ title: "", category: "emotional", concern: "", priority: "medium", is_sensitive: false, counsellor_user_id: "" });
    }
  }

  async function addSession(e: FormEvent) {
    e.preventDefault();
    if (!open) return;
    await run(
      () =>
        api.post(`${base}/cases/${open.id}/sessions`, {
          met_on: sf.met_on,
          minutes: sf.minutes ? Number(sf.minutes) : null,
          attendees: sf.attendees.trim() || null,
          notes: sf.notes,
          next_session_on: sf.next_session_on || null,
        }),
      "Session note saved.",
      open
    );
  }

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      <p className="rounded-md bg-surface-subtle px-3 py-2 text-sm text-ink-muted">
        Cases are private: only the assigned counsellor, the principal and the school admin can read them. Sensitive cases are
        hidden even from the teacher who referred the student, and parents never see the notes.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="referred">Referred out</option>
            <option value="closed">Closed</option>
          </Select>
        </div>
        <Button onClick={() => setNewOpen(true)}>Open a case</Button>
      </div>

      {cases.length === 0 && <p className="text-sm text-ink-subtle">No cases.</p>}
      {cases.map((c) => (
        <Card key={c.id}>
          <CardBody>
            <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => openCase(c)}>
              <span className="font-medium text-ink">{c.student_name}</span>
              <span className="text-ink-muted">{c.title}</span>
              <Badge tone={prioTone[c.priority]}>{c.priority}</Badge>
              <Badge tone={statusTone[c.status]}>{humanize(c.status)}</Badge>
              <Badge>{humanize(c.category)}</Badge>
              {c.is_sensitive && <Badge tone="rose">sensitive</Badge>}
              <span className="text-sm text-ink-subtle">
                {c.reference_no} · opened {c.opened_on} · {c.session_count} session{c.session_count === 1 ? "" : "s"}
                {c.counsellor_name && ` · ${c.counsellor_name}`}
              </span>
            </button>
          </CardBody>
        </Card>
      ))}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.student_name} — ${open.title}` : ""} size="lg">
        {open && (
          <div className="max-h-[75vh] space-y-3 overflow-auto">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={prioTone[open.priority]}>{open.priority}</Badge>
              <Badge tone={statusTone[open.status]}>{humanize(open.status)}</Badge>
              {open.is_sensitive && <Badge tone="rose">sensitive</Badge>}
              {open.parent_informed && <Badge tone="emerald">parents contacted</Badge>}
              <span className="text-xs text-ink-subtle">
                {open.reference_no} · referred by {open.referred_by_name ?? "—"} · {open.section_label}
              </span>
            </div>
            <p className="whitespace-pre-line text-sm text-ink">{open.concern}</p>
            {open.outcome && <div className="rounded bg-surface-subtle p-2 text-sm text-ink">Outcome: {open.outcome}</div>}

            {open.can_write && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-52">
                  <Select
                    label="Counsellor"
                    value={open.counsellor_user_id ? String(open.counsellor_user_id) : ""}
                    onChange={(e) => run(() => api.patch(`${base}/cases/${open.id}`, { counsellor_user_id: Number(e.target.value) }), "Counsellor assigned.", open)}
                  >
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {s.full_name}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button size="sm" variant="secondary" onClick={() => run(() => api.patch(`${base}/cases/${open.id}`, { is_sensitive: !open.is_sensitive }), "Privacy updated.", open)}>
                  {open.is_sensitive ? "Unmark sensitive" : "Mark sensitive"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const message = window.prompt("Message for the parents (the notes are never shared)", "We would like to meet you about your child.");
                    if (!message) return;
                    run(() => api.post(`${base}/cases/${open.id}/inform-parents`, { message }), "Parents messaged.", open);
                  }}
                >
                  Message parents
                </Button>
                {open.status !== "closed" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const outcome = window.prompt("How did it end?", open.outcome ?? "");
                      if (!outcome) return;
                      run(() => api.patch(`${base}/cases/${open.id}`, { status: "closed", outcome }), "Case closed.", open);
                    }}
                  >
                    Close case
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-sm font-semibold text-ink">Session notes</div>
              {open.sessions.length === 0 && <p className="text-sm text-ink-subtle">No sessions yet.</p>}
              {open.sessions.map((s) => (
                <div key={s.id} className="rounded-md border border-surface-border p-2 text-sm">
                  <div className="text-xs text-ink-subtle">
                    {s.met_on}
                    {s.minutes && ` · ${s.minutes} min`}
                    {s.attendees && ` · ${s.attendees}`} · {s.recorded_by_name}
                    {s.next_session_on && ` · next ${s.next_session_on}`}
                  </div>
                  <p className="whitespace-pre-line text-ink">{s.notes}</p>
                </div>
              ))}
            </div>

            {open.can_write && open.status !== "closed" && (
              <form onSubmit={addSession} className="space-y-2 rounded-md border border-surface-border p-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  <Input label="Met on" type="date" max={today()} value={sf.met_on} onChange={(e) => setSf({ ...sf, met_on: e.target.value })} required />
                  <Input label="Minutes" type="number" min={1} value={sf.minutes} onChange={(e) => setSf({ ...sf, minutes: e.target.value })} />
                  <Input label="Who came" value={sf.attendees} onChange={(e) => setSf({ ...sf, attendees: e.target.value })} />
                  <Input label="Next session" type="date" value={sf.next_session_on} onChange={(e) => setSf({ ...sf, next_session_on: e.target.value })} />
                </div>
                <Textarea label="Notes *" rows={3} value={sf.notes} onChange={(e) => setSf({ ...sf, notes: e.target.value })} required minLength={3} />
                <div className="flex justify-end">
                  <Button type="submit" size="sm">
                    Save note
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Open a counselling case" size="lg">
        <form onSubmit={createCase} className="space-y-3">
          <StudentPicker label="Student *" value={student} onChange={setStudent} />
          <Input label="Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} placeholder="Settling in, exam stress…" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Select label="Area" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </Select>
            <Select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
            <Select label="Counsellor" value={form.counsellor_user_id} onChange={(e) => setForm({ ...form, counsellor_user_id: e.target.value })}>
              <option value="">Assign later</option>
              {staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
          </div>
          <Textarea label="What's the concern? *" rows={4} value={form.concern} onChange={(e) => setForm({ ...form, concern: e.target.value })} required minLength={5} />
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.is_sensitive} onChange={(e) => setForm({ ...form, is_sensitive: e.target.checked })} />
            Sensitive — only the counsellor, principal and school admin may see it
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!student}>
              Open case
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
