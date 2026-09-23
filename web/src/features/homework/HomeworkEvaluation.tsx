"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { FileCards, filesForm, UploadZone, type Attachment } from "@/components/ui/Attachments";
import { Icon } from "@/components/ui/Icon";
import { StatCards } from "@/components/ui/StatStrip";
import { Avatar, Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { LinkCard, useEach } from "./shared";
import type { Homework, MyClasses, Submission } from "./types";

import { ask } from "@/lib/dialog";
const STATUS: Record<Submission["status"], string> = { submitted: "Submitted", approved: "Approved", rejected: "Returned" };
/** Blue waiting, green marked, red sent back, grey nothing yet. */
const TONE: Record<string, "" | "warn" | "bad" | "neutral" | "blue"> = {
  Submitted: "blue",
  Approved: "",
  Returned: "bad",
  "Not handed in": "neutral",
};

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
  const classes = useApi<MyClasses>("/api/v1/teacher/my-classes");
  const [subId, setSubId] = useState<number | null>(params.get("sub") ? Number(params.get("sub")) : null);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [score, setScore] = useState("");
  const [outOf, setOutOf] = useState("");
  const [who, setWho] = useState("");
  // a child chosen from the list who has handed in nothing; there is no
  // submission to open, but the teacher still wants to see where they stand
  const [missing, setMissing] = useState<{ id: number; full_name: string; admission_no: string } | null>(null);
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open the first one still waiting, or the first at all.
  useEffect(() => {
    if (subId === null && subs.data?.length) setSubId((subs.data.find((s) => s.status === "submitted") ?? subs.data[0]).id);
  }, [subs.data, subId]);

  const s = missing ? undefined : subs.data?.find((x) => x.id === subId);
  useEffect(() => {
    setMarks({});
    setScore(s?.marks ?? "");
    setRemark(s?.teacher_remark ?? "");
    setDecision(s?.status === "rejected" ? "rejected" : "approved");
    setError(null);
  }, [s?.id, s?.teacher_remark, s?.status]);

  // the sections this homework was set to, and the children in them
  const card = classes.data?.subject_teacher_of.find((c) => c.class_subject_id === hw.data?.class_subject_id);
  const rosterPaths = (card?.sections ?? []).map((x) => `/api/v1/teacher/sections/${x.section_id}/students`);
  const rosters = useEach<{ id: number; admission_no: string; full_name: string }[]>(rosterPaths);
  const byStudent = new Map((subs.data ?? []).map((x) => [x.student_id, x]));
  const rosterRows = rosterPaths
    .flatMap((path) => rosters.data[path] ?? [])
    .map((r) => ({ id: r.id, full_name: r.full_name, admission_no: r.admission_no, sub: byStudent.get(r.id) }));

  if (!id) return <PickFirst what="homework to evaluate" href={routeOf(128)} cta="Open the homework list" />;
  if (hw.loading && !hw.data) return <Loading what="Loading the homework…" />;
  const h = hw.data;
  if (!h) return <ErrorNote>{hw.error ?? "Homework not found."}</ErrorNote>;

  async function save(e: FormEvent<HTMLFormElement> | null, draft = false) {
    e?.preventDefault();
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
      await api.patch(`/api/v1/teacher/homework/submissions/${s.id}/review`, {
        status: draft ? "submitted" : decision,
        teacher_remark: remark.trim() || null,
        ...(h?.max_marks && score.trim() !== "" ? { marks: Number(score) } : {}),
      });
      notify(draft ? "Draft saved; they are still waiting." : `Marked ${s.student_name ?? "the student"}.`);
      const next = draft ? null : subs.data?.find((x) => x.status === "submitted" && x.id !== s.id);
      await subs.reload();
      if (next) setSubId(next.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  /** Homework set before anyone thought about a score can be given one here. */
  async function setMaximum() {
    if (!h) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/v1/teacher/homework/${h.id}`, { max_marks: Number(outOf) });
      notify(`Marked out of ${Number(outOf)} from now on.`);
      setOutOf("");
      await hw.reload();
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
    if (!(await ask(`Remove “${a.file_name}”?`))) return;
    try {
      await api.delete(`/api/v1/teacher/homework/submissions/${submissionId}/review-files/${a.id}`);
      await subs.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const list = subs.data ?? [];
  const max = s?.marking?.max_total ?? list.find((x) => x.marking)?.marking?.max_total;
  const n = (v: number) => (!subs.data ? (subs.loading ? "…" : "—") : String(v));
  const count = (st: Submission["status"]) => list.filter((x) => x.status === st).length;
  const stats = [
    { label: "Submitted", value: n(list.length), note: "handed in so far", icon: "file" as const },
    { label: "To evaluate", value: n(count("submitted")), note: "waiting for your review", icon: "clock" as const },
    { label: "Approved", value: n(count("approved")), note: "evaluated by you", icon: "check" as const },
    { label: "Returned", value: n(count("rejected")), note: "sent back for revision", icon: "arrow" as const },
  ];

  // The whole class down the left, not only those who have handed in: a
  // teacher marking wants to see who is missing as much as who is waiting.
  const roll = (rosterRows.length ? rosterRows : list.map((x) => ({ id: x.student_id, full_name: x.student_name ?? "—", admission_no: x.student_admission_no ?? "—", sub: x })))
    .filter((r) => !who || `${r.full_name} ${r.admission_no}`.toLowerCase().includes(who.toLowerCase()));
  // The arrows walk the class in the order the list shows it, so they move
  // even where a child has handed nothing in.
  const place = roll.findIndex((r) => (missing ? r.id === missing.id : r.sub?.id === subId));
  const show = (r: (typeof roll)[number]) => {
    if (r.sub) {
      setMissing(null);
      setSubId(r.sub.id);
    } else {
      setMissing({ id: r.id, full_name: r.full_name, admission_no: r.admission_no });
    }
  };
  const step = (by: number) => {
    const next = roll[place + by];
    if (next) show(next);
  };

  return (
    <>
      <p className="muted small" style={{ margin: "-6px 0 14px" }}>
        {[h.title, h.subject_name, h.class_name, `Due ${date(h.due_date)}`, h.max_marks ? `Out of ${Number(h.max_marks)}` : max != null ? `Out of ${max}` : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <StatCards items={stats} />
      <div className="marking">
        <Panel title="Student submissions" sub={`${count("approved") + count("rejected")} of ${rosterRows.length || list.length} reviewed`} flush>
          <div className="roll-search">
            <div className="searchbox">
              <Icon name="search" className="sm" />
              <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Search students…" aria-label="Search students" />
            </div>
          </div>
          <div className="roll">
            {roll.map((r, i) => (
              <button
                type="button"
                key={r.id}
                className={`roll-row ${(r.sub && r.sub.id === subId && !missing) || missing?.id === r.id ? "on" : ""} ${r.sub ? "" : "none"}`}
                onClick={() => show(r)}
              >
                <Avatar name={r.full_name} index={i} />
                <span className="roll-who">
                  <span className="roll-name">{r.full_name}</span>
                  <small>{`${h.class_name ?? ""} · ${r.admission_no}`}</small>
                </span>
                <Badge tone={TONE[r.sub ? STATUS[r.sub.status] : "Not handed in"]}>{r.sub ? STATUS[r.sub.status] : "Not handed in"}</Badge>
              </button>
            ))}
            {roll.length ? null : <p className="muted panel-pad">{subs.loading ? "Loading…" : "Nobody has handed this in yet."}</p>}
          </div>
        </Panel>
        <div className="stack">
          <ErrorNote>{subs.error}</ErrorNote>
          <Panel
            title="Student submission"
            action={
              list.length ? (
                <span className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn icon" aria-label="Previous student" disabled={place <= 0} onClick={() => step(-1)}>
                    ‹
                  </button>
                  <span className="muted small">{`${place + 1} of ${roll.length}`}</span>
                  <button type="button" className="btn icon" aria-label="Next student" disabled={place < 0 || place >= roll.length - 1} onClick={() => step(1)}>
                    ›
                  </button>
                </span>
              ) : undefined
            }
          >
            {missing ? (
              <>
                <div className="spread">
                  <div className="person">
                    <Avatar name={missing.full_name} index={Math.max(0, roll.findIndex((r) => r.id === missing.id))} />
                    <div>
                      {missing.full_name}
                      <small>{`${h.class_name ?? ""} · ${missing.admission_no}`}</small>
                    </div>
                  </div>
                  <Badge tone="neutral">Not handed in</Badge>
                </div>
                <div className="gap" />
                <p className="quote">
                  {`${missing.full_name.split(" ")[0]} has handed nothing in${h.is_past_due ? `, and it was due ${date(h.due_date)}` : `; it is due ${date(h.due_date)}`}. There is nothing to mark until they do.`}
                </p>
              </>
            ) : s ? (
              <>
                <div className="spread">
                  <div className="person">
                    <Avatar name={s.student_name ?? "?"} index={Math.max(0, roll.findIndex((r) => r.sub?.id === s.id))} />
                    <div>
                      {s.student_name ?? "—"}
                      <small>{`${h.class_name ?? ""} · ${s.student_admission_no ?? "—"}`}</small>
                    </div>
                  </div>
                  <Badge tone={TONE[STATUS[s.status]]}>{STATUS[s.status]}</Badge>
                </div>
                <div className="gap" />
                <h4 className="field-title">Student&apos;s note</h4>
                <p className="quote" style={{ whiteSpace: "pre-line" }}>
                  {s.comment || "They wrote nothing with it."}
                </p>
                <div className="gap" />
                <h4 className="field-title">{s.files?.length || s.attachment_url ? "Submitted file" : "No file handed in"}</h4>
                {s.attachment_url ? <LinkCard url={s.attachment_url} note="Handed in with the work" /> : null}
                <FileCards files={s.files ?? []} pathOf={(a) => subFile(s.id, a.id)} note={`Submitted ${dateTime(s.submitted_at)}`} onError={setError} />
              </>
            ) : (
              <p className="muted">{subs.loading ? "Loading…" : "Nothing has been handed in yet."}</p>
            )}
          </Panel>
          {s ? (
            <form id="evaluation-form" className="panel" onSubmit={save}>
              <div className="panel-head">
                <h2>Evaluate submission</h2>
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
                  ) : h.max_marks ? (
                    <label className="field">
                      <span>
                        Marks
                        <span className="req">*</span>
                      </span>
                      <span className="marks-box">
                        <input
                          type="number"
                          min={0}
                          max={Number(h.max_marks)}
                          step="0.5"
                          required
                          aria-label="Marks"
                          value={score}
                          onChange={(e) => setScore(e.target.value)}
                        />
                        <span>{`/ ${Number(h.max_marks)}`}</span>
                      </span>
                    </label>
                  ) : (
                    // Set without a maximum or a rubric — so say what it would
                    // take to mark it with a number, and take it here.
                    <label className="field">
                      <span>Marks</span>
                      <span className="marks-box">
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          step="1"
                          aria-label="What this homework is out of"
                          placeholder="Out of what? e.g. 20"
                          value={outOf}
                          onChange={(e) => setOutOf(e.target.value)}
                        />
                        <button type="button" className="btn" disabled={!outOf.trim() || saving} onClick={setMaximum}>
                          Set
                        </button>
                      </span>
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
                  <div className="field full">
                    <span>Attach feedback (optional)</span>
                    <UploadZone onFiles={(fs) => reviewFiles(s.id, fs)} busy={uploading} />
                    <FileCards files={s.review_files ?? []} pathOf={(a) => subFile(s.id, a.id)} note="Your feedback file" onRemove={(a) => removeReviewFile(s.id, a)} onError={setError} />
                  </div>
                </div>
              </div>
              <div className="form-footer">
                <span>{s.reviewed_at ? `Last reviewed ${dateTime(s.reviewed_at)}${s.reviewed_by_name ? ` by ${s.reviewed_by_name}` : ""}` : "Not reviewed yet"}</span>
                <div className="actions">
                  <button type="button" className="btn" disabled={saving} onClick={() => save(null, true)}>
                    Save draft
                  </button>
                  <button type="submit" className="btn primary" disabled={saving}>
                    <Icon name="check" className="sm" />
                    {saving ? "Saving…" : place < roll.length - 1 ? "Save & next student" : "Save evaluation"}
                  </button>
                </div>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </>
  );
}
