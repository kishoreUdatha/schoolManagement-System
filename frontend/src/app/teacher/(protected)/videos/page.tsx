"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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
};

type Video = {
  id: number;
  class_subject_id: number;
  subject_name: string | null;
  subject_code: string | null;
  class_name: string | null;
  title: string;
  description: string | null;
  youtube_video_id: string;
  youtube_url: string;
  thumbnail_url: string;
  embed_url: string;
  teacher_name: string | null;
  is_active: boolean;
  created_at: string;
  completion_count: number;
  eligible_student_count: number;
};

type CompletionRow = {
  student_id: number;
  admission_no: string;
  roll_no: number;
  full_name: string;
  section_label: string;
  completed: boolean;
  completed_at: string | null;
};

type CompletionRoster = {
  video_id: number;
  completion_count: number;
  eligible_student_count: number;
  rows: CompletionRow[];
};

// Lightweight client-side preview of the YouTube ID; backend re-validates.
function previewVideoId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})/,
    /(?:https?:\/\/)?youtu\.be\/([A-Za-z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export default function TeacherVideosPage() {
  const [subjects, setSubjects] = useState<SubjectTeacherCard[]>([]);
  const [items, setItems] = useState<Video[]>([]);
  const [filter, setFilter] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<Video | null>(null);
  const [completionsFor, setCompletionsFor] = useState<Video | null>(null);

  useEffect(() => {
    api
      .get<{ subject_teacher_of: SubjectTeacherCard[] }>("/api/v1/teacher/my-classes")
      .then((r) => setSubjects(r.data.subject_teacher_of))
      .catch((e) => setError(apiError(e)));
  }, []);

  async function load() {
    try {
      const params: Record<string, string | number> = {};
      if (filter) params.class_subject_id = filter;
      const { data } = await api.get<Video[]>("/api/v1/teacher/videos", { params });
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function remove(v: Video) {
    if (!window.confirm(`Delete "${v.title}"?`)) return;
    try {
      await api.delete(`/api/v1/teacher/videos/${v.id}`);
      setNotice("Removed.");
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Learning videos</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Share YouTube videos with parents of the classes you teach. Only
            youtube.com / youtu.be links are accepted.
          </p>
        </div>
        <Button
          onClick={() => setOpenCreate(true)}
          disabled={subjects.length === 0}
        >
          + Add video
        </Button>
      </div>

      <label className="flex flex-col gap-1 text-sm max-w-md">
        <span className="text-[12px] font-bold text-ink-muted">Filter by class-subject</span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value ? Number(e.target.value) : "")}
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((v) => (
          <Card key={v.id} className="overflow-hidden">
            <a
              href={v.youtube_url}
              target="_blank"
              rel="noreferrer"
              className="block bg-slate-100"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={v.thumbnail_url}
                alt={v.title}
                className="aspect-video w-full object-cover"
              />
            </a>
            <div className="p-3">
              <div className="flex items-center gap-2">
                <Badge tone="brand">{v.subject_code}</Badge>
                <span className="text-xs text-slate-500">{v.class_name}</span>
                <Badge
                  tone={v.completion_count > 0 ? "emerald" : "neutral"}
                  className="ml-auto"
                >
                  {v.completion_count} / {v.eligible_student_count} watched
                </Badge>
              </div>
              <h3 className="mt-2 font-semibold text-slate-900 line-clamp-2">
                {v.title}
              </h3>
              {v.description && (
                <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                  {v.description}
                </p>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCompletionsFor(v)}
                >
                  Completions
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(v)}>
                  Edit
                </Button>
                <Button size="sm" variant="danger" onClick={() => remove(v)}>
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {items.length === 0 && (
          <Card className="col-span-full p-8 text-center text-slate-500">
            {subjects.length === 0
              ? "You aren't assigned as a subject teacher anywhere yet."
              : "No videos posted yet."}
          </Card>
        )}
      </div>

      {(openCreate || editing) && (
        <VideoFormModal
          existing={editing}
          subjects={subjects}
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
      {completionsFor && (
        <CompletionsModal
          video={completionsFor}
          onClose={() => setCompletionsFor(null)}
        />
      )}
    </div>
  );
}

function CompletionsModal({
  video,
  onClose,
}: {
  video: Video;
  onClose: () => void;
}) {
  const [roster, setRoster] = useState<CompletionRoster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOnly, setShowOnly] = useState<"all" | "watched" | "missed">("all");

  useEffect(() => {
    api
      .get<CompletionRoster>(`/api/v1/teacher/videos/${video.id}/completions`)
      .then((r) => setRoster(r.data))
      .catch((e) => setError(apiError(e)));
  }, [video.id]);

  const rows = roster
    ? roster.rows.filter(
        (r) =>
          showOnly === "all" ||
          (showOnly === "watched" ? r.completed : !r.completed)
      )
    : [];

  return (
    <Modal open onClose={onClose} title={`Completions — ${video.title}`} size="lg">
      <div className="space-y-3">
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
            {error}
          </div>
        )}
        {!roster ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="emerald">
                {roster.completion_count} / {roster.eligible_student_count}{" "}
                watched
              </Badge>
              <div className="ml-auto inline-flex rounded-md bg-slate-100 p-0.5 text-xs">
                {(["all", "watched", "missed"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setShowOnly(t)}
                    className={
                      "rounded-md px-2.5 py-1 font-medium " +
                      (showOnly === t
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:bg-slate-200")
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <table className="min-w-full divide-y divide-surface-border text-[13px]">
              <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                <tr>
                  <th className="px-4 py-3 font-bold">Section</th>
                  <th className="px-4 py-3 font-bold">Roll</th>
                  <th className="px-4 py-3 font-bold">Admission #</th>
                  <th className="px-4 py-3 font-bold">Name</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.student_id}>
                    <td className="px-4 py-3 text-slate-600">
                      {r.section_label}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.roll_no}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">
                      {r.admission_no}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {r.full_name}
                    </td>
                    <td className="px-4 py-3">
                      {r.completed ? (
                        <div className="flex flex-col">
                          <Badge tone="emerald">watched ✓</Badge>
                          {r.completed_at && (
                            <span className="mt-0.5 text-[11px] text-slate-500">
                              {new Date(r.completed_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge tone="neutral">not watched</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      No students match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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

function VideoFormModal({
  existing,
  subjects,
  onClose,
  onSaved,
}: {
  existing: Video | null;
  subjects: SubjectTeacherCard[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    class_subject_id:
      existing?.class_subject_id ?? subjects[0]?.class_subject_id ?? 0,
    title: existing?.title ?? "",
    description: existing?.description ?? "",
    youtube_url: existing?.youtube_url ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewId = useMemo(() => previewVideoId(form.youtube_url), [form.youtube_url]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        description: form.description || null,
        youtube_url: form.youtube_url,
      };
      if (existing) {
        await api.patch(`/api/v1/teacher/videos/${existing.id}`, payload);
        onSaved("Video updated.");
      } else {
        payload.class_subject_id = form.class_subject_id;
        await api.post("/api/v1/teacher/videos", payload);
        onSaved("Video posted.");
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
      title={existing ? "Edit video" : "Add video"}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {!existing && (
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">
              Class-subject *
            </span>
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
          <span className="text-[12px] font-bold text-ink-muted">Description</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="Optional — what should the student learn from this?"
          />
        </label>
        <Input
          label="YouTube URL *"
          value={form.youtube_url}
          onChange={(e) => setForm({ ...form, youtube_url: e.target.value })}
          placeholder="https://www.youtube.com/watch?v=… or https://youtu.be/…"
          required
        />
        {previewId ? (
          <div className="space-y-1">
            <div className="text-xs text-slate-500">Preview</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://img.youtube.com/vi/${previewId}/mqdefault.jpg`}
              alt="thumbnail"
              className="aspect-video max-w-xs rounded-lg border border-slate-200 object-cover"
            />
          </div>
        ) : (
          form.youtube_url.length > 0 && (
            <div className="text-xs text-amber-600">
              That doesn&apos;t look like a YouTube URL. Use youtube.com/watch?v=
              or youtu.be/.
            </div>
          )
        )}
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
            {existing ? "Save" : "Post"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
