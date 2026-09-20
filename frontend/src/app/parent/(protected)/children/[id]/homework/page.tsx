"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Homework = {
  id: number;
  subject_name: string | null;
  subject_code: string | null;
  class_name: string | null;
  title: string;
  description: string;
  attachment_url: string | null;
  due_date: string;
  created_by_name: string | null;
  is_past_due: boolean;
};

type SubmissionStatus = "submitted" | "approved" | "rejected";

type Submission = {
  id: number;
  homework_id: number;
  status: SubmissionStatus;
  attachment_url: string | null;
  comment: string | null;
  submitted_at: string;
  teacher_remark: string | null;
  reviewed_at: string | null;
};

export default function ChildHomeworkPage() {
  const params = useParams<{ id: string }>();
  const [items, setItems] = useState<Homework[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Homework[]>(`/api/v1/parent/me/children/${params.id}/homework`)
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, [params.id]);

  const upcoming = items.filter((h) => !h.is_past_due);
  const past = items.filter((h) => h.is_past_due);

  return (
    <div className="space-y-4">
      <Link
        href={`/parent/children/${params.id}`}
        className="text-sm text-brand-700 hover:underline"
      >
        ← Back to child profile
      </Link>

      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Homework</h1>

      {error && (
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}

      <Section
        title="Upcoming"
        items={upcoming}
        empty="No upcoming homework."
        studentId={params.id}
      />
      {past.length > 0 && (
        <Section
          title="Past due / archive"
          items={past}
          empty=""
          dimmed
          studentId={params.id}
        />
      )}
    </div>
  );
}

function Section({
  title,
  items,
  empty,
  dimmed,
  studentId,
}: {
  title: string;
  items: Homework[];
  empty: string;
  dimmed?: boolean;
  studentId: string;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {items.length === 0 ? (
        <Card className="p-4 text-sm text-slate-500">{empty}</Card>
      ) : (
        <div className="space-y-2">
          {items.map((h) => (
            <HomeworkCard
              key={h.id}
              hw={h}
              dimmed={dimmed}
              studentId={studentId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function statusTone(s: SubmissionStatus) {
  if (s === "approved") return "emerald" as const;
  if (s === "rejected") return "rose" as const;
  return "amber" as const;
}

function HomeworkCard({
  hw,
  dimmed,
  studentId,
}: {
  hw: Homework;
  dimmed?: boolean;
  studentId: string;
}) {
  const [submission, setSubmission] = useState<Submission | null | undefined>(
    undefined
  );
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api
      .get<Submission | null>(
        `/api/v1/parent/me/children/${studentId}/homework/${hw.id}/submission`
      )
      .then((r) => setSubmission(r.data))
      .catch(() => setSubmission(null));
  }, [studentId, hw.id]);

  function onSaved(s: Submission) {
    setSubmission(s);
    setEditing(false);
  }

  return (
    <Card className={dimmed ? "p-4 opacity-70" : "p-4"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{hw.title}</h3>
            <Badge tone={hw.is_past_due ? "neutral" : "brand"}>
              {hw.subject_code}
            </Badge>
            {submission && (
              <Badge tone={statusTone(submission.status)}>
                {submission.status}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {hw.subject_name} · Due <strong>{hw.due_date}</strong>
            {hw.created_by_name && <> · posted by {hw.created_by_name}</>}
          </div>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
            {hw.description}
          </p>
          {hw.attachment_url && (
            <a
              href={hw.attachment_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs text-brand-700 hover:underline"
            >
              Teacher attachment →
            </a>
          )}

          {submission && (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <div className="font-medium text-slate-700">Your submission</div>
              {submission.attachment_url && (
                <a
                  href={submission.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block text-brand-700 hover:underline"
                >
                  {submission.attachment_url}
                </a>
              )}
              {submission.comment && (
                <p className="mt-1 whitespace-pre-line text-slate-600">
                  {submission.comment}
                </p>
              )}
              <div className="mt-1 text-slate-400">
                Submitted {new Date(submission.submitted_at).toLocaleString()}
              </div>
              {submission.teacher_remark && (
                <div className="mt-2 border-t border-slate-200 pt-2">
                  <div className="font-medium text-slate-700">
                    Teacher remark
                  </div>
                  <p className="whitespace-pre-line text-slate-600">
                    {submission.teacher_remark}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {!hw.is_past_due && (
          <div className="shrink-0">
            <Button size="sm" onClick={() => setEditing(true)}>
              {submission ? "Edit submission" : "Submit"}
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <SubmissionModal
          studentId={studentId}
          homeworkId={hw.id}
          existing={submission ?? null}
          onClose={() => setEditing(false)}
          onSaved={onSaved}
        />
      )}
    </Card>
  );
}

function SubmissionModal({
  studentId,
  homeworkId,
  existing,
  onClose,
  onSaved,
}: {
  studentId: string;
  homeworkId: number;
  existing: Submission | null;
  onClose: () => void;
  onSaved: (s: Submission) => void;
}) {
  const [attachment, setAttachment] = useState(existing?.attachment_url ?? "");
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!attachment.trim() && !comment.trim()) {
      setError("Add an attachment URL or a comment.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        attachment_url: attachment.trim() || null,
        comment: comment.trim() || null,
      };
      const path = `/api/v1/parent/me/children/${studentId}/homework/${homeworkId}/submission`;
      const { data } = existing
        ? await api.patch<Submission>(path, body)
        : await api.post<Submission>(path, body);
      onSaved(data);
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
      title={existing ? "Edit submission" : "Submit homework"}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Attachment URL"
          value={attachment}
          onChange={(e) => setAttachment(e.target.value)}
          placeholder="https://drive.google.com/…"
        />
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Comment</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={5}
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="Optional note for the teacher"
          />
        </label>
        {existing && existing.status !== "submitted" && (
          <p className="text-xs text-amber-600">
            Saving will reset the teacher&apos;s review (currently:{" "}
            <strong>{existing.status}</strong>).
          </p>
        )}
        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {existing ? "Save" : "Submit"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
