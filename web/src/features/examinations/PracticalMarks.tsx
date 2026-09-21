"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText } from "@/lib/api";
import { initials } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { ExamSelects, PaperSelect, useExamChoice, usePaperChoice } from "./common";
import type { ComponentMarkRow, ComponentMarks, Components, MarkStatus } from "./types";

const TONES = ["mint", "", "peach", "lilac"];
type Part = { name: string; max_marks: string; pass_marks: string };
type Draft = { status: MarkStatus; values: Record<string, string> };

/**
 * SCR-146, live: GET/PUT /school/exam-ops/papers/{id}/components (the parts,
 * which must add up to the paper maximum) and GET/PUT …/component-marks.
 * The total is never typed — it is the sum of the parts. Only students whose
 * row was changed are sent, so no one untouched gets a mark, zero or otherwise.
 */
export function PracticalMarks() {
  const c = useExamChoice();
  const pc = usePaperChoice(c.exam);
  const paperId = pc.paper?.id ?? null;
  const comps = useApi<Components>(paperId ? `/api/v1/school/exam-ops/papers/${paperId}/components` : null);
  const hasParts = Boolean(comps.data?.paper_id === paperId && comps.data?.components.length);
  const grid = useApi<ComponentMarks>(paperId && hasParts ? `/api/v1/school/exam-ops/papers/${paperId}/component-marks` : null);
  const g = grid.data && grid.data.paper_id === paperId ? grid.data : null;
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [parts, setParts] = useState<Part[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftOf = (r: ComponentMarkRow): Draft => ({
    status: (["scored", "absent", "exempt"].includes(r.status) ? r.status : "scored") as MarkStatus,
    values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, v === null ? "" : String(v)])),
  });

  useEffect(() => {
    setDrafts(Object.fromEntries((g?.rows ?? []).map((r) => [r.student_id, draftOf(r)])));
  }, [g]);
  useEffect(() => setParts(null), [paperId]);

  const heads = g?.components ?? [];
  const rows = g?.rows ?? [];
  const isChanged = (r: ComponentMarkRow) => JSON.stringify(drafts[r.student_id]) !== JSON.stringify(draftOf(r));
  const problem = (d: Draft | undefined): string | null => {
    if (!d || d.status !== "scored") return null;
    for (const h of heads) {
      const raw = (d.values[String(h.id)] ?? "").trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isInteger(n)) return `${h.name}: whole marks only`;
      if (n < 0 || n > h.max_marks) return `${h.name} is out of ${h.max_marks}`;
    }
    return null;
  };
  const totalOf = (d: Draft | undefined): number | null => {
    if (!d || d.status !== "scored") return null;
    let sum = 0;
    for (const h of heads) {
      const raw = (d.values[String(h.id)] ?? "").trim();
      if (raw === "") return null; // a part not yet marked: no total, not a lower one
      sum += Number(raw);
    }
    return sum;
  };

  const changed = rows.filter(isChanged);
  const invalid = changed.filter((r) => problem(drafts[r.student_id]));

  async function saveMarks() {
    if (!changed.length) {
      notify("Nothing has changed.");
      return;
    }
    if (invalid.length) {
      setError(`Fix ${invalid.map((r) => r.student_name).join(", ")} before saving.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        rows: changed.map((r) => {
          const d = drafts[r.student_id];
          // Every part is sent, blank ones as null, so a half-marked child has no total rather than a partial one.
          return {
            student_id: r.student_id,
            status: d.status,
            values: Object.fromEntries(heads.map((h) => [String(h.id), d.status === "scored" && (d.values[String(h.id)] ?? "").trim() !== "" ? Number(d.values[String(h.id)]) : null])),
          };
        }),
      };
      await api.put(`/api/v1/school/exam-ops/papers/${paperId}/component-marks`, body);
      notify(`Saved ${changed.length} student${changed.length === 1 ? "" : "s"}. Each total is the sum of its parts.`);
      grid.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveParts() {
    if (!parts || !pc.paper) return;
    const clean = parts.filter((p) => p.name.trim());
    const total = clean.reduce((n, p) => n + Number(p.max_marks || 0), 0);
    if (clean.length && total !== pc.paper.max_marks) {
      setError(`The parts add up to ${total} but the paper is out of ${pc.paper.max_marks}.`);
      return;
    }
    if (hasParts && !window.confirm("Changing the parts deletes the part marks already recorded for this paper. Continue?")) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/v1/school/exam-ops/papers/${paperId}/components`, {
        components: clean.map((p) => ({ name: p.name.trim(), max_marks: Number(p.max_marks), pass_marks: Number(p.pass_marks || 0) })),
      });
      notify(clean.length ? "Parts saved." : "The paper is marked as a whole again.");
      setParts(null);
      comps.reload();
      grid.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const editParts = () =>
    setParts(
      comps.data?.components.length
        ? comps.data.components.map((x) => ({ name: x.name, max_marks: String(x.max_marks), pass_marks: String(x.pass_marks) }))
        : [
            { name: "Theory", max_marks: "", pass_marks: "0" },
            { name: "Practical", max_marks: "", pass_marks: "0" },
          ],
    );

  const stats = [
    { label: "Exam", value: c.exam?.name ?? "—", note: c.exam?.academic_year_name ?? "" },
    { label: "Subject", value: pc.paper?.subject_name ?? "—", note: pc.paper?.subject_code ?? "" },
    { label: "Students", value: g ? String(rows.length) : "—", note: pc.paper?.class_name ?? "" },
    { label: "Maximum marks", value: pc.paper ? String(pc.paper.max_marks) : "—", note: heads.length ? heads.map((h) => `${h.max_marks} ${h.name.toLowerCase()}`).join(" + ") : "Marked as a whole" },
  ];

  return (
    <>
      <div className="filterbar">
        <ExamSelects c={c} />
        <PaperSelect {...pc} />
        <button type="button" className="btn" onClick={editParts} disabled={!paperId}>
          <Icon name="settings" className="sm" />
          {hasParts ? "Edit parts" : "Define parts"}
        </button>
        {hasParts ? (
          <button type="button" className="btn primary" onClick={saveMarks} disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : `Save internal marks${changed.length ? ` (${changed.length})` : ""}`}
          </button>
        ) : null}
      </div>
      <ErrorNote>{error ?? c.error ?? comps.error ?? grid.error}</ErrorNote>
      <StatStrip items={stats} compact />
      {parts ? (
        <Panel title="Parts of this paper" sub={`They must add up to ${pc.paper?.max_marks ?? "the paper maximum"}`} action={<span className="badge neutral">{`${parts.reduce((n, p) => n + Number(p.max_marks || 0), 0)} / ${pc.paper?.max_marks ?? "—"}`}</span>}>
          {parts.map((p, i) => (
            <div className="form-grid" key={i} style={{ marginBottom: 10 }}>
              <label className="field">
                <span>Part</span>
                <input value={p.name} maxLength={60} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="e.g. Practical" />
              </label>
              <label className="field">
                <span>Out of</span>
                <input type="number" min={1} value={p.max_marks} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, max_marks: e.target.value } : x)))} />
              </label>
              <label className="field">
                <span>Pass marks</span>
                <input type="number" min={0} value={p.pass_marks} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, pass_marks: e.target.value } : x)))} />
              </label>
              <label className="field">
                <span>&nbsp;</span>
                <button type="button" className="btn" onClick={() => setParts(parts.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </label>
            </div>
          ))}
          <div className="row">
            <button type="button" className="btn" onClick={() => setParts([...parts, { name: "", max_marks: "", pass_marks: "0" }])}>
              <Icon name="plus" className="sm" />
              Add part
            </button>
            <button type="button" className="btn" onClick={() => setParts(null)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={saveParts} disabled={saving}>
              <Icon name="check" className="sm" />
              Save parts
            </button>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>Remove every part to mark the paper as a whole again.</p>
        </Panel>
      ) : null}
      <div className="gap" />
      <Panel title="Practical & internal assessment" sub="Enter marks for each assessment component" action={<span className="badge neutral">{c.exam?.is_published ? "Published" : c.exam?.marks_open === false ? "Closed" : "Draft"}</span>} flush>
        {hasParts ? (
          <>
            <div className="table-wrap">
              <table className="data-table marks-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Roll no.</th>
                    <th>Status</th>
                    {heads.map((h) => (
                      <th key={h.id}>{`${h.name} / ${h.max_marks}`}</th>
                    ))}
                    <th>{`Total / ${pc.paper?.max_marks ?? ""}`}</th>
                    <th>Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const d = drafts[r.student_id] ?? draftOf(r);
                    const why = problem(d);
                    const total = totalOf(d);
                    return (
                      <tr key={r.student_id}>
                        <td>
                          <div className="person">
                            <span className={`avatar ${TONES[i % 4]}`}>{initials(r.student_name)}</span>
                            <div>
                              {r.student_name}
                              <small>{`${r.admission_no}${r.section_name ? ` · ${r.section_name}` : ""}`}</small>
                            </div>
                          </div>
                        </td>
                        <td>{r.roll_no ? String(r.roll_no).padStart(2, "0") : "—"}</td>
                        <td>
                          <select aria-label={`Status for ${r.student_name}`} value={d.status} onChange={(e) => setDrafts({ ...drafts, [r.student_id]: { ...d, status: e.target.value as MarkStatus } })}>
                            <option value="scored">Scored</option>
                            <option value="absent">Absent</option>
                            <option value="exempt">Exempt</option>
                          </select>
                        </td>
                        {heads.map((h) => (
                          <td key={h.id}>
                            <input
                              type="number"
                              className="marks-input practical-component"
                              min={0}
                              max={h.max_marks}
                              step={1}
                              placeholder="—"
                              disabled={d.status !== "scored"}
                              aria-label={`${h.name} for ${r.student_name}`}
                              value={d.values[String(h.id)] ?? ""}
                              onChange={(e) => setDrafts({ ...drafts, [r.student_id]: { ...d, values: { ...d.values, [String(h.id)]: e.target.value } } })}
                            />
                          </td>
                        ))}
                        <td className="mark-total strong">{d.status === "scored" ? (total ?? "—") : d.status === "absent" ? "Absent" : "Exempt"}</td>
                        <td>
                          {why ? (
                            <span className="badge bad">{why}</span>
                          ) : isChanged(r) ? (
                            <span className="small mark-valid">Not saved</span>
                          ) : d.status === "scored" && total === null ? (
                            <span className="small muted">Unmarked</span>
                          ) : (
                            <span className="small green mark-valid">Saved</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-empty" hidden={rows.length > 0}>
              {grid.loading ? "Loading students…" : "No candidates sit this paper."}
            </div>
          </>
        ) : (
          <div className="panel-pad muted">{comps.loading ? "Loading…" : pc.paper ? "This paper is marked as a whole. Define its parts (for example theory and practical) to enter marks part by part." : "Choose an exam with papers."}</div>
        )}
      </Panel>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>Each part must stay within its maximum. The total is the sum of the parts and appears only when every part is marked; a blank part is unmarked, not zero.</span>
      </div>
    </>
  );
}
