"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type ProgressStatus = "not_started" | "in_progress" | "submitted" | "reviewed";

type Project = {
  id: number;
  subject_name: string | null;
  subject_code: string | null;
  class_name: string | null;
  title: string;
  description: string;
  attachment_url: string | null;
  deadline: string;
  kind: "individual" | "group";
  is_past_due: boolean;
};

type Progress = {
  id: number;
  status: ProgressStatus;
  attachment_url: string | null;
  comment: string | null;
  submitted_at: string | null;
  teacher_remark: string | null;
  rating: number | null;
  reviewed_at: string | null;
};

function statusTone(s: ProgressStatus) {
  if (s === "reviewed") return "emerald" as const;
  if (s === "submitted") return "brand" as const;
  if (s === "in_progress") return "amber" as const;
  return "neutral" as const;
}

export default function ChildProjectsPage() {
  const params = useParams<{ id: string }>();
  const [items, setItems] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Project[]>(`/api/v1/parent/me/children/${params.id}/projects`)
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, [params.id]);

  return (
    <div className="space-y-4">
      <Link
        href={`/parent/children/${params.id}`}
        className="text-sm text-brand-400 hover:underline"
      >
        ← Back to child profile
      </Link>
      <h1 className="text-2xl font-bold text-ink">Projects</h1>
      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {items.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-muted">No projects assigned yet.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <ProjectCard key={p.id} studentId={params.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  studentId,
  project,
}: {
  studentId: string;
  project: Project;
}) {
  const [pp, setPp] = useState<Progress | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api
      .get<Progress | null>(
        `/api/v1/parent/me/children/${studentId}/projects/${project.id}/progress`
      )
      .then((r) => setPp(r.data))
      .catch(() => setPp(null));
  }, [studentId, project.id]);

  function onSaved(updated: Progress) {
    setPp(updated);
    setEditing(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {project.title}{" "}
          <Badge tone={project.is_past_due ? "rose" : "brand"} className="ml-2">
            {project.subject_code}
          </Badge>{" "}
          <Badge tone="neutral">{project.kind}</Badge>
          {pp && <Badge tone={statusTone(pp.status)} className="ml-1">{pp.status}</Badge>}
        </CardTitle>
        <div className="text-xs text-ink-muted">
          Due <strong>{project.deadline}</strong>
        </div>
      </CardHeader>
      <CardBody>
        <p className="whitespace-pre-line text-sm text-ink">
          {project.description}
        </p>
        {project.attachment_url && (
          <a
            href={project.attachment_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs text-brand-400 hover:underline"
          >
            Teacher attachment →
          </a>
        )}
        {pp && (
          <div className="mt-3 rounded-md border border-surface-border bg-surface-subtle px-3 py-2 text-sm">
            <div className="text-xs text-ink-subtle">Your child&apos;s progress</div>
            {pp.attachment_url && (
              <a
                href={pp.attachment_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-xs text-brand-400 hover:underline"
              >
                {pp.attachment_url}
              </a>
            )}
            {pp.comment && (
              <p className="mt-1 whitespace-pre-line">{pp.comment}</p>
            )}
            {pp.teacher_remark && (
              <div className="mt-2 border-t border-surface-border pt-2">
                <div className="text-xs font-medium text-ink">Teacher remark</div>
                <p className="text-ink-muted">{pp.teacher_remark}</p>
                {pp.rating != null && (
                  <Badge tone="emerald" className="mt-1">
                    ★ {pp.rating}/5
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}
        {!project.is_past_due && (
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={() => setEditing(true)}>
              {pp ? "Update progress" : "Add progress"}
            </Button>
          </div>
        )}
      </CardBody>
      {editing && (
        <ProgressModal
          studentId={studentId}
          projectId={project.id}
          existing={pp ?? null}
          onClose={() => setEditing(false)}
          onSaved={onSaved}
        />
      )}
    </Card>
  );
}

function ProgressModal({
  studentId,
  projectId,
  existing,
  onClose,
  onSaved,
}: {
  studentId: string;
  projectId: number;
  existing: Progress | null;
  onClose: () => void;
  onSaved: (p: Progress) => void;
}) {
  const [status, setStatus] = useState<ProgressStatus>(
    existing?.status ?? "in_progress"
  );
  const [attachment, setAttachment] = useState(existing?.attachment_url ?? "");
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post<Progress>(
        `/api/v1/parent/me/children/${studentId}/projects/${projectId}/progress`,
        {
          status,
          attachment_url: attachment.trim() || null,
          comment: comment.trim() || null,
        }
      );
      onSaved(data);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Update project progress">
      <form onSubmit={submit} className="space-y-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink-muted">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProgressStatus)}
            className="rounded-lg border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-ink"
          >
            <option value="in_progress">In progress</option>
            <option value="submitted">Submitted</option>
          </select>
        </label>
        <Input
          label="Attachment URL"
          value={attachment}
          onChange={(e) => setAttachment(e.target.value)}
          placeholder="https://drive.google.com/…"
        />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink-muted">Comment</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={5}
            placeholder="Notes for the teacher"
            className="rounded-lg border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-ink"
          />
        </label>
        {existing && existing.teacher_remark && (
          <p className="text-xs text-amber-600">
            Saving will reset the teacher&apos;s previous review.
          </p>
        )}
        {error && (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
