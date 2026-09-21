"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { BLOOMS, DIFFICULTIES, KINDS, KIND_SHORT, answerText, cap, kindLabel, num, useClassSubjects, usePageAction } from "./kit";
import { QuestionForm } from "./QuestionForm";
import type { Question, QuestionPage } from "./types";

const LIMIT = 25;
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * NEW-022, live: GET/POST /school/questions, GET/PUT/DELETE
 * /school/questions/{id}, POST /school/questions/{id}/active?active=.
 * Subjects (and whether this person may write for them) come from
 * GET /school/syllabus.
 */
export function QuestionBank() {
  const cs = useClassSubjects();
  const [subjectId, setSubjectId] = useState("");
  const [kind, setKind] = useState("");
  const [bloom, setBloom] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [inactive, setInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [viewing, setViewing] = useState<Question | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);
  useEffect(() => setPage(1), [subjectId, kind, bloom, difficulty, search, inactive]);

  const list = useApi<QuestionPage>("/api/v1/school/questions", {
    subject_id: subjectId,
    kind,
    bloom_level: bloom,
    difficulty,
    search,
    include_inactive: inactive || undefined,
    limit: LIMIT,
    offset: (page - 1) * LIMIT,
  });
  // The whole bank, for the headline figures (by_bloom counts the filtered set).
  const all = useApi<QuestionPage>("/api/v1/school/questions", { limit: 1 });

  usePageAction(
    "add",
    useCallback(() => setEditing("new"), []),
  );

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const byBloom = all.data?.by_bloom ?? {};
  const higher = ["analyze", "evaluate", "create"].reduce((n, b) => n + (byBloom[b] ?? 0), 0);
  const count = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));

  const stats = [
    { label: "Questions in bank", value: count(all.data?.total), note: "Active questions you can see" },
    { label: "Subjects", value: count(cs.loading ? undefined : cs.subjects.length), note: "You can see" },
    { label: "Recall & understanding", value: count(all.data ? (byBloom.remember ?? 0) + (byBloom.understand ?? 0) : undefined), note: "Remember · Understand" },
    { label: "Higher-order", value: count(all.data ? higher : undefined), note: "Analyze · Evaluate · Create" },
  ];

  const canWrite = (q: Question) => cs.subjects.some((s) => s.id === q.subject_id && s.writable);

  const rows: Row[] = items.map((q) => [
    clip(q.text),
    q.subject_name + (q.class_level ? ` · ${q.class_level}` : ""),
    KIND_SHORT[q.kind],
    cap(q.bloom_level),
    cap(q.difficulty),
    num(q.marks),
    String(q.used_in_tests),
    q.is_active ? "Active" : "Inactive",
  ]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await fn();
      notify(done);
      list.reload();
      all.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const toggle = (q: Question) =>
    run(() => api.post(`/api/v1/school/questions/${q.id}/active`, undefined, { active: !q.is_active }), q.is_active ? "Question deactivated." : "Question activated.");
  const remove = (q: Question) => {
    if (!window.confirm("Delete this question from the bank? This cannot be undone.")) return;
    run(() => api.delete(`/api/v1/school/questions/${q.id}`), "Question deleted.");
  };

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search question text or topic…" aria-label="Search questions" />
        </div>
        <select aria-label="Subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">All subjects</option>
          {cs.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          {KINDS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Bloom's level" value={bloom} onChange={(e) => setBloom(e.target.value)}>
          <option value="">All Bloom's levels</option>
          {BLOOMS.map((b) => (
            <option key={b} value={b}>
              {`${cap(b)}${list.data?.by_bloom[b] !== undefined ? ` (${list.data.by_bloom[b]})` : ""}`}
            </option>
          ))}
        </select>
        <select aria-label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">All difficulties</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {cap(d)}
            </option>
          ))}
        </select>
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Show inactive
        </label>
      </div>
      <ErrorNote>{error ?? list.error ?? cs.error}</ErrorNote>
      <Panel title="Questions" sub={`${total} question${total === 1 ? "" : "s"}${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Question", "Subject", "Type", "Bloom's level", "Difficulty", "Marks", "Used in tests", "Status"]}
          rows={rows}
          selectable={false}
          total={total}
          page={page}
          pages={Math.max(1, Math.ceil(total / LIMIT))}
          onPage={setPage}
          actions={(i) => {
            const q = items[i];
            return (
              <>
                <button type="button" className="btn" onClick={() => setViewing(q)}>
                  View
                </button>
                {canWrite(q) ? (
                  <>
                    <button type="button" className="btn" onClick={() => setEditing(q)}>
                      Edit
                    </button>
                    <button type="button" className="btn" onClick={() => toggle(q)}>
                      {q.is_active ? "Deactivate" : "Activate"}
                    </button>
                    {/* A question used in a test cannot be deleted, only deactivated. */}
                    {q.used_in_tests ? null : (
                      <button type="button" className="btn danger" onClick={() => remove(q)}>
                        Delete
                      </button>
                    )}
                  </>
                ) : null}
              </>
            );
          }}
          empty={list.loading ? "Loading questions…" : search || subjectId || kind || bloom || difficulty ? "No questions match these filters." : "The bank is empty. Add the first question."}
        />
      </Panel>

      {editing ? (
        <QuestionForm
          question={editing === "new" ? null : editing}
          subjects={cs.subjects}
          defaultSubject={subjectId ? Number(subjectId) : null}
          onClose={() => setEditing(null)}
          onSaved={(again) => {
            notify(editing === "new" ? "Question added." : "Question saved.");
            if (!again) setEditing(null);
            list.reload();
            all.reload();
          }}
        />
      ) : null}

      {viewing ? (
        <Dialog
          open
          wide
          title={`${viewing.subject_name} · ${kindLabel(viewing.kind)}`}
          onClose={() => setViewing(null)}
          actions={
            <button type="button" className="btn" onClick={() => setViewing(null)}>
              Close
            </button>
          }
        >
          <p style={{ whiteSpace: "pre-line" }}>{viewing.text}</p>
          {viewing.options.length ? (
            <ol className="stack" style={{ gap: 6, listStyle: "none", padding: 0 }}>
              {viewing.options.map((o) => (
                <li key={o.key} className={viewing.answer.keys?.includes(o.key) ? "" : "muted"}>
                  <strong>{`${o.key}. `}</strong>
                  {o.text}
                  {viewing.answer.keys?.includes(o.key) ? " ✓" : ""}
                </li>
              ))}
            </ol>
          ) : null}
          <dl className="kv">
            <div>
              <dt>Answer</dt>
              <dd>{viewing.kind === "short" && !viewing.answer.model_answer ? "Marked by the teacher" : answerText(viewing, viewing.answer)}</dd>
            </div>
            <div>
              <dt>Bloom&apos;s level · difficulty</dt>
              <dd>{`${cap(viewing.bloom_level)} · ${cap(viewing.difficulty)}`}</dd>
            </div>
            <div>
              <dt>Marks</dt>
              <dd>{num(viewing.marks)}</dd>
            </div>
            <div>
              <dt>Class · topic</dt>
              <dd>{`${viewing.class_level ?? "Any class"}${viewing.topic ? ` · ${viewing.topic}` : ""}${viewing.chapter_title ? ` · ${viewing.chapter_title}` : ""}`}</dd>
            </div>
            <div>
              <dt>Explanation</dt>
              <dd>{viewing.explanation ?? "—"}</dd>
            </div>
          </dl>
        </Dialog>
      ) : null}
    </>
  );
}
