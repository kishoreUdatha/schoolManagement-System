"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { ATTACH_ACCEPT, ATTACH_RULES, fileSize, filesForm, openAttachment, type Attachment } from "@/components/ui/Attachments";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { parentRoute } from "@/lib/parentScreens";
import { ActionLink, childPath, ChildScoped, dueLabel, longDate, PmEmpty, PmError, PmLoading } from "../home/parts";
import type { Homework, Submission } from "./types";
import { stageOf, submissionPath, useOneHomework } from "./useHomework";

/** Loads the assignment named by ?id= for the selected child and hands it to `render`. */
function WithHomework({ render }: { render: (x: { childId: number; hw: Homework; sub: Submission | null; reload: () => void }) => ReactNode }) {
  const id = Number(useSearchParams().get("id")) || 0;
  return <ChildScoped render={(childId) => <Loader childId={childId} id={id} render={render} />} />;
}

function Loader({ childId, id, render }: { childId: number; id: number; render: Parameters<typeof WithHomework>[0]["render"] }) {
  const one = useOneHomework(childId, id);
  if (!id || one.missing) {
    return (
      <>
        <PmEmpty title="Homework not found">It may belong to another child. Choose an assignment from the homework list.</PmEmpty>
        <ActionLink secondary href={parentRoute(14)}>
          Go to homework
        </ActionLink>
      </>
    );
  }
  if (one.error) return <PmError>{one.error}</PmError>;
  if (!one.ready || !one.hw) return <PmLoading />;
  return <>{render({ childId, hw: one.hw, sub: one.sub ?? null, reload: one.reload })}</>;
}

/** PM-015. One assignment: instructions, attachment and where the child's work stands. */
export function HomeworkDetail() {
  return <WithHomework render={({ childId, hw, sub }) => <Detail childId={childId} hw={hw} sub={sub} />} />;
}

const fileAt = (childId: number, hwId: number, a: Attachment) => childPath(childId, `/homework/${hwId}/files/${a.id}`);

/** Uploaded files as tappable rows; each opens through the child's homework, which checks access. */
function FileItems({ files, path, note, onRemove }: { files: Attachment[]; path: (a: Attachment) => string; note: string; onRemove?: (a: Attachment) => void }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      {files.map((a) => (
        <div key={a.id} className="item">
          <button type="button" className="text-button" style={{ textAlign: "left", flex: 1 }} onClick={() => openAttachment(path(a), a).catch((e) => setErr(errorText(e)))}>
            <span>
              <strong>{a.file_name}</strong>
              <small>{`${note} · ${fileSize(a.size_bytes)}`}</small>
            </span>
          </button>
          <span className="value">
            {onRemove ? (
              <button type="button" className="text-button" onClick={() => onRemove(a)}>
                Remove
              </button>
            ) : (
              "Open"
            )}
          </span>
        </div>
      ))}
      {err ? (
        <p className="micro bad" role="alert">
          {err}
        </p>
      ) : null}
    </>
  );
}

function Detail({ childId, hw, sub }: { childId: number; hw: Homework; sub: Submission | null }) {
  const router = useRouter();
  const stage = stageOf(hw, sub);
  const pill =
    stage === "reviewed" ? ["status", sub?.status === "rejected" ? "Needs redo" : "Reviewed"] :
    stage === "submitted" ? ["status blue", "Submitted"] :
    stage === "closed" ? ["status blue", "Closed"] :
    ["status amber", dueLabel(hw.due_date)];

  return (
    <>
      <span className={pill[0]}>{pill[1]}</span>
      <h1>{hw.title}</h1>
      <p className="lead">{[hw.subject_name, hw.created_by_name].filter(Boolean).join(" · ")}</p>
      <dl>
        <div>
          <dt>Due date</dt>
          <dd>{longDate(hw.due_date)}</dd>
        </div>
        <div>
          <dt>Set on</dt>
          <dd>{longDate(hw.created_at)}</dd>
        </div>
        <div>
          <dt>Submission</dt>
          <dd>{sub ? `Handed in ${dateTime(sub.submitted_at)}` : hw.is_closed ? "Closed by the teacher" : "Not handed in yet"}</dd>
        </div>
        {hw.rubric_name ? (
          <div>
            <dt>Marked with</dt>
            <dd>{hw.rubric_name}</dd>
          </div>
        ) : null}
      </dl>
      <section className="section">
        <h3>Instructions</h3>
        <p style={{ whiteSpace: "pre-line" }}>{hw.description || "No instructions given."}</p>
      </section>
      {hw.attachment_url ? (
        <button className="item" onClick={() => window.open(hw.attachment_url!, "_blank", "noopener")}>
          <span>
            <strong>Teacher’s attachment</strong>
            <small>Opens in a new tab</small>
          </span>
          <span className="value">Open</span>
        </button>
      ) : null}
      <FileItems files={hw.attachments ?? []} path={(a) => fileAt(childId, hw.id, a)} note="From the teacher" />
      <FileItems files={sub?.files ?? []} path={(a) => fileAt(childId, hw.id, a)} note="Handed in" />
      {!hw.is_closed ? (
        <section className="section">
          <h3>How to hand it in</h3>
          <p className="micro">{`Upload the work (${ATTACH_RULES}), paste a link to it, or write a note to the teacher.`}</p>
        </section>
      ) : null}
      {stage === "reviewed" ? (
        <button className="action" onClick={() => router.push(`${parentRoute(17)}?id=${hw.id}`)}>
          View feedback
        </button>
      ) : null}
      {!hw.is_closed ? (
        <button className={stage === "reviewed" ? "action secondary" : "action"} onClick={() => router.push(`${parentRoute(16)}?id=${hw.id}`)}>
          {sub ? "Change submission" : "Submit completed work"}
        </button>
      ) : null}
    </>
  );
}

/** PM-016. Hand in work for the child: files (POST …/submission/files), a link and/or a note (POST …/submission). */
export function SubmitHomework() {
  return <WithHomework render={({ childId, hw, sub }) => <SubmitForm childId={childId} hw={hw} sub={sub} />} />;
}

function SubmitForm({ childId, hw, sub }: { childId: number; hw: Homework; sub: Submission | null }) {
  const router = useRouter();
  const { notify } = useParent();
  const [url, setUrl] = useState(sub?.attachment_url ?? "");
  const [comment, setComment] = useState(sub?.comment ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [current, setCurrent] = useState<Submission | null>(sub);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrl(sub?.attachment_url ?? "");
    setComment(sub?.comment ?? "");
    setCurrent(sub);
  }, [sub]);

  async function removeFile(a: Attachment) {
    if (!window.confirm(`Remove “${a.file_name}” from the work handed in?`)) return;
    setError(null);
    try {
      setCurrent(await api.delete<Submission>(`${submissionPath(childId, hw.id)}/files/${a.id}`));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const attachment_url = url.trim() || null;
    const note = comment.trim() || null;
    if (!attachment_url && !note && !files.length && !current?.files?.length) {
      setError("Upload the work, add a link to it, or write a message to the teacher.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Files first: that starts the submission if there is none yet.
      if (files.length) {
        setCurrent(await api.upload<Submission>(`${submissionPath(childId, hw.id)}/files`, filesForm(files)));
        setFiles([]);
        setFormKey((k) => k + 1);
      }
      // POST creates the submission or replaces its link and note (files handed in stay).
      await api.post<Submission>(submissionPath(childId, hw.id), { attachment_url, comment: note });
      notify("Homework handed in.");
      router.push(`${parentRoute(15)}?id=${hw.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  if (hw.is_closed) {
    return <PmEmpty title="This homework is closed">The teacher has closed this assignment, so no more work can be handed in.</PmEmpty>;
  }

  return (
    <form onSubmit={submit}>
      <p className="lead">{`${hw.title} · Due ${longDate(hw.due_date)}`}</p>
      <div className="upload-box">
        <b>Add completed work</b>
        <p>{`Upload photos or files of the work (${ATTACH_RULES}), or paste a link, for example a shared Google Drive file.`}</p>
        <label className="field" key={formKey}>
          Files
          <input type="file" multiple accept={ATTACH_ACCEPT} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        <FileItems files={current?.files ?? []} path={(a) => fileAt(childId, hw.id, a)} note="Handed in" onRemove={removeFile} />
        <label className="field">
          Link to the work
          <input type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Message to teacher (optional)
        <textarea rows={3} placeholder="Add a short note" value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {sub && sub.status !== "submitted" ? <p className="micro warning">Handing in again replaces the reviewed work and clears the teacher’s review.</p> : null}
      {error ? (
        <p className="micro bad" role="alert">
          {error}
        </p>
      ) : null}
      <button className="action" type="submit" disabled={busy}>
        {busy ? "Submitting…" : sub ? "Update submission" : "Submit homework"}
      </button>
      <p className="micro">A file, a link or a message is needed. The teacher sees that you handed it in.</p>
    </form>
  );
}

/** PM-017. The teacher's review of the child's work. */
export function HomeworkFeedback() {
  return <WithHomework render={({ childId, hw, sub }) => <Feedback childId={childId} hw={hw} sub={sub} />} />;
}

function Feedback({ childId, hw, sub }: { childId: number; hw: Homework; sub: Submission | null }) {
  const { child, go } = useParent();
  const router = useRouter();
  if (!sub || sub.status === "submitted") {
    return (
      <>
        <span className="status blue">{sub ? "Awaiting review" : "Not handed in"}</span>
        <h1>{hw.title}</h1>
        <PmEmpty title="No feedback yet">{sub ? "The teacher has not reviewed this work yet." : "Feedback appears once work is handed in and reviewed."}</PmEmpty>
        <button className="action secondary" onClick={() => router.push(`${parentRoute(15)}?id=${hw.id}`)}>
          Back to homework
        </button>
      </>
    );
  }
  const first = child?.full_name.split(/\s+/)[0];
  const m = sub.marking;
  return (
    <>
      <span className={sub.status === "approved" ? "status" : "status amber"}>{sub.status === "approved" ? "Reviewed" : "Needs redo"}</span>
      <h1>{hw.title}</h1>
      <div className="panel soft">
        <span className="eyebrow">TEACHER FEEDBACK</span>
        <h2>{sub.status === "approved" ? `Well done${first ? `, ${first}` : ""}.` : "Please redo and hand in again."}</h2>
        <p style={{ whiteSpace: "pre-line" }}>{sub.teacher_remark || "No written remark."}</p>
        <small>{[sub.reviewed_by_name, sub.reviewed_at ? longDate(sub.reviewed_at) : null].filter(Boolean).join(" · ")}</small>
      </div>
      <FileItems files={sub.review_files ?? []} path={(a) => fileAt(childId, hw.id, a)} note="From the teacher" />
      <dl>
        {m ? (
          <div>
            <dt>Score</dt>
            <dd>{m.total === null ? "Not scored" : `${m.total} / ${m.max_total}`}</dd>
          </div>
        ) : null}
        <div>
          <dt>Submitted</dt>
          <dd>{longDate(sub.submitted_at)}</dd>
        </div>
        <div>
          <dt>Reviewed</dt>
          <dd>{sub.reviewed_at ? longDate(sub.reviewed_at) : "—"}</dd>
        </div>
      </dl>
      {m && m.criteria.length ? (
        <section className="section">
          <h3>{m.rubric_name}</h3>
          {m.criteria.map((c) => (
            <div className="item" key={c.criterion_id}>
              <span>
                <strong>{c.criterion_title}</strong>
                {c.comment ? <small>{c.comment}</small> : null}
              </span>
              <span className="value">{`${c.points ?? "—"} / ${c.max_points}`}</span>
            </div>
          ))}
        </section>
      ) : null}
      <button className="action secondary" onClick={() => go(36)}>
        Message teacher
      </button>
    </>
  );
}
