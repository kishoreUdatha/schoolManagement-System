"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FileCards, fileSize, filesForm, UploadZone, type Attachment } from "@/components/ui/Attachments";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { todayIso } from "./shared";
import type { Homework, MyClasses, ProjectKind, Rubric } from "./types";

import { ask } from "@/lib/dialog";
/**
 * SCR-129 Create Homework: POST /teacher/homework, or PATCH
 * /teacher/homework/{id} when opened with ?id= (edit).
 * SCR-135 Create Assignment: POST /teacher/projects.
 * Work is set for a class-subject, so every section of that class sees it.
 */
export function WorkForm({ kind }: { kind: "homework" | "project" }) {
  const router = useRouter();
  const isHw = kind === "homework";
  const id = useSearchParams().get("id");
  const editing = isHw && Boolean(id);
  const classes = useApi<MyClasses>("/api/v1/teacher/my-classes");
  const rubrics = useApi<Rubric[]>(isHw ? "/api/v1/school/rubrics" : null);
  const existing = useApi<Homework>(editing ? `/api/v1/teacher/homework/${id}` : null);

  const cards = useMemo(() => (classes.data?.subject_teacher_of ?? []).filter((c) => c.is_current_year), [classes.data]);
  const classList = useMemo(() => Array.from(new Map(cards.map((c) => [c.class_id, c.class_name])).entries()), [cards]);
  const [classId, setClassId] = useState<number | null>(null);
  const [csId, setCsId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState(todayIso());
  const [publishOn, setPublishOn] = useState("");
  const [attachment, setAttachment] = useState("");
  const [rubricId, setRubricId] = useState("");
  const [outOf, setOutOf] = useState("");
  const [projectKind, setProjectKind] = useState<ProjectKind>("individual");
  const [notifyParents, setNotifyParents] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start on the first class the teacher teaches, or on the homework being edited.
  useEffect(() => {
    const h = existing.data;
    if (h) {
      const c = (classes.data?.subject_teacher_of ?? []).find((x) => x.class_subject_id === h.class_subject_id);
      setClassId(c?.class_id ?? null);
      setCsId(h.class_subject_id);
      setTitle(h.title);
      setDescription(h.description);
      setDue(h.due_date);
      setPublishOn(h.publish_on ?? "");
      setAttachment(h.attachment_url ?? "");
      setRubricId(h.rubric_id ? String(h.rubric_id) : "");
      setOutOf(h.max_marks ? String(Number(h.max_marks)) : "");
    } else if (!editing && classId === null && cards.length) {
      setClassId(cards[0].class_id);
      setCsId(cards[0].class_subject_id);
    }
  }, [existing.data, classes.data, cards, editing, classId]);

  const subjects = cards.filter((c) => c.class_id === classId);
  const card = (classes.data?.subject_teacher_of ?? []).find((c) => c.class_subject_id === csId);

  if (editing && existing.loading && !existing.data) return <Loading what="Loading the homework…" />;

  /** Attach the queued files once the work exists. Returns the error text, or null when all went up. */
  async function uploadPending(path: string): Promise<string | null> {
    if (!pending.length) return null;
    try {
      await api.upload(path, filesForm(pending));
      setPending([]);
      return null;
    } catch (err) {
      return errorText(err);
    }
  }

  async function removeSaved(a: Attachment) {
    if (!(await ask(`Remove “${a.file_name}”?`))) return;
    try {
      await api.delete(`/api/v1/teacher/homework/${id}/files/${a.id}`);
      existing.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!csId) {
      setError("Choose a class and subject.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isHw) {
        const body = {
          title: title.trim(),
          description: description.trim(),
          attachment_url: attachment.trim() || null,
          due_date: due,
          rubric_id: rubricId ? Number(rubricId) : null,
          max_marks: outOf.trim() ? Number(outOf) : null,
          ...(publishOn && publishOn > todayIso() ? { publish_on: publishOn } : {}),
        };
        const later = Boolean(publishOn && publishOn > todayIso());
        if (editing) {
          await api.patch(`/api/v1/teacher/homework/${id}`, body);
          const failed = await uploadPending(`/api/v1/teacher/homework/${id}/files`);
          notify(failed ? `Homework updated, but the files were not attached: ${failed}` : "Homework updated.");
          router.push(`${routeOf(130)}?id=${id}`);
          return;
        }
        const h = await api.post<Homework>("/api/v1/teacher/homework", { ...body, class_subject_id: csId, notify_parents: notifyParents && !later });
        const failed = await uploadPending(`/api/v1/teacher/homework/${h.id}/files`);
        const done = later ? `Homework scheduled; children see it from ${date(publishOn)}.` : notifyParents ? "Homework published and parents notified." : "Homework published.";
        notify(failed ? `${done} The files were not attached: ${failed}` : done);
        router.push(`${routeOf(130)}?id=${h.id}`);
      } else {
        const p = await api.post<{ id: number }>("/api/v1/teacher/projects", {
          class_subject_id: csId,
          title: title.trim(),
          description: description.trim(),
          attachment_url: attachment.trim() || null,
          deadline: due,
          kind: projectKind,
          notify_parents: notifyParents,
        });
        const failed = await uploadPending(`/api/v1/teacher/projects/${p.id}/files`);
        notify(
          failed
            ? `Assignment published, but the files were not attached: ${failed}`
            : notifyParents
              ? "Assignment published and parents notified."
              : "Assignment published.",
        );
        router.push(`${routeOf(136)}?id=${p.id}`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const rubric = rubrics.data?.find((r) => String(r.id) === rubricId);

  return (
    <div className="two-col">
      <form id="work-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? classes.error ?? existing.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>{isHw ? "Homework details" : "Assignment details"}</h3>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>
                    Title
                    <span className="req">*</span>
                  </span>
                  <input type="text" placeholder="Enter title" aria-label="Title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label className="field">
                  <span>
                    Subject
                    <span className="req">*</span>
                  </span>
                  <select aria-label="Subject" required value={csId ?? ""} disabled={editing} onChange={(e) => setCsId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">{classes.loading ? "Loading…" : "Select subject"}</option>
                    {subjects.map((c) => (
                      <option key={c.class_subject_id} value={c.class_subject_id}>
                        {c.subject_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>
                    Class
                    <span className="req">*</span>
                  </span>
                  <select
                    aria-label="Class"
                    required
                    value={classId ?? ""}
                    disabled={editing}
                    onChange={(e) => {
                      const c = Number(e.target.value);
                      setClassId(c);
                      setCsId(cards.find((x) => x.class_id === c)?.class_subject_id ?? null);
                    }}
                  >
                    <option value="">{classes.loading ? "Loading…" : classList.length ? "Select class" : "You teach no class this year"}</option>
                    {classList.map(([cid, name]) => (
                      <option key={cid} value={cid}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Section</span>
                  {/* Work is set for the class-subject; there is no per-section target in the API. */}
                  <input aria-label="Section" readOnly value={card ? `All sections (${card.sections.map((s) => s.section_name).join(", ")})` : "All sections"} />
                </label>
                <label className="field full">
                  <span>
                    Instructions
                    <span className="req">*</span>
                  </span>
                  <textarea aria-label="Instructions" placeholder="Enter instructions" required value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
                {isHw ? (
                  <label className="field">
                    <span>Publish on</span>
                    <input
                      type="date"
                      aria-label="Publish on"
                      value={publishOn}
                      min={todayIso()}
                      max={due || undefined}
                      disabled={editing && !existing.data?.is_scheduled}
                      onChange={(e) => setPublishOn(e.target.value)}
                    />
                    <small className="muted">{editing && !existing.data?.is_scheduled ? "Already published." : "Leave empty to publish on saving. Scheduled work is not announced to parents."}</small>
                  </label>
                ) : null /* Not wired: publish date for assignments — scheduled publishing exists for homework only; an assignment is published when saved. */}
              </div>
            </section>
            <section>
              <div className="form-section-title">
                <span className="number">02</span>
                <h3>Due date & additional information</h3>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>
                    Due date
                    <span className="req">*</span>
                  </span>
                  <input type="date" aria-label="Due date" required min={editing ? undefined : todayIso()} value={due} onChange={(e) => setDue(e.target.value)} />
                </label>
                <label className="field">
                  <span>Attachment link</span>
                  {/* A link (attachment_url) still works; files go in the Attachments panel. */}
                  <input type="url" aria-label="Attachment link" placeholder="https://… link to the worksheet" value={attachment} onChange={(e) => setAttachment(e.target.value)} />
                </label>
                {isHw ? (
                  <label className="field">
                    <span>Out of</span>
                    {/* What the work is marked out of; a rubric below can carry its own scheme instead. */}
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      step="1"
                      aria-label="Maximum score"
                      placeholder="e.g. 20 — leave blank to only approve or return"
                      value={outOf}
                      onChange={(e) => setOutOf(e.target.value)}
                    />
                  </label>
                ) : null}
                {isHw ? (
                  <label className="field">
                    <span>Marking</span>
                    <select aria-label="Marking rubric" value={rubricId} onChange={(e) => setRubricId(e.target.value)}>
                      <option value="">No rubric — approve or return only</option>
                      {rubrics.data
                        ?.filter((r) => r.is_active)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {`${r.name} (out of ${r.max_total})`}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : (
                  <label className="field">
                    <span>Submission type</span>
                    <select aria-label="Submission type" value={projectKind} onChange={(e) => setProjectKind(e.target.value as ProjectKind)}>
                      <option value="individual">Individual</option>
                      <option value="group">Group</option>
                    </select>
                  </label>
                )}
                {isHw ? (
                  <label className="field">
                    <span>Maximum score</span>
                    <input type="text" readOnly aria-label="Maximum score" value={rubric ? String(rubric.max_total) : "Set by the rubric"} />
                  </label>
                ) : null}
                {!editing ? (
                  <label className="field full">
                    <span>Parents</span>
                    <span className="row">
                      <input type="checkbox" checked={notifyParents} onChange={(e) => setNotifyParents(e.target.checked)} style={{ width: "auto" }} />
                      Send a notice to parents of this class
                    </span>
                  </label>
                ) : null}
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : editing ? "Save changes" : isHw ? "Publish homework" : "Publish assignment"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <Panel title="Attachments" sub="PDF, image or document">
          <UploadZone onFiles={(fs) => setPending((p) => [...p, ...fs].slice(0, 5))} disabled={saving} />
          {pending.map((f, i) => (
            <div className="document-card" key={`${f.name}-${i}`}>
              <div className="file-icon">{(f.name.split(".").pop() ?? "").toUpperCase().slice(0, 4)}</div>
              <div className="document-info">
                <h4>{f.name}</h4>
                <p>{`${fileSize(f.size)} · uploads when you ${editing ? "save" : "publish"}`}</p>
              </div>
              <button type="button" className="btn text" onClick={() => setPending((p) => p.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
          {existing.data?.attachments?.length ? (
            <FileCards
              files={existing.data.attachments}
              pathOf={(a) => `/api/v1/teacher/homework/${id}/files/${a.id}`}
              onRemove={removeSaved}
              onError={setError}
            />
          ) : null}
        </Panel>
        <Panel title="Publishing">
          <dl className="kv">
            <div>
              <dt>Class</dt>
              <dd>{card?.class_name ?? "—"}</dd>
            </div>
            <div>
              <dt>Section</dt>
              <dd>{card ? card.sections.map((s) => s.section_name).join(", ") || "—" : "—"}</dd>
            </div>
            <div>
              <dt>Subject</dt>
              <dd>{card?.subject_name ?? "—"}</dd>
            </div>
            <div>
              <dt>Students</dt>
              <dd>{card ? String(card.total_students) : "—"}</dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd>{date(due)}</dd>
            </div>
          </dl>
        </Panel>
      </aside>
    </div>
  );
}
