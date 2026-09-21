"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText } from "@/lib/api";
import { date, initials } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSetParam } from "./common";
import type { MarkRow, MarkStatus, MarksSaveResult, MarksView, MyClasses, MyPaper } from "./types";

const TONES = ["mint", "", "peach", "lilac"];

/** What the teacher has typed for one student, before it is saved. */
type Draft = { status: MarkStatus | null; marks: string; remark: string };

const draftOf = (r: MarkRow): Draft => ({ status: r.status, marks: r.marks_obtained === null ? "" : String(r.marks_obtained), remark: r.remark ?? "" });

/** Why a row cannot be saved as it stands, or null when it can. */
function problem(d: Draft, max: number): string | null {
  if (d.status !== "scored") return null;
  if (d.marks.trim() === "") return "Enter marks, or mark absent / exempt";
  const n = Number(d.marks);
  if (!Number.isInteger(n)) return "Whole marks only";
  if (n < 0) return "Cannot be below 0";
  if (n > max) return `Cannot exceed ${max}`;
  return null;
}

/** The teacher's papers, the sections of the chosen one, from ?paper= & ?section=. */
export function useTeacherPaper() {
  const params = useSearchParams();
  const setParam = useSetParam();
  const papers = useApi<MyPaper[]>("/api/v1/teacher/marks/papers");
  const classes = useApi<MyClasses>("/api/v1/teacher/my-classes");
  const wanted = Number(params.get("paper"));
  const list = papers.data ?? [];
  const paper = list.find((p) => p.exam_paper_id === wanted) ?? list[0] ?? null;
  const sections = useMemo(() => {
    const seen = new Map<number, string>();
    classes.data?.subject_teacher_of.filter((s) => s.class_id === paper?.class_id).forEach((s) => s.sections.forEach((x) => seen.set(x.section_id, x.section_name)));
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [classes.data, paper]);
  const wantedSection = Number(params.get("section"));
  const section = sections.find((s) => s.id === wantedSection) ?? sections[0] ?? null;
  return {
    papers: list,
    paper,
    sections,
    section,
    loading: papers.loading || classes.loading,
    error: papers.error ?? classes.error,
    setPaper: (id: number) => setParam({ paper: id, section: null }),
    setSection: (id: number) => setParam({ section: id }),
  };
}

export function TeacherPaperSelects({ t }: { t: ReturnType<typeof useTeacherPaper> }) {
  return (
    <>
      <select aria-label="Paper" value={t.paper?.exam_paper_id ?? ""} onChange={(e) => t.setPaper(Number(e.target.value))} disabled={!t.papers.length}>
        {!t.papers.length ? <option value="">{t.loading ? "Loading your papers…" : "No papers assigned to you"}</option> : null}
        {t.papers.map((p) => (
          <option key={p.exam_paper_id} value={p.exam_paper_id}>
            {`${p.exam_name} · ${p.subject_name} · ${p.class_name}`}
          </option>
        ))}
      </select>
      <select aria-label="Section" value={t.section?.id ?? ""} onChange={(e) => t.setSection(Number(e.target.value))} disabled={!t.sections.length}>
        {!t.sections.length ? <option value="">No sections</option> : null}
        {t.sections.map((s) => (
          <option key={s.id} value={s.id}>
            {`Section ${s.name}`}
          </option>
        ))}
      </select>
    </>
  );
}

/**
 * SCR-145, live: GET /teacher/marks/papers, /teacher/my-classes,
 * /teacher/marks/papers/{id}?section_id=; POST …/save and …/mark-all-absent.
 * Only rows the teacher changed are sent. A student left blank stays
 * unmarked — never saved as zero — and marks outside 0…max are held back.
 */
export function MarksEntry() {
  const t = useTeacherPaper();
  const paperId = t.paper?.exam_paper_id ?? null;
  const sectionId = t.section?.id ?? null;
  const view = useApi<MarksView>(paperId && sectionId ? `/api/v1/teacher/marks/papers/${paperId}` : null, { section_id: sectionId });
  const v = view.data && view.data.exam_paper_id === paperId && view.data.section_id === sectionId ? view.data : null;
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(Object.fromEntries((v?.rows ?? []).map((r) => [r.student_id, draftOf(r)])));
  }, [v]);

  const rows = v?.rows ?? [];
  const max = v?.max_marks ?? 0;
  const editable = v?.is_editable ?? false;
  const changed = rows.filter((r) => {
    const d = drafts[r.student_id];
    if (!d) return false;
    const o = draftOf(r);
    return d.status !== o.status || d.marks.trim() !== o.marks || d.remark.trim() !== o.remark;
  });
  const invalid = changed.filter((r) => problem(drafts[r.student_id], max));

  const set = (id: number, patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [id]: { ...all[id], ...patch } }));

  async function save() {
    if (!v || !changed.length) {
      notify("Nothing has changed.");
      return;
    }
    if (invalid.length) {
      setError(`${invalid.length} row${invalid.length === 1 ? " needs" : "s need"} attention before saving: ${invalid.map((r) => r.full_name).join(", ")}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const entries = changed
        .filter((r) => drafts[r.student_id].status !== null)
        .map((r) => {
          const d = drafts[r.student_id];
          return {
            student_id: r.student_id,
            status: d.status,
            marks_obtained: d.status === "scored" ? Number(d.marks) : null,
            remark: d.remark.trim() || null,
          };
        });
      const res = await api.post<MarksSaveResult>(`/api/v1/teacher/marks/papers/${paperId}/save`, { section_id: sectionId, entries });
      if (res.errors?.length) setError(`Saved ${res.saved}, but ${res.errors.length} were refused: ${res.errors.map((e) => e.error).join("; ")}`);
      else notify(`Saved ${res.saved} student${res.saved === 1 ? "" : "s"}.`);
      view.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function allAbsent() {
    if (!window.confirm("Mark every unmarked student absent? Students who already have marks are not touched.")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<MarksSaveResult>(`/api/v1/teacher/marks/papers/${paperId}/mark-all-absent`, undefined, { section_id: sectionId });
      notify(`Marked ${res.saved} absent.`);
      view.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const s = v?.summary ?? {};
  const shown = rows.filter((r) => {
    const st = drafts[r.student_id]?.status ?? null;
    return !filter || (filter === "unmarked" ? st === null : st === filter);
  });

  const stats = [
    { label: "Exam", value: t.paper?.exam_name ?? "—", note: t.paper ? date(t.paper.exam_date) : "Choose a paper" },
    { label: "Subject", value: t.paper?.subject_name ?? "—", note: t.paper?.subject_code ?? "" },
    { label: "Students", value: v ? String(rows.length) : "—", note: v ? `${v.section_label ?? v.class_name ?? ""} · ${s.unmarked ?? 0} unmarked` : "In this section" },
    { label: "Maximum marks", value: v ? String(v.max_marks) : "—", note: v ? `Pass at ${v.pass_marks}` : "" },
  ];

  return (
    <>
      <div className="filterbar">
        <TeacherPaperSelects t={t} />
        <select aria-label="Filter status" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All students</option>
          <option value="unmarked">Unmarked</option>
          <option value="scored">Scored</option>
          <option value="absent">Absent</option>
          <option value="exempt">Exempt</option>
        </select>
        {editable ? (
          <>
            <button type="button" className="btn" onClick={allAbsent} disabled={saving}>
              Mark unmarked absent
            </button>
            <button type="button" className="btn primary" onClick={save} disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : `Save marks${changed.length ? ` (${changed.length})` : ""}`}
            </button>
          </>
        ) : null}
        {paperId ? (
          <Link className="btn" href={`${routeOf(147)}?paper=${paperId}${sectionId ? `&section=${sectionId}` : ""}`}>
            <Icon name="folder" className="sm" />
            Import from CSV
          </Link>
        ) : null}
      </div>
      <ErrorNote>{error ?? t.error ?? view.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <Panel
        title="Enter student marks"
        sub={v ? `${v.subject_name ?? ""} · ${v.section_label ?? v.class_name ?? ""} · out of ${v.max_marks}` : view.loading ? "Loading…" : "Choose a paper and section"}
        action={<span className={`badge ${v?.is_published ? "" : editable ? "neutral" : "warn"}`}>{v ? (v.is_published ? "Published" : editable ? "Draft" : "Closed") : "—"}</span>}
        flush
      >
        <div className="table-wrap">
          <table className="data-table marks-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Roll no.</th>
                <th>Status</th>
                <th>{`Marks / ${max || "—"}`}</th>
                <th>Grade</th>
                <th>Remark</th>
                <th>Validation</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const d = drafts[r.student_id] ?? draftOf(r);
                const why = problem(d, max);
                const dirty = changed.includes(r);
                return (
                  <tr key={r.student_id}>
                    <td>
                      <div className="person">
                        <span className={`avatar ${TONES[i % 4]}`}>{initials(r.full_name)}</span>
                        <div>
                          {r.full_name}
                          <small>{r.admission_no}</small>
                        </div>
                      </div>
                    </td>
                    <td>{String(r.roll_no).padStart(2, "0")}</td>
                    <td>
                      <select
                        aria-label={`Status for ${r.full_name}`}
                        value={d.status ?? ""}
                        disabled={!editable}
                        onChange={(e) => set(r.student_id, { status: (e.target.value || null) as MarkStatus | null, ...(e.target.value !== "scored" ? { marks: "" } : {}) })}
                      >
                        <option value="" disabled={r.status !== null}>
                          Unmarked
                        </option>
                        <option value="scored">Scored</option>
                        <option value="absent">Absent</option>
                        <option value="exempt">Exempt</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="marks-input"
                        type="number"
                        min={0}
                        max={max}
                        step={1}
                        inputMode="numeric"
                        aria-label={`Marks for ${r.full_name}`}
                        value={d.marks}
                        disabled={!editable || (d.status !== null && d.status !== "scored")}
                        placeholder="—"
                        onChange={(e) => set(r.student_id, { marks: e.target.value, ...(d.status === null && e.target.value !== "" ? { status: "scored" as const } : {}) })}
                      />
                    </td>
                    <td className="mark-grade">{dirty ? "—" : (r.grade ?? "—")}</td>
                    <td>
                      <input
                        type="text"
                        maxLength={300}
                        aria-label={`Remark for ${r.full_name}`}
                        value={d.remark}
                        disabled={!editable}
                        placeholder={editable ? "Optional" : ""}
                        onChange={(e) => set(r.student_id, { remark: e.target.value })}
                      />
                    </td>
                    <td>
                      {why ? (
                        <span className="badge bad">{why}</span>
                      ) : d.status === null ? (
                        <span className="small muted">Unmarked</span>
                      ) : dirty ? (
                        <span className="small mark-valid">Not saved</span>
                      ) : (
                        <span className="small green mark-valid">{d.status === "scored" ? (r.is_pass === false ? "Saved · below pass" : "Saved") : "Saved"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={shown.length > 0}>
          {view.loading ? "Loading students…" : v ? "No students match this filter." : "Choose a paper and section to enter marks."}
        </div>
      </Panel>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>
          {v && !editable
            ? "Marks are read-only: the exam is published or marks entry is closed. Ask the exam coordinator to reopen it."
            : `Marks must be whole numbers from 0 to ${max || "the paper maximum"}. A student left blank stays unmarked — it is not saved as zero. Grades are worked out by the school's grade scale when you save.`}
        </span>
      </div>
    </>
  );
}
