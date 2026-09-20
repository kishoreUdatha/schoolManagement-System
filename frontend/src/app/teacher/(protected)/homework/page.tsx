"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type SubjectTeacherCard = {
  class_subject_id: number;
  class_name: string;
  subject_name: string;
  subject_code: string;
  is_current_year: boolean;
};

type Homework = {
  id: number;
  class_subject_id: number;
  subject_name: string | null;
  subject_code: string | null;
  class_name: string | null;
  title: string;
  description: string;
  attachment_url: string | null;
  due_date: string;
  created_by_name: string | null;
  created_at: string;
  is_past_due: boolean;
  can_edit: boolean;
  rubric_id: number | null;
  rubric_name: string | null;
  is_closed: boolean;
  closed_at: string | null;
  closed_by_name: string | null;
};

type Rubric = { id: number; name: string; max_total: number; criteria: { id: number; title: string; max_points: number }[] };

type MarkedCriterion = {
  criterion_id: number;
  criterion_title: string;
  max_points: number;
  points: number | null;
  comment: string | null;
};

type Marking = { rubric_id: number; rubric_name: string; max_total: number; total: number | null; criteria: MarkedCriterion[] };

type SubmissionStatus = "submitted" | "approved" | "rejected";

type Submission = {
  id: number;
  homework_id: number;
  student_id: number;
  student_admission_no: string | null;
  student_name: string | null;
  attachment_url: string | null;
  comment: string | null;
  submitted_at: string;
  status: SubmissionStatus;
  teacher_remark: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  marking: Marking | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function HomeworkPage() {
  const [subjects, setSubjects] = useState<SubjectTeacherCard[]>([]);
  const [items, setItems] = useState<Homework[]>([]);
  const [classSubjectFilter, setClassSubjectFilter] = useState<number | "">("");
  const [includePast, setIncludePast] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<Homework | null>(null);
  const [viewSubsFor, setViewSubsFor] = useState<Homework | null>(null);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);

  useEffect(() => {
    api
      .get<{ subject_teacher_of: SubjectTeacherCard[] }>("/api/v1/teacher/my-classes")
      .then((r) => setSubjects(r.data.subject_teacher_of))
      .catch((e) => setError(apiError(e)));
    api
      .get<Rubric[]>("/api/v1/school/rubrics")
      .then((r) => setRubrics(r.data))
      .catch(() => setRubrics([]));
  }, []);

  async function setClosed(h: Homework, closed: boolean) {
    try {
      await api.post(`/api/v1/teacher/homework/${h.id}/close`, { closed });
      setNotice(closed ? `"${h.title}" closed — no more submissions.` : `"${h.title}" is open again.`);
      setError(null);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function load() {
    try {
      const params: Record<string, string | number | boolean> = {
        include_past: includePast,
      };
      if (classSubjectFilter) params.class_subject_id = classSubjectFilter;
      const { data } = await api.get<Homework[]>("/api/v1/teacher/homework", {
        params,
      });
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classSubjectFilter, includePast]);

  async function remove(h: Homework) {
    if (!window.confirm(`Delete "${h.title}"?`)) return;
    try {
      await api.delete(`/api/v1/teacher/homework/${h.id}`);
      setNotice("Deleted.");
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Homework</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Post homework to a class-subject. Visible to parents of every section
            in that class.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)} disabled={subjects.length === 0}>
          + New homework
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Class-subject</span>
          <select
            value={classSubjectFilter}
            onChange={(e) =>
              setClassSubjectFilter(e.target.value ? Number(e.target.value) : "")
            }
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="">All</option>
            {subjects.map((s) => (
              <option key={s.class_subject_id} value={s.class_subject_id}>
                {s.class_name} → {s.subject_name} ({s.subject_code})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includePast}
            onChange={(e) => setIncludePast(e.target.checked)}
            className="rounded border-slate-300"
          />
          Include past due
        </label>
      </div>

      {error && (
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-[#E9F7F0] px-4 py-3 text-[13px] font-medium text-[#07845E] dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>
      )}

      <div className="space-y-3">
        {items.map((h) => (
          <Card key={h.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{h.title}</h3>
                  {h.is_closed ? (
                    <Badge tone="rose">closed</Badge>
                  ) : h.is_past_due ? (
                    <Badge tone="neutral">past due</Badge>
                  ) : (
                    <Badge tone="brand">{h.subject_code}</Badge>
                  )}
                  {h.rubric_name && <Badge tone="brand">{h.rubric_name}</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {h.class_name} · {h.subject_name} · due{" "}
                  <strong>{h.due_date}</strong>
                  {h.is_closed && h.closed_by_name && ` · closed by ${h.closed_by_name}`}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
                  {h.description}
                </p>
                {h.attachment_url && (
                  <a
                    href={h.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs text-brand-700 hover:underline"
                  >
                    Attachment →
                  </a>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setViewSubsFor(h)}
                >
                  Submissions
                </Button>
                {h.is_closed ? (
                  <Button size="sm" variant="secondary" onClick={() => setClosed(h, false)}>
                    Reopen
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setClosed(h, true)}>
                    Close
                  </Button>
                )}
                {h.can_edit && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(h)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(h)}>
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}
        {items.length === 0 && (
          <Card className="p-8 text-center text-slate-500">
            {subjects.length === 0
              ? "You aren't assigned as a subject teacher anywhere yet."
              : "No homework posted yet."}
          </Card>
        )}
      </div>

      {(openCreate || editing) && (
        <HomeworkFormModal
          existing={editing}
          subjects={subjects}
          rubrics={rubrics}
          onClose={() => {
            setOpenCreate(false);
            setEditing(null);
          }}
          onSaved={(msg) => {
            setOpenCreate(false);
            setEditing(null);
            setNotice(msg);
            load();
          }}
        />
      )}
      {viewSubsFor && (
        <SubmissionsModal
          hw={viewSubsFor}
          onClose={() => setViewSubsFor(null)}
        />
      )}
    </div>
  );
}

function HomeworkFormModal({
  existing,
  subjects,
  rubrics,
  onClose,
  onSaved,
}: {
  existing: Homework | null;
  subjects: SubjectTeacherCard[];
  rubrics: Rubric[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    class_subject_id: existing?.class_subject_id ?? subjects[0]?.class_subject_id ?? 0,
    title: existing?.title ?? "",
    description: existing?.description ?? "",
    attachment_url: existing?.attachment_url ?? "",
    due_date: existing?.due_date ?? todayIso(),
    rubric_id: existing?.rubric_id ? String(existing.rubric_id) : "",
    notify_parents: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        attachment_url: form.attachment_url || null,
        due_date: form.due_date,
        rubric_id: form.rubric_id ? Number(form.rubric_id) : null,
      };
      if (existing) {
        await api.patch(`/api/v1/teacher/homework/${existing.id}`, payload);
        onSaved("Homework updated.");
      } else {
        payload.class_subject_id = form.class_subject_id;
        payload.notify_parents = form.notify_parents;
        await api.post("/api/v1/teacher/homework", payload);
        onSaved(form.notify_parents ? "Homework posted + parents notified." : "Homework posted.");
      }
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? `Edit homework` : "New homework"}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {!existing && (
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Class-subject *</span>
            <select
              value={form.class_subject_id}
              onChange={(e) =>
                setForm({ ...form, class_subject_id: Number(e.target.value) })
              }
              className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
              required
            >
              {subjects.map((s) => (
                <option key={s.class_subject_id} value={s.class_subject_id}>
                  {s.class_name} → {s.subject_name} ({s.subject_code})
                </option>
              ))}
            </select>
          </label>
        )}
        <Input
          label="Title *"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Description *</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={5}
            required
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Due date *"
            type="date"
            min={todayIso()}
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            required
          />
          <Input
            label="Attachment URL"
            value={form.attachment_url}
            onChange={(e) => setForm({ ...form, attachment_url: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Mark against a rubric</span>
          <select
            value={form.rubric_id}
            onChange={(e) => setForm({ ...form, rubric_id: e.target.value })}
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="">No rubric — approve or reject only</option>
            {rubrics.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} (out of {r.max_total})
              </option>
            ))}
          </select>
        </label>
        {!existing && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.notify_parents}
              onChange={(e) =>
                setForm({ ...form, notify_parents: e.target.checked })
              }
              className="rounded border-slate-300"
            />
            Send notice to parents of this class
          </label>
        )}
        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {existing ? "Save" : "Post"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function statusTone(s: SubmissionStatus) {
  if (s === "approved") return "emerald" as const;
  if (s === "rejected") return "rose" as const;
  return "amber" as const;
}

function SubmissionsModal({
  hw,
  onClose,
}: {
  hw: Homework;
  onClose: () => void;
}) {
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [remarkDraft, setRemarkDraft] = useState<Record<number, string>>({});
  // marks being typed, keyed "<submission>:<criterion>"
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [marking, setMarking] = useState<number | null>(null);

  async function saveMarks(sub: Submission) {
    if (!sub.marking) return;
    const scores = sub.marking.criteria
      .map((c) => ({ criterion_id: c.criterion_id, points: marks[`${sub.id}:${c.criterion_id}`] }))
      .filter((x) => x.points !== undefined && x.points !== "")
      .map((x) => ({ criterion_id: x.criterion_id, points: Number(x.points) }));
    if (scores.length === 0) {
      setError("Put a mark against at least one criterion.");
      return;
    }
    setMarking(sub.id);
    setError(null);
    try {
      await api.put(`/api/v1/teacher/homework/submissions/${sub.id}/rubric-scores`, { scores });
      await load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setMarking(null);
    }
  }

  async function load() {
    try {
      const { data } = await api.get<Submission[]>(
        `/api/v1/teacher/homework/${hw.id}/submissions`
      );
      setSubs(data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hw.id]);

  async function review(sub: Submission, status: "approved" | "rejected") {
    setReviewing(sub.id);
    setError(null);
    try {
      const { data } = await api.patch<Submission>(
        `/api/v1/teacher/homework/submissions/${sub.id}/review`,
        { status, teacher_remark: remarkDraft[sub.id]?.trim() || null }
      );
      setSubs((prev) =>
        prev ? prev.map((s) => (s.id === data.id ? data : s)) : prev
      );
    } catch (e) {
      setError(apiError(e));
    } finally {
      setReviewing(null);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Submissions — ${hw.title}`} size="lg">
      <div className="space-y-3">
        <div className="text-xs text-slate-500">
          {hw.class_name} · {hw.subject_name} · due {hw.due_date}
        </div>

        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
            {error}
          </div>
        )}

        {subs === null && (
          <div className="text-sm text-slate-500">Loading…</div>
        )}

        {subs && subs.length === 0 && (
          <Card className="p-6 text-center text-sm text-slate-500">
            No submissions yet.
          </Card>
        )}

        {subs && subs.length > 0 && (
          <div className="space-y-2">
            {subs.map((s) => (
              <Card key={s.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {s.student_name}
                      </span>
                      <span className="text-[12px] tabular-nums text-ink-muted">
                        {s.student_admission_no}
                      </span>
                      <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Submitted {new Date(s.submitted_at).toLocaleString()}
                    </div>
                    {s.attachment_url && (
                      <a
                        href={s.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block break-all text-xs text-brand-700 hover:underline"
                      >
                        {s.attachment_url}
                      </a>
                    )}
                    {s.comment && (
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                        {s.comment}
                      </p>
                    )}
                    {s.teacher_remark && (
                      <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                        <span className="font-medium text-slate-700">
                          Your remark:
                        </span>{" "}
                        {s.teacher_remark}
                      </div>
                    )}
                  </div>
                </div>
                {s.marking && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{s.marking.rubric_name}</span>
                      <span className="font-medium text-slate-700">
                        {s.marking.total === null ? "Not marked" : `${s.marking.total} / ${s.marking.max_total}`}
                      </span>
                    </div>
                    {s.marking.criteria.map((c) => (
                      <div key={c.criterion_id} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 text-slate-700">{c.criterion_title}</span>
                        <input
                          type="number"
                          min={0}
                          max={c.max_points}
                          step="0.5"
                          value={marks[`${s.id}:${c.criterion_id}`] ?? (c.points ?? "")}
                          onChange={(e) => setMarks({ ...marks, [`${s.id}:${c.criterion_id}`]: e.target.value })}
                          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-xs shadow-sm"
                        />
                        <span className="w-12 text-slate-500">/ {c.max_points}</span>
                      </div>
                    ))}
                    <Button size="sm" variant="secondary" loading={marking === s.id} onClick={() => saveMarks(s)}>
                      Save marks
                    </Button>
                  </div>
                )}
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-2">
                  <textarea
                    rows={2}
                    placeholder="Remark (optional)"
                    value={remarkDraft[s.id] ?? ""}
                    onChange={(e) =>
                      setRemarkDraft({
                        ...remarkDraft,
                        [s.id]: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs shadow-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => review(s, "approved")}
                      loading={reviewing === s.id}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => review(s, "rejected")}
                      loading={reviewing === s.id}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
