"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText } from "@/lib/api";
import { dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { useSetParam } from "@/features/examinations/common";
import { KIND_SHORT, TESTS_ROUTE, answerText, cap, num, testState } from "./kit";
import type { AttemptResult, ReviewQuestion, TestRead, TestResults as Results } from "./types";

/**
 * NEW-024, live: GET /school/online-tests (to choose, ?id=),
 * GET /school/online-tests/{id}/results, GET /school/test-attempts/{id}
 * (?attempt=), PUT /school/test-attempts/{id}/answers/{question_id}/grade.
 */
export function TestResults() {
  const params = useSearchParams();
  const setParam = useSetParam();
  const idParam = params.get("id");
  const attemptId = params.get("attempt");
  const tests = useApi<TestRead[]>("/api/v1/school/online-tests");
  const taken = useMemo(() => (tests.data ?? []).filter((t) => t.status !== "draft"), [tests.data]);
  const testId = idParam ? Number(idParam) : (taken[0]?.id ?? null);
  const res = useApi<Results>(testId ? `/api/v1/school/online-tests/${testId}/results` : null);
  const [filter, setFilter] = useState("");

  const r = res.data && res.data.test.id === testId ? res.data : null;
  const rows = useMemo(() => {
    const all = r?.rows ?? [];
    if (filter === "not_started") return all.filter((a) => !a.attempt_id);
    if (filter === "to_grade") return all.filter((a) => a.pending_grading > 0);
    if (filter) return all.filter((a) => a.status === filter);
    return all;
  }, [r, filter]);
  const toGrade = (r?.rows ?? []).reduce((n, a) => n + (a.pending_grading > 0 ? 1 : 0), 0);

  const stats = r
    ? [
        { label: "Attempted", value: `${r.attempted} / ${r.eligible}`, note: "Students who started" },
        { label: "Average", value: r.average_percent === null ? "—" : `${r.average_percent}%`, note: "Of submitted attempts" },
        { label: "Highest · lowest", value: r.highest === null ? "—" : `${num(r.highest)} · ${num(r.lowest)}`, note: `Out of ${num(r.test.total_marks)}` },
        { label: "Waiting for marking", value: String(toGrade), note: "Attempts with short answers to mark" },
      ]
    : [
        { label: "Attempted", value: "…", note: "Students who started" },
        { label: "Average", value: "…", note: "Of submitted attempts" },
        { label: "Highest · lowest", value: "…", note: "Scores" },
        { label: "Waiting for marking", value: "…", note: "Short answers to mark" },
      ];

  const table: Row[] = rows.map((a) => [
    { name: a.student_name, sub: a.section_label },
    a.attempt_id ? (a.submitted_at ? `${dateTime(a.submitted_at)}${a.auto_submitted ? " (time up)" : ""}` : "Still writing") : "—",
    a.score === null ? "—" : `${num(a.score)} / ${num(a.max_score)}`,
    a.percent === null ? "—" : `${a.percent}%`,
    a.pending_grading ? String(a.pending_grading) : "—",
    a.attempt_id ? label(a.status) : "Not started",
  ]);

  return (
    <>
      <div className="filterbar">
        <select aria-label="Test" value={testId ?? ""} onChange={(e) => setParam({ id: e.target.value, attempt: null })} disabled={!taken.length}>
          {!taken.length ? <option value="">{tests.loading ? "Loading tests…" : "No published tests yet"}</option> : null}
          {idParam && r && !taken.some((t) => t.id === r.test.id) ? <option value={r.test.id}>{r.test.title}</option> : null}
          {taken.map((t) => (
            <option key={t.id} value={t.id}>
              {`${t.title} · ${t.class_name} ${t.subject_name}`}
            </option>
          ))}
        </select>
        <select aria-label="Filter attempts" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All students</option>
          <option value="to_grade">Waiting for marking</option>
          <option value="graded">Graded</option>
          <option value="submitted">Submitted</option>
          <option value="in_progress">Still writing</option>
          <option value="not_started">Not started</option>
        </select>
        {r ? (
          <Link href={`${TESTS_ROUTE()}?id=${r.test.id}`} className="btn">
            Open the test
          </Link>
        ) : null}
      </div>
      <ErrorNote>{tests.error ?? res.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <div className="two-col">
        <Panel
          title={r ? r.test.title : "Results"}
          sub={r ? `${r.test.audience_label} · ${testState(r.test)} · ${r.test.question_count} questions` : res.loading ? "Loading…" : "Choose a test"}
          flush
        >
          <DataTable
            columns={["Student", "Submitted", "Score", "Percent", "To mark", "Status"]}
            rows={table}
            selectable={false}
            actions={(i) =>
              rows[i].attempt_id && rows[i].status !== "in_progress" ? (
                <button type="button" className={`btn ${rows[i].pending_grading ? "primary" : ""}`} onClick={() => setParam({ attempt: rows[i].attempt_id })}>
                  {rows[i].pending_grading ? "Mark" : "Review"}
                </button>
              ) : (
                <span className="muted small">—</span>
              )
            }
            empty={res.loading ? "Loading results…" : !testId ? "Publish a test to see its results here." : "No students match this filter."}
          />
        </Panel>
        <aside className="stack">
          <div className="aside-panel">
            <h3>By Bloom&apos;s level</h3>
            {r?.blooms.length ? (
              <dl className="kv">
                {r.blooms.map((b) => (
                  <div key={b.bloom_level}>
                    <dt>{`${cap(b.bloom_level)} · ${num(b.max_marks)} marks`}</dt>
                    <dd>{b.avg_percent === null ? "—" : `${b.avg_percent}%`}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">No answers yet.</p>
            )}
          </div>
        </aside>
      </div>
      {r ? (
        <div style={{ marginTop: 20 }}>
          <Panel title="Question analysis" sub="How the class answered each question" flush>
            <DataTable
              columns={["#", "Question", "Type", "Bloom's level", "Answered", "Correct", "Pass rate", "Average marks"]}
              rows={r.questions.map((q) => [
                String(q.sequence),
                q.text.length > 90 ? `${q.text.slice(0, 89)}…` : q.text,
                KIND_SHORT[q.kind],
                cap(q.bloom_level),
                String(q.answered),
                String(q.correct),
                q.percent_correct === null ? "—" : `${q.percent_correct}%`,
                num(q.avg_marks),
              ])}
              selectable={false}
              rowAction={false}
              empty="No questions in this test."
            />
          </Panel>
        </div>
      ) : null}
      {attemptId ? (
        <AttemptReview
          attemptId={Number(attemptId)}
          onClose={() => setParam({ attempt: null })}
          onGraded={() => res.reload()}
        />
      ) : null}
    </>
  );
}

/** One student's paper, with marking boxes for short answers. */
function AttemptReview({ attemptId, onClose, onGraded }: { attemptId: number; onClose: () => void; onGraded: () => void }) {
  const res = useApi<AttemptResult>(`/api/v1/school/test-attempts/${attemptId}`);
  const [a, setA] = useState<AttemptResult | null>(null);
  useEffect(() => {
    if (res.data) setA(res.data);
  }, [res.data]);

  return (
    <Dialog
      open
      wide
      title={a ? `${a.student_name} · ${a.title}` : "Attempt"}
      onClose={onClose}
      actions={
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <ErrorNote>{res.error}</ErrorNote>
      {!a ? (
        <p className="muted">Loading the attempt…</p>
      ) : (
        <>
          <dl className="kv">
            <div>
              <dt>Score</dt>
              <dd>{a.score === null || a.score === undefined ? "—" : `${num(a.score)} / ${num(a.max_score)}${a.percent !== null && a.percent !== undefined ? ` (${a.percent}%)` : ""}`}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>{`${dateTime(a.submitted_at)}${a.auto_submitted ? " · submitted when time ran out" : ""}`}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{a.pending_grading ? `${a.pending_grading} answer${a.pending_grading === 1 ? "" : "s"} to mark` : label(a.status)}</dd>
            </div>
          </dl>
          {(a.questions ?? []).map((q) => (
            <AnswerCard
              key={q.question_id}
              attemptId={a.attempt_id}
              q={q}
              onGraded={(next) => {
                setA(next);
                onGraded();
              }}
            />
          ))}
        </>
      )}
    </Dialog>
  );
}

function AnswerCard({ attemptId, q, onGraded }: { attemptId: number; q: ReviewQuestion; onGraded: (a: AttemptResult) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = q.kind === "short" ? Boolean(q.response?.text?.trim()) : Boolean(q.response && (q.response.keys?.length || q.response.value !== undefined));
  const verdict = q.is_correct === null ? (q.kind === "short" && answered ? "To mark" : answered ? "—" : "Not answered") : q.is_correct ? "Correct" : "Wrong";

  async function grade(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const marks = String(f.get("marks") ?? "").trim();
    const comment = String(f.get("comment") ?? "").trim();
    if (marks === "") return setError("Enter the marks.");
    if (Number(marks) > Number(q.marks)) return setError(`This question is worth ${num(q.marks)} marks.`);
    setSaving(true);
    setError(null);
    try {
      const next = await api.put<AttemptResult>(`/api/v1/school/test-attempts/${attemptId}/answers/${q.question_id}/grade`, { marks, comment: comment || null });
      notify("Marks saved.");
      onGraded(next);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" style={{ boxShadow: "none" }}>
      <div className="panel-pad stack" style={{ gap: 8 }}>
        <div className="spread">
          <strong>{`Q${q.number}. ${KIND_SHORT[q.kind]} · ${cap(q.bloom_level)}`}</strong>
          <span className="small">{`${verdict} · ${q.marks_awarded === null ? "—" : num(q.marks_awarded)} / ${num(q.marks)}`}</span>
        </div>
        <p style={{ whiteSpace: "pre-line" }}>{q.text}</p>
        <dl className="kv">
          <div>
            <dt>Answer given</dt>
            <dd style={{ whiteSpace: "pre-line" }}>{answered ? answerText(q, q.response) : "Not answered"}</dd>
          </div>
          <div>
            <dt>{q.kind === "short" ? "Model answer" : "Correct answer"}</dt>
            <dd>{q.kind === "short" && !q.correct?.model_answer ? "—" : answerText(q, q.correct)}</dd>
          </div>
          {q.teacher_comment ? (
            <div>
              <dt>Comment</dt>
              <dd>{q.teacher_comment}</dd>
            </div>
          ) : null}
        </dl>
        {q.kind === "short" && answered ? (
          <form onSubmit={grade} className="form-grid" style={{ alignItems: "end", gridTemplateColumns: "120px 1fr auto" }}>
            <label className="field">
              <span>{`Marks (of ${num(q.marks)})`}</span>
              <input name="marks" type="number" min={0} max={Number(q.marks)} step={0.25} required defaultValue={q.marks_awarded === null ? "" : Number(q.marks_awarded)} />
            </label>
            <label className="field">
              <span>Comment</span>
              <input name="comment" maxLength={500} defaultValue={q.teacher_comment ?? ""} placeholder="Optional, shown with the result" />
            </label>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Saving…" : q.marks_awarded === null ? "Save marks" : "Update"}
            </button>
          </form>
        ) : null}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </section>
  );
}
