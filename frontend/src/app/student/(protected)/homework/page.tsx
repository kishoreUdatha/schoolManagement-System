"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Textarea } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";
import { readableDate } from "@/lib/dates";

type Homework = {
  id: number;
  subject_name: string | null;
  subject_code: string | null;
  title: string;
  description: string;
  attachment_url: string | null;
  due_date: string;
  created_by_name: string | null;
  is_past_due: boolean;
  is_closed: boolean;
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

export default function StudentHomeworkPage() {
  const [items, setItems] = useState<Homework[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get<Homework[]>("/api/v1/student/homework")
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoaded(true));
  }, []);

  // Soonest first. What is due tomorrow matters more than what was set first.
  const todo = [...items]
    .filter((h) => !h.is_past_due)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const gone = [...items]
    .filter((h) => h.is_past_due)
    .sort((a, b) => b.due_date.localeCompare(a.due_date));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homework"
        subtitle="Everything your teachers have set, with what is due first at the top."
      />
      <ErrorBox>{error}</ErrorBox>

      {loaded && items.length === 0 && (
        <Card className="p-6 text-center text-[13px] text-ink-muted">
          Nothing has been set yet.
        </Card>
      )}

      {todo.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-extrabold uppercase tracking-[0.6px] text-ink-muted">
            To do
          </h2>
          {todo.map((h) => (
            <HomeworkCard key={h.id} hw={h} />
          ))}
        </section>
      )}

      {gone.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-extrabold uppercase tracking-[0.6px] text-ink-muted">
            Already due
          </h2>
          {gone.map((h) => (
            <HomeworkCard key={h.id} hw={h} past />
          ))}
        </section>
      )}
    </div>
  );
}

function statusLabel(s: SubmissionStatus): string {
  if (s === "approved") return "Marked";
  if (s === "rejected") return "Have another go";
  return "Handed in";
}

function statusTone(s: SubmissionStatus) {
  if (s === "approved") return "emerald" as const;
  if (s === "rejected") return "amber" as const;
  return "brand" as const;
}

function HomeworkCard({ hw, past }: { hw: Homework; past?: boolean }) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api
      .get<Submission | null>(`/api/v1/student/homework/${hw.id}/submission`)
      .then((r) => setSubmission(r.data))
      .catch(() => setSubmission(null));
  }, [hw.id]);

  const handedIn = submission !== null;
  const late = past && !handedIn;

  return (
    <Card className={past ? "p-4 opacity-80" : "p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-extrabold text-ink">{hw.title}</h3>
            {hw.subject_code && <Badge tone="neutral">{hw.subject_code}</Badge>}
            {submission && (
              <Badge tone={statusTone(submission.status)}>
                {statusLabel(submission.status)}
              </Badge>
            )}
            {late && <Badge tone="rose">Not handed in</Badge>}
            {hw.is_closed && <Badge tone="neutral">Closed</Badge>}
          </div>

          <p className="mt-1 text-[12px] text-ink-muted">
            {hw.subject_name} · Due {readableDate(hw.due_date)}
            {hw.created_by_name && <> · set by {hw.created_by_name}</>}
          </p>

          {hw.description && (
            <p className="mt-2 whitespace-pre-line text-[13px] text-ink-muted">
              {hw.description}
            </p>
          )}

          {hw.attachment_url && (
            <a
              href={hw.attachment_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-[12px] font-bold text-brand-600 hover:underline"
            >
              Open what the teacher attached
            </a>
          )}

          {submission && (
            <div className="mt-3 rounded-[10px] border border-surface-border bg-surface-subtle px-3 py-2">
              <div className="text-[12px] font-bold text-ink">What you handed in</div>
              {submission.comment && (
                <p className="mt-1 whitespace-pre-line text-[12px] text-ink-muted">
                  {submission.comment}
                </p>
              )}
              {submission.attachment_url && (
                <a
                  href={submission.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block break-all text-[12px] font-bold text-brand-600 hover:underline"
                >
                  {submission.attachment_url}
                </a>
              )}
              {submission.teacher_remark && (
                <div className="mt-2 border-t border-surface-border pt-2">
                  <div className="text-[12px] font-bold text-ink">
                    What your teacher said
                  </div>
                  <p className="mt-0.5 whitespace-pre-line text-[12px] text-ink-muted">
                    {submission.teacher_remark}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {!hw.is_closed && (
          <Button variant={handedIn ? "secondary" : "primary"} onClick={() => setOpen(true)}>
            {handedIn ? "Change what I handed in" : "Hand it in"}
          </Button>
        )}
      </div>

      <SubmissionModal
        open={open}
        homeworkId={hw.id}
        existing={submission}
        onClose={() => setOpen(false)}
        onSaved={(s) => {
          setSubmission(s);
          setOpen(false);
        }}
      />
    </Card>
  );
}

function SubmissionModal({
  open,
  homeworkId,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean;
  homeworkId: number;
  existing: Submission | null;
  onClose: () => void;
  onSaved: (s: Submission) => void;
}) {
  const [comment, setComment] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setComment(existing?.comment ?? "");
    setAttachmentUrl(existing?.attachment_url ?? "");
    setError(null);
  }, [open, existing]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      comment: comment.trim() || null,
      attachment_url: attachmentUrl.trim() || null,
    };
    try {
      const path = `/api/v1/student/homework/${homeworkId}/submission`;
      const { data } = existing
        ? await api.patch<Submission>(path, body)
        : await api.post<Submission>(path, body);
      onSaved(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? "Change what you handed in" : "Hand in your work"}
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <ErrorBox>{error}</ErrorBox>

        {/* Textarea renders its own <label>, so it takes the text as a prop
            rather than being wrapped in one. */}
        <Textarea
          label="What you want to say"
          rows={4}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="I have finished all the questions."
        />

        <label className="block text-[12px] font-bold text-ink-muted">
          <span className="mb-1 block">Link to your work (if you have one)</span>
          <Input
            value={attachmentUrl}
            onChange={(e) => setAttachmentUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>

        <p className="text-[12px] text-ink-subtle">
          Put in a message, a link, or both.
          {existing && " If you change this, your teacher will look at it again."}
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {existing ? "Save the change" : "Hand it in"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
