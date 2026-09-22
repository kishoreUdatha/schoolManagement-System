"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { AcademicYear, SchoolClass } from "@/features/students/types";
import { clock } from "./common";
import { EXAM_KINDS, type ClassSubject, type Exam, type ExamType, type Paper, type Term } from "./types";

import { ask } from "@/lib/dialog";
const field = (labelText: string, control: JSX.Element, required = false, full = false) => (
  <label className={`field ${full ? "full" : ""}`}>
    <span>
      {labelText}
      {required ? <span className="req">*</span> : null}
    </span>
    {control}
  </label>
);

/**
 * SCR-140, live. Without ?id=: POST /school/exams (then PATCH exam_type_id,
 * which the create call does not take). With ?id=: PATCH /school/exams/{id},
 * and the exam's papers: POST /exams/{id}/papers, DELETE /exams/papers/{id}.
 */
export function ExamSetup() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const types = useApi<ExamType[]>("/api/v1/school/exam-types");
  const existing = useApi<Exam>(id ? `/api/v1/school/exams/${id}` : null);
  const [yearId, setYearId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing.data) setYearId(existing.data.academic_year_id);
    else if (!id && yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [existing.data, years.data, yearId, id]);

  const terms = useApi<Term[]>(yearId ? `/api/v1/school/academic-years/${yearId}/terms` : null);
  const yearClasses = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });

  if (id && existing.loading && !existing.data) return <Loading what="Loading the exam…" />;
  const ex = existing.data;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const typeId = text("exam_type_id") ? Number(text("exam_type_id")) : null;
    const termId = text("term_id") ? Number(text("term_id")) : null;
    const classIds = f.getAll("class_ids").map((v) => Number(v));
    const body = {
      name: text("name"),
      kind: text("kind"),
      start_date: text("start_date"),
      end_date: text("end_date"),
      term_id: termId,
      class_ids: classIds.length ? classIds : null,
      result_date: text("result_date"),
    };
    if (body.start_date && body.end_date && body.end_date < body.start_date) {
      setError("The end date is before the start date.");
      return;
    }
    if (body.result_date && body.end_date && body.result_date < body.end_date) {
      setError("The result date is before the exam ends.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (ex) {
        await api.patch(`/api/v1/school/exams/${ex.id}`, { ...body, exam_type_id: typeId });
        notify("Exam saved.");
        existing.reload();
      } else {
        const created = await api.post<Exam>("/api/v1/school/exams", { ...body, academic_year_id: yearId });
        if (typeId) {
          try {
            await api.patch(`/api/v1/school/exams/${created.id}`, { exam_type_id: typeId });
          } catch (err) {
            notify(`Exam created, but the exam type was not set: ${errorText(err)}`);
            router.push(`${routeOf(140)}?id=${created.id}`);
            return;
          }
        }
        notify("Exam created. Now add its papers.");
        router.push(`${routeOf(140)}?id=${created.id}`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeExam() {
    if (!ex) return;
    if (!(await ask(`Delete the exam ${ex.name} and its ${ex.papers_count} paper${ex.papers_count === 1 ? "" : "s"}? This cannot be undone.`))) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/api/v1/school/exams/${ex.id}`);
      notify("Exam deleted.");
      router.push(routeOf(138));
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  const year = years.data?.find((y) => y.id === yearId);
  // The server refuses to delete a published exam or one with marks entered.
  const deletable = ex && !ex.is_published && !ex.total_marks_entered;

  return (
    <>
      <div className="two-col">
        <form className="panel" onSubmit={submit} key={ex?.id ?? "new"}>
          <div className="panel-pad">
            <ErrorNote>{error ?? years.error ?? existing.error}</ErrorNote>
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Details</h3>
                </div>
                <div className="form-grid">
                  {field("Exam name", <input name="name" required maxLength={120} defaultValue={ex?.name} placeholder="Enter exam name" />, true)}
                  {field(
                    "Exam type",
                    <select name="exam_type_id" defaultValue={ex?.exam_type_id ?? ""}>
                      <option value="">{types.loading ? "Loading…" : "No exam type"}</option>
                      {types.data
                        ?.filter((t) => t.is_active || t.id === ex?.exam_type_id)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>,
                  )}
                  {field(
                    "Academic year",
                    <select value={yearId ?? ""} disabled={Boolean(ex)} onChange={(e) => setYearId(Number(e.target.value))} required>
                      {years.data?.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </select>,
                    true,
                  )}
                  {field(
                    "Term",
                    <select name="term_id" defaultValue={ex?.term_id ?? ""} key={`${yearId}-${terms.data?.length ?? 0}`}>
                      <option value="">{terms.data?.length ? "No term" : "No terms set up for this year"}</option>
                      {terms.data?.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>,
                  )}
                  {field(
                    "Kind",
                    <select name="kind" defaultValue={ex?.kind ?? "term"} required>
                      {EXAM_KINDS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>,
                    true,
                  )}
                  {field("Start date", <input type="date" name="start_date" required defaultValue={ex?.start_date} />, true)}
                  {field("End date", <input type="date" name="end_date" required defaultValue={ex?.end_date} />, true)}
                  {field("Result date", <input type="date" name="result_date" defaultValue={ex?.result_date ?? ""} />)}
                  <div className="field full">
                    <span>Classes</span>
                    <div className="row" style={{ flexWrap: "wrap", gap: 8 }} key={`${yearId}-${yearClasses.data?.length ?? 0}`}>
                      {yearClasses.data?.map((c) => (
                        <label className="check-item" key={c.id}>
                          <input type="checkbox" name="class_ids" value={c.id} defaultChecked={ex?.class_ids.includes(c.id)} />
                          <span>{c.name}</span>
                        </label>
                      ))}
                      {yearClasses.data && !yearClasses.data.length ? <span className="muted small">No classes in this year.</span> : null}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>Fields marked * are required</span>
            <div className="actions">
              {ex ? (
                <button
                  type="button"
                  className="btn danger"
                  onClick={removeExam}
                  disabled={saving || !deletable}
                  title={deletable ? undefined : ex.is_published ? "Unpublish the exam before deleting it" : "Marks have been entered; delete them first"}
                >
                  Delete exam
                </button>
              ) : null}
              <button type="button" className="btn" onClick={() => router.back()}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                <Icon name="check" className="sm" />
                {saving ? "Saving…" : ex ? "Save exam" : "Create exam"}
              </button>
            </div>
          </div>
        </form>
        <aside className="stack">
          <div className="aside-panel">
            <h3>Examinations</h3>
            <dl className="kv">
              <div>
                <dt>Academic year</dt>
                <dd>{ex?.academic_year_name ?? year?.name ?? "—"}</dd>
              </div>
              <div>
                <dt>Papers</dt>
                <dd>{ex ? String(ex.papers_count) : "Added after the exam is created"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{ex ? (ex.is_published ? "Published" : ex.marks_open ? "Marks entry open" : "Marks entry closed") : "New"}</dd>
              </div>
            </dl>
            <div className="gap" />
            <p>{ex ? "Save changes to the details here; add or remove papers below." : "Create the exam, then add a paper for each class and subject."}</p>
          </div>
        </aside>
      </div>
      {ex ? <Papers exam={ex} reload={existing.reload} /> : null}
    </>
  );
}

function Papers({ exam, reload }: { exam: Exam; reload: () => void }) {
  const classes = useApi<SchoolClass[]>("/api/v1/school/classes", { academic_year_id: exam.academic_year_id });
  const [classId, setClassId] = useState<number | null>(null);
  const subjects = useApi<ClassSubject[]>(classId ? `/api/v1/school/classes/${classId}/subjects` : null);
  const used = useMemo(() => new Set(exam.papers.map((p) => p.class_subject_id)), [exam.papers]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Paper | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const num = (k: string) => (String(f.get(k) ?? "").trim() === "" ? null : Number(f.get(k)));
    const max = num("max_marks");
    const pass = num("pass_marks");
    if (max !== null && pass !== null && pass > max) {
      setError("Pass marks cannot be more than the maximum.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/exams/${exam.id}/papers`, {
        class_subject_id: num("class_subject_id"),
        max_marks: max,
        pass_marks: pass,
        exam_date: String(f.get("exam_date")),
        start_time: String(f.get("start_time") ?? "") || null,
        duration_minutes: num("duration_minutes"),
      });
      notify("Paper added.");
      form.reset();
      reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(i: number) {
    const p = exam.papers[i];
    if (!(await ask(`Remove the ${p.subject_name ?? ""} paper from this exam?`))) return;
    setError(null);
    try {
      await api.delete(`/api/v1/school/exams/papers/${p.id}`);
      notify("Paper removed.");
      reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    if (!editing) return;
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (String(f.get(k) ?? "").trim() === "" ? null : Number(f.get(k)));
    const max = num("max_marks");
    const pass = num("pass_marks");
    if (max !== null && pass !== null && pass > max) {
      setEditError("Pass marks cannot be more than the maximum.");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await api.patch(`/api/v1/school/exams/papers/${editing.id}`, {
        max_marks: max,
        pass_marks: pass,
        exam_date: String(f.get("exam_date")),
        start_time: String(f.get("start_time") ?? "") || null,
        duration_minutes: num("duration_minutes"),
      });
      notify("Paper saved.");
      setEditing(null);
      reload();
    } catch (err) {
      setEditError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const rows: string[][] = exam.papers.map((p) => [
    p.subject_name ?? "—",
    p.class_name ?? "—",
    date(p.exam_date),
    p.start_time ? `${clock(p.start_time)}${p.duration_minutes ? ` · ${p.duration_minutes} min` : ""}` : "—",
    `${p.max_marks} / pass ${p.pass_marks}`,
    `${p.marks_entered_count}`,
  ]);

  return (
    <div className="stack" style={{ marginTop: 20 }}>
      <form className="panel" onSubmit={add}>
        <div className="panel-head">
          <div>
            <h2>Add a paper</h2>
            <p>{`Between ${date(exam.start_date)} and ${date(exam.end_date)}`}</p>
          </div>
        </div>
        <div className="panel-body">
          <ErrorNote>{error ?? classes.error ?? subjects.error}</ErrorNote>
          <div className="form-grid">
            {field(
              "Class",
              <select value={classId ?? ""} required onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{classes.loading ? "Loading classes…" : "Select class"}</option>
                {classes.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>,
              true,
            )}
            {field(
              "Subject",
              <select name="class_subject_id" required disabled={!classId} key={classId ?? 0}>
                <option value="">Select subject</option>
                {subjects.data?.map((cs) => (
                  <option key={cs.id} value={cs.id} disabled={used.has(cs.id)}>
                    {`${cs.subject.name} (${cs.subject.code})${used.has(cs.id) ? " — already added" : ""}`}
                  </option>
                ))}
              </select>,
              true,
            )}
            {field("Maximum marks", <input name="max_marks" type="number" min={1} max={999} required defaultValue={100} />, true)}
            {field("Pass marks", <input name="pass_marks" type="number" min={0} max={999} required defaultValue={35} />, true)}
            {field("Exam date", <input name="exam_date" type="date" required min={exam.start_date} max={exam.end_date} defaultValue={exam.start_date} />, true)}
            {field("Start time", <input name="start_time" type="time" />)}
            {field("Duration (minutes)", <input name="duration_minutes" type="number" min={1} max={600} placeholder="e.g. 90" />)}
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="plus" className="sm" />
              {saving ? "Adding…" : "Add paper"}
            </button>
          </div>
        </div>
      </form>
      <Panel title="Papers" sub={`${exam.papers.length} paper${exam.papers.length === 1 ? "" : "s"} in ${exam.name}`} flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {["Subject", "Class", "Date", "Time", "Marks", "Marks entered"].map((c) => (
                  <th key={c}>{c}</th>
                ))}
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={exam.papers[i].id}>
                  {r.map((cell, j) => (
                    <td key={j}>{String(cell)}</td>
                  ))}
                  <td className="right">
                    <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setEditError(null);
                          setEditing(exam.papers[i]);
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" className="btn" onClick={() => remove(i)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={rows.length > 0}>
          No papers yet. Add the first one above.
        </div>
      </Panel>
      {editing ? (
        <Dialog
          open
          title={`Edit ${editing.subject_name ?? "paper"}${editing.class_name ? ` · ${editing.class_name}` : ""}`}
          onClose={() => setEditing(null)}
          onSubmit={saveEdit}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? "Saving…" : "Save paper"}
              </button>
            </>
          }
        >
          <ErrorNote>{editError}</ErrorNote>
          {editing.marks_entered_count ? (
            <div className="tip warn">
              <span>{`Marks are already entered for ${editing.marks_entered_count} student${editing.marks_entered_count === 1 ? "" : "s"}. Changing the maximum or pass marks changes their grades.`}</span>
            </div>
          ) : null}
          <div className="form-grid">
            {field("Maximum marks", <input name="max_marks" type="number" min={1} max={999} required defaultValue={editing.max_marks} />, true)}
            {field("Pass marks", <input name="pass_marks" type="number" min={0} max={999} required defaultValue={editing.pass_marks} />, true)}
            {field("Exam date", <input name="exam_date" type="date" required min={exam.start_date} max={exam.end_date} defaultValue={editing.exam_date} />, true)}
            {field("Start time", <input name="start_time" type="time" defaultValue={editing.start_time?.slice(0, 5) ?? ""} />)}
            {field("Duration (minutes)", <input name="duration_minutes" type="number" min={1} max={600} defaultValue={editing.duration_minutes ?? ""} />)}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
