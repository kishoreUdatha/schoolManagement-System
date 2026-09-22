"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { parentRoute } from "@/lib/parentScreens";
import { ActionLink, ChildScoped, dueLabel, longDate, PmEmpty, PmError, PmLoading } from "../home/parts";
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
  return <WithHomework render={({ hw, sub }) => <Detail hw={hw} sub={sub} />} />;
}

function Detail({ hw, sub }: { hw: Homework; sub: Submission | null }) {
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

/** PM-016. Hand in work for the child: a link to the work and/or a note (POST …/submission). */
export function SubmitHomework() {
  return <WithHomework render={({ childId, hw, sub }) => <SubmitForm childId={childId} hw={hw} sub={sub} />} />;
}

function SubmitForm({ childId, hw, sub }: { childId: number; hw: Homework; sub: Submission | null }) {
  const router = useRouter();
  const { notify } = useParent();
  const [url, setUrl] = useState(sub?.attachment_url ?? "");
  const [comment, setComment] = useState(sub?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrl(sub?.attachment_url ?? "");
    setComment(sub?.comment ?? "");
  }, [sub]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const attachment_url = url.trim() || null;
    const note = comment.trim() || null;
    if (!attachment_url && !note) {
      setError("Add a link to the work or a message to the teacher.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // POST creates the submission or replaces the existing one.
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
        {/* Not wired: file upload — the submission API takes a link (attachment_url), not a file. */}
        <p>Paste a link to the work, for example a shared Google Drive or OneDrive file.</p>
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
      <p className="micro">A link or a message is needed. The teacher sees that you handed it in.</p>
    </form>
  );
}

/** PM-017. The teacher's review of the child's work. */
export function HomeworkFeedback() {
  return <WithHomework render={({ hw, sub }) => <Feedback hw={hw} sub={sub} />} />;
}

function Feedback({ hw, sub }: { hw: Homework; sub: Submission | null }) {
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
