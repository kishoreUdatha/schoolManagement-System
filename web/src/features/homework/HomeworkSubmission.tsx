"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { FileCards, filesForm, UploadZone, type Attachment } from "@/components/ui/Attachments";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials } from "@/lib/format";
import { notify } from "@/lib/notify";
import { ChildPicker, learnerState, LinkCard } from "./shared";
import { useLearnerHomework } from "./LearnerHomework";
import type { Submission } from "./types";

import { ask } from "@/lib/dialog";
/**
 * SCR-132, live: hand in (POST) or change (PATCH) the submission for one
 * homework (?id=; without it, the soonest still open). Student portal
 * /student/homework/{id}/submission, or the parent portal's
 * /parent/me/children/{child}/homework/{id}/submission. The record keeps
 * who handed it in.
 */
export function HomeworkSubmission() {
  const want = useSearchParams().get("id");
  const { learner, list, subs, subOf } = useLearnerHomework();
  const [comment, setComment] = useState("");
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Submission | null>(null);

  const items = list.data ?? [];
  const h =
    items.find((x) => String(x.id) === want) ??
    (want ? undefined : [...items].filter((x) => !x.is_closed && !x.is_past_due).sort((a, b) => a.due_date.localeCompare(b.due_date))[0]);
  const s = saved?.homework_id === h?.id ? saved : h ? subOf(h) : null;

  useEffect(() => {
    setComment(s?.comment ?? "");
    setLink(s?.attachment_url ?? "");
    // Reset only when the homework or its stored submission changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h?.id, s?.id, s?.submitted_at]);

  if (learner.wrongRole) return <ErrorNote>Homework is handed in by the student, or by a parent for their child. Sign in as one of them.</ErrorNote>;
  if (!learner.hydrated || (list.loading && !list.data)) return <Loading what="Loading homework…" />;
  if (!h)
    return (
      <>
        <div className="filterbar">
          <ChildPicker learner={learner} />
        </div>
        <ErrorNote>{learner.error ?? list.error ?? (want ? "This homework is not set for you." : "Nothing is open to hand in right now.")}</ErrorNote>
      </>
    );
  const hw = h;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = { comment: comment.trim() || null, attachment_url: link.trim() || null };
    // Files already handed in count as work, so the text fields may both be empty then.
    if (!body.comment && !body.attachment_url && !s?.files?.length) {
      setError("Write a response, add a link to the work, or upload a file.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const path = `${learner.base}/${hw.id}/submission`;
      const r = s ? await api.patch<Submission>(path, body) : await api.post<Submission>(path, body);
      setSaved(r);
      subs.reload();
      notify(s ? "Your change is saved. The teacher will look again." : "Homework handed in.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const fileAt = (attachmentId: number) => `${learner.base}/${hw.id}/files/${attachmentId}`;

  async function upload(files: File[]) {
    setUploading(true);
    setError(null);
    try {
      const r = await api.upload<Submission>(`${learner.base}/${hw.id}/submission/files`, filesForm(files));
      setSaved(r);
      subs.reload();
      notify(s ? "File added. The teacher will look again." : "Homework handed in.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(a: Attachment) {
    if (!(await ask(`Remove “${a.file_name}” from what you handed in?`))) return;
    setError(null);
    try {
      const r = await api.delete<Submission>(`${learner.base}/${hw.id}/submission/files/${a.id}`);
      setSaved(r);
      subs.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const state = learnerState(hw, s);
  const locked = hw.is_closed;

  return (
    <>
      {learner.isParent ? (
        <div className="filterbar">
          <ChildPicker learner={learner} />
        </div>
      ) : null}
      <div className="two-col">
        <div className="stack">
          <Panel title="Your work">
            <div className="spread">
              <div className="person">
                <span className="avatar mint">{initials(learner.who?.name ?? "?")}</span>
                <div>
                  {learner.who?.name ?? "—"}
                  <small>{learner.who?.sub ?? ""}</small>
                </div>
              </div>
              <Badge>{s ? state : locked ? "Closed" : "Draft"}</Badge>
            </div>
            <div className="gap" />
            <div className="assessment-prompt">
              <h3>{hw.title}</h3>
              <p style={{ whiteSpace: "pre-line" }}>{hw.description}</p>
              {s ? (
                <>
                  <div className="gap" />
                  <p className="muted" style={{ whiteSpace: "pre-line" }}>
                    {`Handed in ${dateTime(s.submitted_at)}${s.submitted_by_name ? ` by ${s.submitted_by_name}` : ""}${s.comment ? `: ${s.comment}` : ""}`}
                  </p>
                </>
              ) : null}
              {s?.teacher_remark ? (
                <>
                  <div className="gap" />
                  <p>
                    <strong>What your teacher said: </strong>
                    {s.teacher_remark}
                  </p>
                </>
              ) : null}
            </div>
            {hw.attachment_url ? <LinkCard url={hw.attachment_url} note="Attached by the teacher" /> : null}
            <FileCards files={hw.attachments ?? []} pathOf={(a) => fileAt(a.id)} note="Attached by the teacher" onError={setError} />
            {s?.attachment_url ? <LinkCard url={s.attachment_url} note="What you handed in" /> : null}
            <FileCards files={s?.files ?? []} pathOf={(a) => fileAt(a.id)} note="What you handed in" onRemove={locked ? undefined : removeFile} onError={setError} />
            <FileCards files={s?.review_files ?? []} pathOf={(a) => fileAt(a.id)} note="From your teacher" onError={setError} />
          </Panel>
          <form id="submission-form" className="panel" onSubmit={submit}>
            <div className="panel-head">
              <h2>{s ? "Change your response" : "Submit your response"}</h2>
            </div>
            <div className="panel-body">
              <ErrorNote>{error}</ErrorNote>
              <div className="form-grid">
                <label className="field">
                  <span>Response</span>
                  <input type="text" placeholder="Enter response" aria-label="Response" value={comment} disabled={locked} onChange={(e) => setComment(e.target.value)} />
                </label>
                <label className="field">
                  <span>Link to the work</span>
                  {/* A link (attachment_url) still works; files go in the Attachments panel. */}
                  <input type="url" placeholder="https://… link to your work" aria-label="Link to your work" value={link} disabled={locked} onChange={(e) => setLink(e.target.value)} />
                </label>
              </div>
            </div>
            <div className="form-footer">
              <span>{locked ? "Closed by the teacher — no more submissions." : "A response, a link or files — any of them."}</span>
              <button type="submit" className="btn primary" disabled={saving || locked || subs.loading}>
                <Icon name="check" className="sm" />
                {saving ? "Saving…" : s ? "Save the change" : "Submit homework"}
              </button>
            </div>
          </form>
        </div>
        <aside className="stack">
          <Panel title="Homework details">
            <dl className="kv">
              {[
                ["Subject", hw.subject_name ?? "—"],
                ["Class", hw.class_name ?? "—"],
                ["Due date", date(hw.due_date)],
                ["Set by", hw.created_by_name ?? "—"],
                ["Marking", s?.marking ? (s.marking.total != null ? `${s.marking.total} / ${s.marking.max_total}` : `Out of ${s.marking.max_total}`) : (hw.rubric_name ?? "Approve or return")],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="Attachments">
            <UploadZone onFiles={upload} busy={uploading} disabled={locked} />
            <p className="small muted" style={{ marginTop: 8 }}>
              {s ? "Adding or removing a file hands the work in again for the teacher to look at." : "Uploading a file hands the work in."}
            </p>
          </Panel>
        </aside>
      </div>
    </>
  );
}
