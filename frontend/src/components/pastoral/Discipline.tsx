"use client";

import { FormEvent, useEffect, useState } from "react";

import { StudentPicker, type PickedStudent } from "@/components/StudentPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select, Textarea, humanize } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Action = {
  id: number;
  kind: string;
  details: string | null;
  start_date: string | null;
  end_date: string | null;
  assigned_by_name: string | null;
  completed_on: string | null;
  counselling_case_id: number | null;
};
export type Incident = {
  id: number;
  reference_no: string;
  student_id: number;
  student_name: string;
  admission_no: string | null;
  section_label: string | null;
  occurred_on: string;
  place: string | null;
  category: string;
  severity: "low" | "medium" | "high";
  description: string;
  witnesses: string | null;
  status: "reported" | "investigating" | "action_taken" | "closed" | "dismissed";
  reported_by_name: string | null;
  resolution: string | null;
  closed_on: string | null;
  closed_by_name: string | null;
  shared_with_parents: boolean;
  parent_informed_at: string | null;
  can_edit: boolean;
  is_office: boolean;
  actions: Action[];
};

const CATEGORIES = ["bullying", "fighting", "cheating", "disrespect", "property_damage", "phone_misuse", "uniform", "late_or_absent", "unsafe_behaviour", "other"];
const ACTIONS = ["verbal_warning", "written_warning", "parent_meeting", "detention", "suspension", "community_service", "counselling_referral", "other"];
const sevTone = { low: "neutral", medium: "amber", high: "rose" } as const;
const statusTone = { reported: "amber", investigating: "brand", action_taken: "brand", closed: "emerald", dismissed: "neutral" } as const;
const base = "/api/v1/school/discipline";
const today = () => new Date().toISOString().slice(0, 10);

export function Discipline() {
  const [items, setItems] = useState<Incident[]>([]);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [form, setForm] = useState({ occurred_on: today(), place: "", category: "other", severity: "low", description: "", witnesses: "" });
  const [actionFor, setActionFor] = useState<Incident | null>(null);
  const [af, setAf] = useState({ kind: "verbal_warning", details: "", start_date: "", end_date: "", notify_parents: true, open_counselling_case: false });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api
      .get<Incident[]>(`${base}/incidents`, { params: status ? { status } : {} })
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      setNotice(done);
      setError(null);
      load();
      return true;
    } catch (e) {
      setError(apiError(e));
      return false;
    }
  }

  async function report(e: FormEvent) {
    e.preventDefault();
    if (!student) return;
    const ok = await run(
      () => api.post(`${base}/incidents`, { ...form, student_id: student.id, place: form.place || null, witnesses: form.witnesses || null }),
      "Incident reported. The office has been told."
    );
    if (ok) {
      setReportOpen(false);
      setStudent(null);
      setForm({ occurred_on: today(), place: "", category: "other", severity: "low", description: "", witnesses: "" });
    }
  }

  async function saveAction(e: FormEvent) {
    e.preventDefault();
    if (!actionFor) return;
    const ok = await run(
      () =>
        api.post(`${base}/incidents/${actionFor.id}/actions`, {
          ...af,
          details: af.details.trim() || null,
          start_date: af.start_date || null,
          end_date: af.end_date || null,
        }),
      "Action recorded."
    );
    if (ok) setActionFor(null);
  }

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="reported">Just reported</option>
            <option value="investigating">Being looked into</option>
            <option value="action_taken">Action taken</option>
            <option value="closed">Closed</option>
            <option value="dismissed">Dismissed</option>
          </Select>
        </div>
        <Button onClick={() => setReportOpen(true)}>Report an incident</Button>
      </div>

      {items.length === 0 && <p className="text-sm text-ink-subtle">No incidents.</p>}
      {items.map((i) => (
        <Card key={i.id}>
          <CardBody className="space-y-2">
            <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setOpen(open === i.id ? null : i.id)}>
              <span className="font-medium text-ink">{i.student_name}</span>
              <Badge tone={sevTone[i.severity]}>{i.severity}</Badge>
              <Badge>{humanize(i.category)}</Badge>
              <Badge tone={statusTone[i.status]}>{humanize(i.status)}</Badge>
              {i.shared_with_parents && <Badge tone="emerald">parents told</Badge>}
              <span className="text-sm text-ink-muted">
                {i.occurred_on}
                {i.section_label && ` · ${i.section_label}`} · {i.reference_no}
              </span>
            </button>
            {open === i.id && (
              <div className="space-y-2 text-sm">
                <p className="whitespace-pre-line text-ink">{i.description}</p>
                <div className="text-xs text-ink-subtle">
                  {i.place && `Where: ${i.place} · `}
                  Reported by {i.reported_by_name ?? "—"}
                  {i.witnesses && ` · Witnesses: ${i.witnesses}`}
                </div>
                {i.actions.length > 0 && (
                  <ul className="divide-y divide-surface-border">
                    {i.actions.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-2 py-1.5">
                        <Badge tone="brand">{humanize(a.kind)}</Badge>
                        <span className="text-ink">{a.details}</span>
                        {a.start_date && (
                          <span className="text-xs text-ink-subtle">
                            {a.start_date}
                            {a.end_date && ` → ${a.end_date}`}
                          </span>
                        )}
                        <span className="text-xs text-ink-subtle">by {a.assigned_by_name ?? "—"}</span>
                        {a.counselling_case_id && <Badge tone="amber">counselling opened</Badge>}
                        {i.is_office && (
                          <button type="button" className="ml-auto text-xs text-rose-400 hover:underline" onClick={() => run(() => api.delete(`${base}/actions/${a.id}`), "Action removed.")}>
                            Remove
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {i.resolution && <div className="rounded bg-surface-subtle p-2 text-ink">Outcome: {i.resolution}</div>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {i.is_office && (
                    <>
                      <Button size="sm" onClick={() => {
                        setActionFor(i);
                        setAf({ kind: "verbal_warning", details: "", start_date: "", end_date: "", notify_parents: true, open_counselling_case: false });
                      }}>
                        Record action
                      </Button>
                      {i.status === "reported" && (
                        <Button size="sm" variant="secondary" onClick={() => run(() => api.patch(`${base}/incidents/${i.id}`, { status: "investigating" }), "Marked as being looked into.")}>
                          Start looking into it
                        </Button>
                      )}
                      {!i.shared_with_parents && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const message = window.prompt("Message for the parents (optional)", "");
                            if (message === null) return;
                            run(() => api.post(`${base}/incidents/${i.id}/share`, { message: message.trim() || null }), "Shared with the parents.");
                          }}
                        >
                          Tell the parents
                        </Button>
                      )}
                      {i.status !== "closed" && i.status !== "dismissed" && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const resolution = window.prompt("How was it resolved?", i.resolution ?? "");
                              if (!resolution) return;
                              run(() => api.patch(`${base}/incidents/${i.id}`, { status: "closed", resolution }), "Incident closed.");
                            }}
                          >
                            Close
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => run(() => api.patch(`${base}/incidents/${i.id}`, { status: "dismissed", resolution: "Dismissed" }), "Dismissed.")}>
                            Dismiss
                          </Button>
                        </>
                      )}
                      {i.actions.length === 0 && (
                        <Button size="sm" variant="ghost" onClick={() => window.confirm("Delete this incident?") && run(() => api.delete(`${base}/incidents/${i.id}`), "Deleted.")}>
                          Delete
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      ))}

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Report an incident" size="lg">
        <form onSubmit={report} className="space-y-3">
          <StudentPicker label="Student *" value={student} onChange={setStudent} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="When *" type="date" max={today()} value={form.occurred_on} onChange={(e) => setForm({ ...form, occurred_on: e.target.value })} required />
            <Input label="Where" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="Playground, bus, corridor…" />
            <Select label="What happened" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </Select>
            <Select label="How serious" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              <option value="low">Minor</option>
              <option value="medium">Serious</option>
              <option value="high">Very serious</option>
            </Select>
          </div>
          <Textarea label="What happened *" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required minLength={5} />
          <Input label="Who else saw it" value={form.witnesses} onChange={(e) => setForm({ ...form, witnesses: e.target.value })} />
          <p className="text-xs text-ink-subtle">Parents are not told until the office shares it.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!student}>
              Report
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!actionFor} onClose={() => setActionFor(null)} title={`Action for ${actionFor?.student_name ?? ""}`}>
        <form onSubmit={saveAction} className="space-y-3">
          <Select label="Action *" value={af.kind} onChange={(e) => setAf({ ...af, kind: e.target.value })}>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {humanize(a)}
              </option>
            ))}
          </Select>
          <Textarea label="Details" rows={2} value={af.details} onChange={(e) => setAf({ ...af, details: e.target.value })} />
          {(af.kind === "detention" || af.kind === "suspension" || af.kind === "community_service") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="From" type="date" value={af.start_date} onChange={(e) => setAf({ ...af, start_date: e.target.value })} />
              <Input label="To" type="date" min={af.start_date || undefined} value={af.end_date} onChange={(e) => setAf({ ...af, end_date: e.target.value })} />
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-sm text-ink">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={af.notify_parents} onChange={(e) => setAf({ ...af, notify_parents: e.target.checked })} />
              Tell the parents (shares the incident)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={af.open_counselling_case} onChange={(e) => setAf({ ...af, open_counselling_case: e.target.checked })} />
              Open a counselling case
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setActionFor(null)}>
              Cancel
            </Button>
            <Button type="submit">Save action</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
