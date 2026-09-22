"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { FileCards, filesForm, UploadZone, type Attachment } from "@/components/ui/Attachments";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { LinkCard } from "./shared";
import type { Homework, Submission } from "./types";

const STATUS: Record<Submission["status"], string> = { submitted: "Submitted", approved: "Approved", rejected: "Returned" };

/**
 * SCR-133, live: a homework's submissions (?id= homework, ?sub= submission),
 * one at a time. Saves rubric marks (PUT …/submissions/{id}/rubric-scores)
 * when the homework has a rubric, then the decision and feedback
 * (PATCH …/submissions/{id}/review).
 */
export function HomeworkEvaluation() {
  const params = useSearchParams();
  const id = params.get("id");
  const hw = useApi<Homework>(id ? `/api/v1/teacher/homework/${id}` : null);
  const subs = useApi<Submission[]>(id ? `/api/v1/teacher/homework/${id}/submissions` : null);
  const [subId, setSubId] = useState<number | null>(params.get("sub") ? Number(params.get("sub")) : null);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open the first one still waiting, or the first at all.
  useEffect(() => {
    if (subId === null && subs.data?.length) setSubId((subs.data.find((s) => s.status === "submitted") ?? subs.data[0]).id);
  }, [subs.data, subId]);

  const s = subs.data?.find((x) => x.id === subId);
  useEffect(() => {
    setMarks({});
    setRemark(s?.teacher_remark ?? "");
    setDecision(s?.status === "rejected" ? "rejected" : "approved");
    setError(null);
  }, [s?.id, s?.teacher_remark, s?.status]);

  if (!id) return <PickFirst what="homework to evaluate" href={routeOf(128)} cta="Open the homework list" />;
  if (hw.loading && !hw.data) return <Loading what="Loading the homework…" />;
  const h = hw.data;
  if (!h) return <ErrorNote>{hw.error ?? "Homework not found."}</ErrorNote>;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!s) return;
    setSaving(true);
    setError(null);
    try {
      if (s.marking) {
        const scores = s.marking.criteria
          .filter((c) => (marks[c.criterion_id] ?? "") !== "")
          .map((c) => ({ criterion_id: c.criterion_id, points: Number(marks[c.criterion_id]) }));
        if (scores.length) await api.put(`/api/v1/teacher/homework/submissions/${s.id}/rubric-scores`, { scores });
      }
      await api.patch(`/api/v1/teacher/homework/submissions/${s.id}/review`, { status: decision, teacher_remark: remark.trim() || null });
      notify(`Evaluation saved for ${s.student_name ?? "the student"}.`);
      const next = subs.data?.find((x) => x.status === "submitted" && x.id !== s.id);
      await subs.reload();
      if (next) setSubId(next.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const subFile = (submissionId: number, attachmentId: number) => `/api/v1/teacher/homework/submissions/${submissionId}/files/${attachmentId}`;

  async function reviewFiles(submissionId: number, files: File[]) {
    setUploading(true);
    setError(null);
    try {
      await api.upload(`/api/v1/teacher/homework/submissions/${submissionId}/review-files`, filesForm(files));
      notify("File attached. The student and parents can open it.");
      await subs.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
    }
  }

  async function removeReviewFile(submissionId: number, a: Attachment) {
    if (!window.confirm(`Remove “${a.file_name}”?`)) return;
    try {
      await api.delete(`/api/v1/teacher/homework/submissions/${submissionId}/review-files/${a.id}`);
      await subs.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const list = subs.data ?? [];
  const max = s?.marking?.max_total ?? list.find((x) => x.marking)?.marking?.max_total;

  return (
    <div className="two-col">
      <div className="stack">
        <ErrorNote>{subs.error}</ErrorNote>
        <Panel
          title="Student submission"
          sub={`${list.filter((x) => x.status === "submitted").length} waiting · ${list.length} handed in`}
          action={
            list.length ? (
              <select aria-label="Choose a submission" value={subId ?? ""} onChange={(e) => setSubId(Number(e.target.value))}>
                {list.map((x) => (
                  <option key={x.id} value={x.id}>
                    {`${x.student_name ?? "Student"} · ${STATUS[x.status]}`}
                  </option>
                ))}
              </select>
            ) : undefined
          }
        >
          {s ? (
            <>
              <div className="spread">
                <div className="person">
                  <span className="avatar mint">{initials(s.student_name ?? "?")}</span>
                  <div>
                    {s.student_name ?? "—"}
                    <small>{`${h.class_name ?? ""} · ${s.student_admission_no ?? "—"}`}</small>
                  </div>
                </div>
                <Badge>{STATUS[s.status]}</Badge>
              </div>
              <div className="gap" />
              <div className="assessment-prompt">
                <h3>{h.title}</h3>
                <p>{`Handed in ${dateTime(s.submitted_at)}${s.submitted_by_name && s.submitted_by_name !== s.student_name ? ` by ${s.submitted_by_name}` : ""}`}</p>
                <div className="gap" />
                <p className="muted" style={{ whiteSpace: "pre-line" }}>
                  {s.comment || "No written response."}
                </p>
              </div>
              {s.attachment_url ? <LinkCard url={s.attachment_url} note="Handed in with the work" /> : null}
              <FileCards files={s.files ?? []} pathOf={(a) => subFile(s.id, a.id)} note="Handed in with the work" onError={setError} />
            </>
          ) : (
            <p className="muted">{subs.loading ? "Loading…" : "Nothing has been handed in yet."}</p>
          )}
        </Panel>
        {s ? (
          <form id="evaluation-form" className="panel" onSubmit={save}>
            <div className="panel-head">
              <h2>Evaluation</h2>
            </div>
            <div className="panel-body">
              <ErrorNote>{error}</ErrorNote>
              <div className="form-grid">
                {s.marking ? (
                  s.marking.criteria.map((c) => (
                    <label className="field" key={c.criterion_id}>
                      <span>{`${c.criterion_title} (out of ${c.max_points})`}</span>
                      <input
                        type="number"
                        min={0}
                        max={c.max_points}
                        step="0.5"
                        placeholder="Enter marks"
                        aria-label={`Marks for ${c.criterion_title}`}
                        value={marks[c.criterion_id] ?? (c.points ?? "")}
                        onChange={(e) => setMarks({ ...marks, [c.criterion_id]: e.target.value })}
                      />
                    </label>
                  ))
                ) : (
                  // No rubric on this homework: the API records a decision and feedback, not marks.
                  <label className="field">
                    <span>Marks</span>
                    <input type="text" readOnly aria-label="Marks" value="No rubric — approve or return" />
                  </label>
                )}
                <label className="field">
                  <span>
                    Decision
                    <span className="req">*</span>
                  </span>
                  <select aria-label="Decision" value={decision} onChange={(e) => setDecision(e.target.value as "approved" | "rejected")}>
                    <option value="approved">Approve</option>
                    <option value="rejected">Return for another go</option>
                  </select>
                </label>
                <label className="field full">
                  <span>Feedback</span>
                  <textarea aria-label="Feedback" maxLength={2000} placeholder="Enter feedback" value={remark} onChange={(e) => setRemark(e.target.value)} />
                </label>
              </div>
            </div>
            <div className="form-footer">
              <span>{s.reviewed_at ? `Last reviewed ${dateTime(s.reviewed_at)}${s.reviewed_by_name ? ` by ${s.reviewed_by_name}` : ""}` : "Not reviewed yet"}</span>
              <button type="submit" className="btn primary" disabled={saving}>
                <Icon name="check" className="sm" />
                {saving ? "Saving…" : "Save evaluation"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
      <aside className="stack">
        <Panel title="Homework details">
          <dl className="kv">
            {[
              ["Subject", h.subject_name ?? "—"],
              ["Class", h.class_name ?? "—"],
              ["Due date", date(h.due_date)],
              ["Maximum score", max != null ? String(max) : "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        {h.attachment_url || h.attachments?.length ? (
          <Panel title="Homework attachments">
            {h.attachment_url ? <LinkCard url={h.attachment_url} note="Attached by the teacher" /> : null}
            <FileCards files={h.attachments ?? []} pathOf={(a) => `/api/v1/teacher/homework/${h.id}/files/${a.id}`} note="Attached by the teacher" onError={setError} />
          </Panel>
        ) : null}
        {s ? (
          <Panel title="Attachments" sub="Marked copy or feedback for the student and parents">
            <UploadZone onFiles={(fs) => reviewFiles(s.id, fs)} busy={uploading} />
            <FileCards files={s.review_files ?? []} pathOf={(a) => subFile(s.id, a.id)} note="Your feedback file" onRemove={(a) => removeReviewFile(s.id, a)} onError={setError} />
          </Panel>
        ) : null}
      </aside>
    </div>
  );
}
