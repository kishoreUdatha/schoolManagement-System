"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTeacherApp } from "@/components/teacherapp/TeacherShell";
import { api, errorText } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { dayLabel, MY_CLASSES, PmEmpty, PmError, PmLoading, type MyClasses } from "./parts";

type Paper = {
  exam_paper_id: number;
  exam_name: string;
  exam_is_published: boolean;
  subject_name: string;
  class_id: number;
  class_name: string;
  exam_date: string;
  max_marks: number;
  students_in_class: number;
  marks_entered: number;
};
type MarkStatus = "scored" | "absent" | "exempt";
type MarkRow = { student_id: number; roll_no: number; full_name: string; status: MarkStatus | null; marks_obtained: number | null };
type MarksView = {
  exam_name: string;
  subject_name: string | null;
  section_label: string | null;
  max_marks: number;
  pass_marks: number;
  exam_date: string;
  is_editable: boolean;
  rows: MarkRow[];
};

/** TM-006. Exam papers I teach, with how many marks are in; pick a section to enter them. */
export function TeacherMarksList() {
  const { go } = useTeacherApp();
  const papers = useApi<Paper[]>("/api/v1/teacher/marks/papers");
  const mine = useApi<MyClasses>(MY_CLASSES);
  const [open, setOpen] = useState<number | null>(null);

  // A paper belongs to a class; the sections come from the subjects I teach in it.
  const sectionsOf = (classId: number) => {
    const seen = new Map<number, string>();
    (mine.data?.subject_teacher_of ?? [])
      .filter((s) => s.class_id === classId)
      .forEach((s) => s.sections.forEach((x) => seen.set(x.section_id, `${s.class_name} ${x.section_name}`)));
    return Array.from(seen, ([id, label]) => ({ id, label }));
  };

  const list = [...(papers.data ?? [])].sort((a, b) => b.exam_date.localeCompare(a.exam_date));

  return (
    <>
      <PmError>{papers.error}</PmError>
      {papers.loading && !papers.data ? <PmLoading /> : null}
      {papers.data && !list.length ? <PmEmpty title="No exam papers">Papers for the subjects you teach appear here once the office schedules an exam.</PmEmpty> : null}
      {list.length ? (
        <div className="panel">
          {list.map((p) => {
            const sections = sectionsOf(p.class_id);
            const done = p.students_in_class > 0 && p.marks_entered >= p.students_in_class;
            const pick = (sectionId: number) => go(7, `paper=${p.exam_paper_id}&section=${sectionId}`);
            return (
              <div key={p.exam_paper_id}>
                <button className="item" onClick={() => (sections.length === 1 ? pick(sections[0].id) : setOpen(open === p.exam_paper_id ? null : p.exam_paper_id))}>
                  <span>
                    <strong>{`${p.subject_name} · ${p.class_name}`}</strong>
                    <small className="muted">{`${p.exam_name} · ${dayLabel(p.exam_date)} · out of ${p.max_marks}`}</small>
                    {p.exam_is_published ? (
                      <span className="status blue">Published</span>
                    ) : done ? (
                      <span className="status">All marks in</span>
                    ) : (
                      <span className="status amber">{`${p.marks_entered} of ${p.students_in_class} entered`}</span>
                    )}
                  </span>
                  <span>›</span>
                </button>
                {open === p.exam_paper_id ? (
                  <div className="chip-row" style={{ paddingBottom: 10 }}>
                    {sections.length ? sections.map((s) => <button key={s.id} onClick={() => pick(s.id)}>{s.label}</button>) : <span className="muted">No sections found for this class.</span>}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

type Draft = { status: MarkStatus | null; value: string };

/** TM-007. Enter marks for one paper and section. */
export function TeacherMarksEntry() {
  const { go, notify } = useTeacherApp();
  const q = useSearchParams();
  const paper = Number(q.get("paper"));
  const section = Number(q.get("section"));
  const view = useApi<MarksView>(paper && section ? `/api/v1/teacher/marks/papers/${paper}` : null, { section_id: section });
  const [draft, setDraft] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d: Record<number, Draft> = {};
    view.data?.rows.forEach((r) => (d[r.student_id] = { status: r.status, value: r.marks_obtained == null ? "" : String(r.marks_obtained) }));
    setDraft(d);
  }, [view.data]);

  if (!paper || !section) return <PmEmpty title="Pick a paper">Choose an exam paper on the Marks tab.</PmEmpty>;
  if (view.loading && !view.data) return <PmLoading />;
  if (view.error) return <PmError>{view.error}</PmError>;
  const v = view.data;
  if (!v) return null;

  const max = v.max_marks;
  const bad = (d?: Draft) => !!d && d.status !== "absent" && d.value !== "" && (!/^\d+$/.test(d.value) || Number(d.value) > max);
  const invalid = v.rows.some((r) => bad(draft[r.student_id]));
  const filled = v.rows.filter((r) => draft[r.student_id]?.status === "absent" || draft[r.student_id]?.value !== "").length;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const entries = v!.rows
        .map((r) => ({ r, d: draft[r.student_id] }))
        .filter(({ d }) => d && (d.status === "absent" || d.value !== ""))
        .map(({ r, d }) =>
          d.status === "absent" ? { student_id: r.student_id, status: "absent" } : { student_id: r.student_id, status: "scored", marks_obtained: Number(d.value) },
        );
      const res = await api.post<{ saved: number; skipped: number }>(`/api/v1/teacher/marks/papers/${paper}/save`, { section_id: section, entries });
      notify(`Saved ${res.saved} marks${res.skipped ? `, ${res.skipped} skipped` : ""}.`);
      view.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="panel soft">
        <h3 style={{ margin: 0 }}>{`${v.subject_name ?? ""} · ${v.section_label ?? ""}`}</h3>
        <p className="muted" style={{ margin: "4px 0 0" }}>{`${v.exam_name} · ${dayLabel(v.exam_date)} · out of ${max}, pass ${v.pass_marks}`}</p>
      </div>
      {!v.is_editable ? <p className="status amber">Results are published, so marks can no longer be changed.</p> : null}
      <PmError>{error}</PmError>
      <p className="micro" style={{ margin: "8px 0" }}>{`${filled} of ${v.rows.length} entered`}</p>
      <div className="panel">
        {v.rows.map((r) => {
          const d = draft[r.student_id] ?? { status: null, value: "" };
          const absent = d.status === "absent";
          return (
            <div className="mark-row" key={r.student_id}>
              <div className="who">
                <strong>{`${r.roll_no}. ${r.full_name}`}</strong>
                {bad(d) ? <small className="bad">{`Whole number, 0–${max}`}</small> : null}
              </div>
              <input
                className="score"
                inputMode="numeric"
                aria-label={`Marks for ${r.full_name}`}
                placeholder={absent ? "—" : `/${max}`}
                disabled={!v.is_editable || absent}
                value={absent ? "" : d.value}
                onChange={(e) => setDraft((m) => ({ ...m, [r.student_id]: { status: "scored", value: e.target.value.trim() } }))}
              />
              <div className="seg">
                <button
                  className={absent ? "on absent" : ""}
                  aria-pressed={absent}
                  title="Absent"
                  disabled={!v.is_editable}
                  onClick={() => setDraft((m) => ({ ...m, [r.student_id]: absent ? { status: null, value: "" } : { status: "absent", value: "" } }))}
                >
                  Ab
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {v.is_editable ? (
        <div className="sticky-save">
          <button className="action" onClick={save} disabled={saving || invalid || filled === 0}>
            {saving ? "Saving…" : invalid ? "Fix the marked rows" : "Save marks"}
          </button>
          <button className="action secondary" onClick={() => go(6)}>
            Back to papers
          </button>
        </div>
      ) : null}
    </>
  );
}
