"use client";

import { FormEvent, useEffect, useState } from "react";

import type { ClassSubjectSummary } from "@/components/syllabus/SyllabusList";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select, Textarea, humanize } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Status = "draft" | "submitted" | "approved" | "returned";
export type LessonPlan = {
  id: number;
  teacher_user_id: number;
  teacher_name: string;
  class_subject_id: number;
  subject_name: string;
  section_id: number;
  section_label: string;
  plan_date: string;
  periods: number;
  title: string;
  objectives: string | null;
  activities: string | null;
  resources: string | null;
  assessment: string | null;
  homework: string | null;
  status: Status;
  submitted_at: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  delivered_on: string | null;
  delivery_note: string | null;
  topics: { id: number; title: string; chapter_title: string }[];
};

type Chapter = { id: number; title: string; topics: { id: number; title: string }[] };

const tone = { draft: "neutral", submitted: "amber", approved: "emerald", returned: "rose" } as const;
const TEXT_FIELDS = ["objectives", "activities", "resources", "assessment", "homework"] as const;
const base = "/api/v1/school/lesson-plans";

function PlanBody({ p }: { p: LessonPlan }) {
  return (
    <div className="space-y-2 text-sm">
      {p.topics.length > 0 && (
        <div className="text-ink-muted">
          Topics: {p.topics.map((t) => `${t.title} (${t.chapter_title})`).join("; ")}
        </div>
      )}
      {TEXT_FIELDS.map((k) =>
        p[k] ? (
          <div key={k}>
            <div className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{humanize(k)}</div>
            <p className="whitespace-pre-line text-ink">{p[k]}</p>
          </div>
        ) : null
      )}
      {p.review_comment && (
        <div className="rounded-md bg-surface-subtle p-2 text-ink">
          <span className="text-xs text-ink-subtle">{p.reviewed_by_name}: </span>
          {p.review_comment}
        </div>
      )}
      {p.delivered_on && (
        <div className="text-success">
          Taught on {p.delivered_on}
          {p.delivery_note && ` · ${p.delivery_note}`}
        </div>
      )}
    </div>
  );
}

function PlanForm({
  open,
  plan,
  subjects,
  onClose,
  onSaved,
}: {
  open: boolean;
  plan: LessonPlan | null;
  subjects: ClassSubjectSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const blank = {
    class_subject_id: "",
    section_id: "",
    plan_date: new Date().toISOString().slice(0, 10),
    periods: "1",
    title: "",
    objectives: "",
    activities: "",
    resources: "",
    assessment: "",
    homework: "",
  };
  const [f, setF] = useState(blank);
  const [topicIds, setTopicIds] = useState<Set<number>>(new Set());
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (plan) {
      setF({
        class_subject_id: String(plan.class_subject_id),
        section_id: String(plan.section_id),
        plan_date: plan.plan_date,
        periods: String(plan.periods),
        title: plan.title,
        objectives: plan.objectives ?? "",
        activities: plan.activities ?? "",
        resources: plan.resources ?? "",
        assessment: plan.assessment ?? "",
        homework: plan.homework ?? "",
      });
      setTopicIds(new Set(plan.topics.map((t) => t.id)));
    } else {
      const first = subjects[0];
      setF({
        ...blank,
        class_subject_id: first ? String(first.class_subject_id) : "",
        section_id: first?.sections[0] ? String(first.sections[0].section_id) : "",
      });
      setTopicIds(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, open, subjects]);

  useEffect(() => {
    if (!f.class_subject_id) return setChapters([]);
    api
      .get<{ items: Chapter[] }>(`/api/v1/school/syllabus/${f.class_subject_id}`)
      .then((r) => setChapters(r.data.items))
      .catch(() => setChapters([]));
  }, [f.class_subject_id]);

  const cs = subjects.find((s) => String(s.class_subject_id) === f.class_subject_id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      class_subject_id: Number(f.class_subject_id),
      section_id: Number(f.section_id),
      plan_date: f.plan_date,
      periods: Number(f.periods),
      title: f.title,
      ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, f[k].trim() || null])),
      topic_ids: Array.from(topicIds),
    };
    try {
      if (plan) await api.put(`${base}/${plan.id}`, body);
      else await api.post(base, body);
      onSaved();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={plan ? "Edit lesson plan" : "New lesson plan"} size="lg">
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox>{error}</ErrorBox>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Subject *"
            value={f.class_subject_id}
            onChange={(e) => {
              const next = subjects.find((s) => String(s.class_subject_id) === e.target.value);
              setF({ ...f, class_subject_id: e.target.value, section_id: next?.sections[0] ? String(next.sections[0].section_id) : "" });
              setTopicIds(new Set());
            }}
          >
            {subjects.map((s) => (
              <option key={s.class_subject_id} value={s.class_subject_id}>
                {s.class_name} · {s.subject_name}
              </option>
            ))}
          </Select>
          <Select label="Section *" value={f.section_id} onChange={(e) => setF({ ...f, section_id: e.target.value })}>
            {(cs?.sections ?? []).map((s) => (
              <option key={s.section_id} value={s.section_id}>
                {s.section_label}
              </option>
            ))}
          </Select>
          <Input label="Date *" type="date" value={f.plan_date} onChange={(e) => setF({ ...f, plan_date: e.target.value })} required />
          <Input label="Periods *" type="number" min={1} max={20} value={f.periods} onChange={(e) => setF({ ...f, periods: e.target.value })} required />
        </div>
        <Input label="Title *" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={2} />
        {chapters.length > 0 && (
          <div>
            <div className="mb-1 text-sm font-medium text-ink">Topics covered</div>
            <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-surface-border p-2 text-sm">
              {chapters.map((c) => (
                <div key={c.id}>
                  <div className="text-xs text-ink-subtle">{c.title}</div>
                  {c.topics.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 pl-2 text-ink">
                      <input
                        type="checkbox"
                        checked={topicIds.has(t.id)}
                        onChange={(e) => {
                          const n = new Set(topicIds);
                          if (e.target.checked) n.add(t.id);
                          else n.delete(t.id);
                          setTopicIds(n);
                        }}
                      />
                      {t.title}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        {TEXT_FIELDS.map((k) => (
          <Textarea key={k} label={humanize(k)} rows={k === "activities" ? 3 : 2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        ))}
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

/** Teacher: write/submit/record own plans. Reviewer (admin, principal): approve or return. */
export function LessonPlans({ mode }: { mode: "teacher" | "reviewer" }) {
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | Status>(mode === "reviewer" ? "submitted" : "");
  const [subjects, setSubjects] = useState<ClassSubjectSummary[]>([]);
  const [editing, setEditing] = useState<LessonPlan | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api
      .get<LessonPlan[]>(base, { params: statusFilter ? { status: statusFilter } : {} })
      .then((r) => setPlans(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (mode !== "teacher") return;
    api
      .get<ClassSubjectSummary[]>("/api/v1/school/syllabus")
      .then((r) => setSubjects(r.data.filter((s) => s.can_edit)))
      .catch(() => setSubjects([]));
  }, [mode]);

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      setNotice(done);
      setError(null);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  const review = (p: LessonPlan, decision: "approve" | "return") => {
    const comment = window.prompt(decision === "return" ? "What should change? (required)" : "Comment (optional)", "");
    if (comment === null) return;
    run(() => api.post(`${base}/${p.id}/review`, { decision, comment: comment.trim() || null }), decision === "approve" ? "Approved." : "Returned to the teacher.");
  };

  const deliver = (p: LessonPlan) => {
    const on = window.prompt("Date taught (YYYY-MM-DD)", new Date().toISOString().slice(0, 10));
    if (!on) return;
    const note = window.prompt("How did it go? (optional)", "") ?? "";
    run(() => api.post(`${base}/${p.id}/deliver`, { delivered_on: on, note: note.trim() || null }), "Recorded. Its topics are now marked as taught.");
  };

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | Status)}>
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="submitted">Waiting for review</option>
            <option value="approved">Approved</option>
            <option value="returned">Returned</option>
          </Select>
        </div>
        {mode === "teacher" && (
          <Button
            disabled={subjects.length === 0}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New lesson plan
          </Button>
        )}
        {mode === "teacher" && subjects.length === 0 && (
          <span className="text-xs text-ink-subtle">You aren&apos;t assigned as a subject teacher yet.</span>
        )}
      </div>
      {plans.length === 0 && <p className="text-sm text-ink-subtle">No lesson plans here.</p>}
      {plans.map((p) => (
        <Card key={p.id}>
          <CardBody className="space-y-2">
            <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setOpen(open === p.id ? null : p.id)}>
              <span className="font-medium text-ink">{p.title}</span>
              <Badge tone={tone[p.status]}>{p.status === "submitted" ? "awaiting review" : p.status}</Badge>
              {p.delivered_on && <Badge tone="emerald">taught</Badge>}
              <span className="text-sm text-ink-muted">
                {p.plan_date} · {p.subject_name} · {p.section_label} · {p.periods} period{p.periods > 1 ? "s" : ""}
                {mode === "reviewer" && ` · ${p.teacher_name}`}
              </span>
            </button>
            {open === p.id && <PlanBody p={p} />}
            <div className="flex flex-wrap gap-2">
              {mode === "reviewer" && p.status === "submitted" && (
                <>
                  <Button size="sm" onClick={() => review(p, "approve")}>
                    Approve
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => review(p, "return")}>
                    Return for changes
                  </Button>
                </>
              )}
              {mode === "teacher" && !p.delivered_on && (
                <>
                  {(p.status === "draft" || p.status === "returned") && (
                    <Button size="sm" onClick={() => run(() => api.post(`${base}/${p.id}/submit`), "Submitted for review.")}>
                      Submit
                    </Button>
                  )}
                  {p.status !== "returned" && (
                    <Button size="sm" variant="secondary" onClick={() => deliver(p)}>
                      Mark taught
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(p);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => window.confirm("Delete this plan?") && run(() => api.delete(`${base}/${p.id}`), "Deleted.")}
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
          </CardBody>
        </Card>
      ))}
      {mode === "teacher" && (
        <PlanForm
          open={formOpen}
          plan={editing}
          subjects={subjects}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setNotice(editing ? "Plan updated." : "Draft saved.");
            load();
          }}
        />
      )}
    </div>
  );
}
