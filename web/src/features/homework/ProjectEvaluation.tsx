"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { FileCards, filesForm, UploadZone, type Attachment } from "@/components/ui/Attachments";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { LinkCard } from "./shared";
import type { Progress, Project } from "./types";

/**
 * SCR-137, live: a project's progress rows (?id= project, ?progress= row),
 * one student at a time; feedback and a 0–5 rating go to
 * PATCH /teacher/projects/progress/{id}/review.
 */
export function ProjectEvaluation() {
  const params = useSearchParams();
  const id = params.get("id");
  const projects = useApi<Project[]>(id ? "/api/v1/teacher/projects" : null);
  const rows = useApi<Progress[]>(id ? `/api/v1/teacher/projects/${id}/progress` : null);
  const [pid, setPid] = useState<number | null>(params.get("progress") ? Number(params.get("progress")) : null);
  const [rating, setRating] = useState("");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only a student who has started has a row the teacher can review (id 0 means none yet).
  const reviewable = (rows.data ?? []).filter((r) => r.id !== 0 && r.status !== "not_started");
  useEffect(() => {
    if (pid === null && reviewable.length) setPid((reviewable.find((r) => r.status === "submitted") ?? reviewable[0]).id);
  }, [reviewable, pid]);

  const r = reviewable.find((x) => x.id === pid);
  useEffect(() => {
    setRating(r?.rating != null ? String(r.rating) : "");
    setRemark(r?.teacher_remark ?? "");
    setError(null);
  }, [r?.id, r?.rating, r?.teacher_remark]);

  if (!id) return <PickFirst what="assignment to evaluate" href={routeOf(134)} cta="Open the assignment list" />;
  if (projects.loading && !projects.data) return <Loading what="Loading the assignment…" />;
  const p = projects.data?.find((x) => String(x.id) === id);
  if (!p) return <ErrorNote>{projects.error ?? "Assignment not found among the ones you set."}</ErrorNote>;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!r) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/v1/teacher/projects/progress/${r.id}/review`, {
        teacher_remark: remark.trim() || null,
        rating: rating === "" ? null : Number(rating),
      });
      notify(`Feedback published for ${r.student_name ?? "the student"}.`);
      const next = reviewable.find((x) => x.status === "submitted" && x.id !== r.id);
      await rows.reload();
      if (next) setPid(next.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function reviewFiles(progressId: number, files: File[]) {
    setUploading(true);
    setError(null);
    try {
      await api.upload(`/api/v1/teacher/projects/progress/${progressId}/review-files`, filesForm(files));
      notify("File attached. The student and parents can open it.");
      await rows.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
    }
  }

  async function removeReviewFile(progressId: number, a: Attachment) {
    if (!window.confirm(`Remove “${a.file_name}”?`)) return;
    try {
      await api.delete(`/api/v1/teacher/projects/progress/${progressId}/review-files/${a.id}`);
      await rows.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="two-col">
      <div className="stack">
        <ErrorNote>{rows.error}</ErrorNote>
        <Panel
          title="Student submission"
          sub={`${reviewable.filter((x) => x.status === "submitted").length} waiting · ${reviewable.length} started`}
          action={
            reviewable.length ? (
              <select aria-label="Choose a student" value={pid ?? ""} onChange={(e) => setPid(Number(e.target.value))}>
                {reviewable.map((x) => (
                  <option key={x.id} value={x.id}>
                    {`${x.student_name ?? "Student"} · ${label(x.status)}`}
                  </option>
                ))}
              </select>
            ) : undefined
          }
        >
          {r ? (
            <>
              <div className="spread">
                <div className="person">
                  <span className="avatar mint">{initials(r.student_name ?? "?")}</span>
                  <div>
                    {r.student_name ?? "—"}
                    <small>{`${p.class_name ?? ""} · ${r.student_admission_no ?? "—"}`}</small>
                  </div>
                </div>
                <Badge>{label(r.status)}</Badge>
              </div>
              <div className="gap" />
              <div className="assessment-prompt">
                <h3>{p.title}</h3>
                <p>{r.submitted_at ? `Handed in ${dateTime(r.submitted_at)}` : `Updated ${dateTime(r.updated_at)}`}</p>
                <div className="gap" />
                <p className="muted" style={{ whiteSpace: "pre-line" }}>
                  {r.comment || "No written note."}
                </p>
              </div>
              {r.attachment_url ? <LinkCard url={r.attachment_url} note="Handed in with the work" /> : null}
            </>
          ) : (
            <p className="muted">{rows.loading ? "Loading…" : "No student has started this assignment yet."}</p>
          )}
        </Panel>
        {r ? (
          <form id="evaluation-form" className="panel" onSubmit={save}>
            <div className="panel-head">
              <h2>Evaluation</h2>
            </div>
            <div className="panel-body">
              <ErrorNote>{error}</ErrorNote>
              <div className="form-grid">
                <label className="field">
                  <span>Rating (out of 5)</span>
                  <select aria-label="Rating" value={rating} onChange={(e) => setRating(e.target.value)}>
                    <option value="">No rating</option>
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field full">
                  <span>Feedback</span>
                  <textarea aria-label="Feedback" maxLength={2000} placeholder="Enter feedback" value={remark} onChange={(e) => setRemark(e.target.value)} />
                </label>
              </div>
            </div>
            <div className="form-footer">
              <span>{r.reviewed_at ? `Last reviewed ${dateTime(r.reviewed_at)}${r.reviewed_by_name ? ` by ${r.reviewed_by_name}` : ""}` : "Not reviewed yet"}</span>
              <button type="submit" className="btn primary" disabled={saving}>
                <Icon name="check" className="sm" />
                {saving ? "Saving…" : "Publish feedback"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
      <aside className="stack">
        <Panel title="Homework details">
          <dl className="kv">
            {[
              ["Subject", p.subject_name ?? "—"],
              ["Class", p.class_name ?? "—"],
              ["Due date", date(p.deadline)],
              ["Maximum score", "Rated out of 5"],
              ["Type", label(p.kind)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        {p.attachment_url || p.attachments?.length ? (
          <Panel title="Assignment attachments">
            {p.attachment_url ? <LinkCard url={p.attachment_url} note="Attached by the teacher" /> : null}
            <FileCards files={p.attachments ?? []} pathOf={(a) => `/api/v1/teacher/projects/${p.id}/files/${a.id}`} note="Attached by the teacher" onError={setError} />
          </Panel>
        ) : null}
        {r ? (
          <Panel title="Attachments" sub="Feedback file for the student and parents">
            <UploadZone onFiles={(fs) => reviewFiles(r.id, fs)} busy={uploading} />
            <FileCards
              files={r.review_files ?? []}
              pathOf={(a) => `/api/v1/teacher/projects/progress/${r.id}/files/${a.id}`}
              note="Your feedback file"
              onRemove={(a) => removeReviewFile(r.id, a)}
              onError={setError}
            />
          </Panel>
        ) : null}
      </aside>
    </div>
  );
}
