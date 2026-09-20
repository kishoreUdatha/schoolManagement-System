"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type ProjectKind = "individual" | "group";
type ProgressStatus = "not_started" | "in_progress" | "submitted" | "reviewed";

type SubjectCard = {
  class_subject_id: number;
  class_name: string;
  subject_name: string;
  subject_code: string;
};

type Project = {
  id: number;
  class_subject_id: number;
  class_name: string | null;
  subject_name: string | null;
  subject_code: string | null;
  title: string;
  description: string;
  attachment_url: string | null;
  deadline: string;
  kind: ProjectKind;
  created_by_name: string | null;
  is_past_due: boolean;
  progress_count: number;
  eligible_student_count: number;
};

type Progress = {
  id: number;
  project_id: number;
  student_id: number;
  student_name: string | null;
  student_admission_no: string | null;
  status: ProgressStatus;
  attachment_url: string | null;
  comment: string | null;
  submitted_at: string | null;
  teacher_remark: string | null;
  rating: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
};

function statusTone(s: ProgressStatus) {
  if (s === "reviewed") return "emerald" as const;
  if (s === "submitted") return "brand" as const;
  if (s === "in_progress") return "amber" as const;
  return "neutral" as const;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function TeacherProjectsPage() {
  const [subjects, setSubjects] = useState<SubjectCard[]>([]);
  const [items, setItems] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [viewing, setViewing] = useState<Project | null>(null);

  useEffect(() => {
    api
      .get<{ subject_teacher_of: SubjectCard[] }>("/api/v1/teacher/my-classes")
      .then((r) => setSubjects(r.data.subject_teacher_of))
      .catch((e) => setError(apiError(e)));
  }, []);

  async function load() {
    try {
      const { data } = await api.get<Project[]>("/api/v1/teacher/projects");
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(p: Project) {
    if (!window.confirm(`Delete project "${p.title}"?`)) return;
    try {
      await api.delete(`/api/v1/teacher/projects/${p.id}`);
      setNotice("Deleted.");
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Projects</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Assign hands-on projects to your classes and review student
            submissions.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)} disabled={subjects.length === 0}>
          + New project
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">
          {notice}
        </div>
      )}

      {items.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-muted">
              {subjects.length === 0
                ? "You aren't assigned as a subject teacher anywhere yet."
                : "No projects yet — assign one to get started."}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>
                  <span className="mr-2">{p.title}</span>
                  <Badge tone={p.is_past_due ? "rose" : "brand"}>
                    {p.subject_code}
                  </Badge>
                  <Badge tone="neutral" className="ml-1">
                    {p.kind}
                  </Badge>
                  {p.is_past_due && (
                    <Badge tone="rose" className="ml-1">
                      past due
                    </Badge>
                  )}
                </CardTitle>
                <div className="text-xs text-ink-muted">
                  {p.class_name} · due <strong>{p.deadline}</strong>
                </div>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm text-ink">
                  {p.description}
                </p>
                {p.attachment_url && (
                  <a
                    href={p.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs text-brand-400 hover:underline"
                  >
                    Guidelines attachment →
                  </a>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <Badge tone="brand">
                    {p.progress_count} / {p.eligible_student_count} updates
                  </Badge>
                  <div className="ml-auto flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setViewing(p)}
                    >
                      Progress
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(p)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {openCreate && (
        <ProjectCreateModal
          subjects={subjects}
          onClose={() => setOpenCreate(false)}
          onDone={(msg) => {
            setOpenCreate(false);
            setNotice(msg);
            load();
          }}
        />
      )}
      {viewing && (
        <ProgressRosterModal
          project={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function ProjectCreateModal({
  subjects,
  onClose,
  onDone,
}: {
  subjects: SubjectCard[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [csId, setCsId] = useState<number>(subjects[0]?.class_subject_id ?? 0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState("");
  const [deadline, setDeadline] = useState(todayIso());
  const [kind, setKind] = useState<ProjectKind>("individual");
  const [notify, setNotify] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/teacher/projects", {
        class_subject_id: csId,
        title,
        description,
        attachment_url: attachment.trim() || null,
        deadline,
        kind,
        notify_parents: notify,
      });
      onDone(
        notify ? "Project posted + parents notified." : "Project posted."
      );
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New project" size="lg">
      <form onSubmit={submit} className="space-y-4">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Class-subject *</span>
          <select
            value={csId}
            onChange={(e) => setCsId(Number(e.target.value))}
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
        <Input
          label="Title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Description *</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            required
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Deadline *"
            type="date"
            min={todayIso()}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            required
          />
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ProjectKind)}
              className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="individual">Individual</option>
              <option value="group">Group</option>
            </select>
          </label>
        </div>
        <Input
          label="Guidelines URL"
          value={attachment}
          onChange={(e) => setAttachment(e.target.value)}
          placeholder="https://…"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="rounded border-slate-300"
          />
          Notify parents of this class
        </label>
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Assign
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ProgressRosterModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Progress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [remarkDraft, setRemarkDraft] = useState<Record<number, string>>({});
  const [ratingDraft, setRatingDraft] = useState<Record<number, number>>({});

  async function load() {
    try {
      const { data } = await api.get<Progress[]>(
        `/api/v1/teacher/projects/${project.id}/progress`
      );
      setRows(data);
    } catch (e) {
      setError(apiError(e));
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function review(pp: Progress) {
    if (pp.id === 0) {
      setError("No submission yet to review.");
      return;
    }
    setReviewing(pp.id);
    try {
      await api.patch(`/api/v1/teacher/projects/progress/${pp.id}/review`, {
        teacher_remark: remarkDraft[pp.id]?.trim() || null,
        rating: ratingDraft[pp.id] ?? null,
      });
      await load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setReviewing(null);
    }
  }

  const counts = useMemo(() => {
    const c = { not_started: 0, in_progress: 0, submitted: 0, reviewed: 0 };
    rows?.forEach((r) => (c[r.status] = (c[r.status] || 0) + 1));
    return c;
  }, [rows]);

  return (
    <Modal open onClose={onClose} title={`Progress — ${project.title}`} size="lg">
      <div className="space-y-3">
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
            {error}
          </div>
        )}
        {rows === null ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="neutral">not started: {counts.not_started}</Badge>
              <Badge tone="amber">in progress: {counts.in_progress}</Badge>
              <Badge tone="brand">submitted: {counts.submitted}</Badge>
              <Badge tone="emerald">reviewed: {counts.reviewed}</Badge>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-auto">
              {rows.map((r) => (
                <Card key={`${r.student_id}-${r.id}`}>
                  <CardBody>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-ink">
                          {r.student_name}{" "}
                          <span className="text-[12px] tabular-nums text-ink-subtle">
                            {r.student_admission_no}
                          </span>
                        </div>
                        <Badge tone={statusTone(r.status)} className="mt-1">
                          {r.status}
                        </Badge>
                      </div>
                      {r.rating != null && (
                        <Badge tone="emerald">★ {r.rating}/5</Badge>
                      )}
                    </div>
                    {r.attachment_url && (
                      <a
                        href={r.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block break-all text-xs text-brand-400 hover:underline"
                      >
                        {r.attachment_url}
                      </a>
                    )}
                    {r.comment && (
                      <p className="mt-1 whitespace-pre-line text-sm text-ink">
                        {r.comment}
                      </p>
                    )}
                    {r.teacher_remark && (
                      <div className="mt-2 rounded-md border border-surface-border bg-surface-subtle px-2 py-1.5 text-xs text-ink-muted">
                        <span className="font-medium text-ink">Your remark:</span>{" "}
                        {r.teacher_remark}
                      </div>
                    )}
                    {r.id !== 0 && r.status !== "not_started" && (
                      <div className="mt-3 space-y-2 border-t border-surface-border pt-2">
                        <div className="flex gap-2 text-xs">
                          <textarea
                            rows={2}
                            placeholder="Remark (optional)"
                            value={remarkDraft[r.id] ?? ""}
                            onChange={(e) =>
                              setRemarkDraft({
                                ...remarkDraft,
                                [r.id]: e.target.value,
                              })
                            }
                            className="flex-1 rounded-md border border-surface-border bg-surface-subtle px-2 py-1.5"
                          />
                          <label className="flex flex-col gap-1">
                            <span className="text-ink-muted">Rating</span>
                            <select
                              value={ratingDraft[r.id] ?? r.rating ?? ""}
                              onChange={(e) =>
                                setRatingDraft({
                                  ...ratingDraft,
                                  [r.id]: Number(e.target.value),
                                })
                              }
                              className="rounded-md border border-surface-border bg-surface-subtle px-2 py-1.5"
                            >
                              <option value="">—</option>
                              {[0, 1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <Button
                          size="sm"
                          loading={reviewing === r.id}
                          onClick={() => review(r)}
                        >
                          Mark reviewed
                        </Button>
                      </div>
                    )}
                  </CardBody>
                </Card>
              ))}
            </div>
          </>
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
