"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { BLOOMS, DIFFICULTIES, Field, KINDS, KIND_SHORT, RESULTS_ROUTE, TESTS_ROUTE, answerText, cap, num, testState, useClassSubjects } from "./kit";
import { TestForm } from "./TestForm";
import type { QuestionPage, TestDetail } from "./types";

import { ask } from "@/lib/dialog";
const VISIBILITY = { on_submit: "As soon as the student submits", after_close: "After the test closes", hidden: "Not shown to families" } as const;

/**
 * NEW-023 with ?id=: GET /school/online-tests/{id}; PUT (details), DELETE,
 * POST …/questions, DELETE …/questions/{qid}, PUT …/question-order,
 * POST …/auto-pick, …/publish, …/close.
 */
export function TestEditor({ testId }: { testId: number }) {
  const router = useRouter();
  const cs = useClassSubjects();
  const res = useApi<TestDetail>(`/api/v1/school/online-tests/${testId}`);
  const [test, setTest] = useState<TestDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [autoPick, setAutoPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (res.data) setTest(res.data);
  }, [res.data]);

  if (!test) return res.error ? <ErrorNote>{res.error}</ErrorNote> : <Loading what="Loading the test…" />;
  const t = test;
  const url = `/api/v1/school/online-tests/${t.id}`;
  const draft = t.status === "draft" && t.can_edit;

  /** Run a change; most answer with the whole test, which replaces ours. */
  async function run(fn: () => Promise<unknown>, done?: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const r = (await fn()) as TestDetail | null | undefined;
      if (r && Array.isArray(r.questions)) setTest(r);
      else res.reload();
      if (done) notify(done);
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const move = (i: number, d: -1 | 1) => {
    const ids = t.questions.map((q) => q.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    run(() => api.put(`${url}/question-order`, { question_ids: ids }));
  };

  async function remove() {
    if (!(await ask(`Delete the test "${t.title}"? This cannot be undone.`))) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(url);
      notify("Test deleted.");
      router.push(TESTS_ROUTE());
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const blooms = Object.entries(t.by_bloom).filter(([, v]) => Number(v) > 0);
  const stats = [
    { label: "Questions", value: String(t.question_count), note: `${num(t.total_marks)} marks in all` },
    { label: "Duration", value: `${t.duration_minutes} min`, note: `${dateTime(t.starts_at)} – ${dateTime(t.ends_at)}` },
    { label: "Attempts", value: String(t.attempts), note: t.status === "draft" ? "Opens once published" : "Students who started" },
    { label: "Status", value: testState(t), note: t.audience_label },
  ];

  return (
    <>
      <div className="filterbar">
        <Link href={TESTS_ROUTE()} className="btn">
          ‹ All tests
        </Link>
        <span style={{ flex: 1 }} />
        {t.can_edit && t.status !== "closed" ? (
          <button type="button" className="btn" onClick={() => setEditing(true)} disabled={busy}>
            Edit details
          </button>
        ) : null}
        {t.status !== "draft" ? (
          <Link href={`${RESULTS_ROUTE()}?id=${t.id}`} className="btn">
            <Icon name="chart" className="sm" />
            {`Results (${t.attempts})`}
          </Link>
        ) : null}
        {t.can_edit && !t.attempts ? (
          <button type="button" className="btn danger" onClick={remove} disabled={busy}>
            Delete
          </button>
        ) : null}
        {draft ? (
          <button
            type="button"
            className="btn primary"
            disabled={busy || !t.question_count}
            onClick={async () => (await ask("Publish this test? Families are notified and the questions are locked.")) && run(() => api.post(`${url}/publish`), "Test published. Families were notified.")}
          >
            <Icon name="check" className="sm" />
            Publish
          </button>
        ) : null}
        {t.can_edit && t.status === "published" ? (
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={async () => (await ask("Close this test now? Anyone still writing is submitted as they are.")) && run(() => api.post(`${url}/close`), "Test closed.")}
          >
            Close now
          </button>
        ) : null}
      </div>
      <ErrorNote>{error ?? res.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <div className="two-col">
        <Panel
          title={t.title}
          sub={`${t.class_name} · ${t.subject_name} · ${t.audience_label}`}
          action={
            draft ? (
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className="btn" onClick={() => setAutoPick(true)} disabled={busy}>
                  Auto-pick
                </button>
                <button type="button" className="btn primary" onClick={() => setPicking(true)} disabled={busy}>
                  <Icon name="plus" className="sm" />
                  Add from bank
                </button>
              </div>
            ) : undefined
          }
          flush
        >
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {["#", "Question", "Type", "Bloom's level", "Marks", "Answer"].map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                  {draft ? <th className="right">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {t.questions.map((q, i) => (
                  <tr key={q.id}>
                    <td>{String(i + 1)}</td>
                    <td className="wrap">{q.text}</td>
                    <td>{KIND_SHORT[q.kind]}</td>
                    <td>{cap(q.bloom_level)}</td>
                    <td>{num(q.test_marks)}</td>
                    <td className="wrap">{q.kind === "short" ? (q.answer.model_answer ? `Model: ${q.answer.model_answer}` : "Teacher marks") : answerText(q, q.answer)}</td>
                    {draft ? (
                      <td className="right">
                        <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                          <button type="button" className="btn" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>
                            ↑
                          </button>
                          <button type="button" className="btn" aria-label="Move down" disabled={busy || i === t.questions.length - 1} onClick={() => move(i, 1)}>
                            ↓
                          </button>
                          <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.delete(`${url}/questions/${q.id}`), "Question removed from the test.")}>
                            Remove
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-empty" hidden={t.questions.length > 0}>
            {draft ? "No questions yet. Add them from the bank, or let auto-pick choose a Bloom's mix." : "This test has no questions."}
          </div>
        </Panel>
        <aside className="stack">
          <div className="aside-panel">
            <h3>Test settings</h3>
            <dl className="kv">
              <div>
                <dt>Opens</dt>
                <dd>{dateTime(t.starts_at)}</dd>
              </div>
              <div>
                <dt>Closes</dt>
                <dd>{dateTime(t.ends_at)}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{`${t.duration_minutes} minutes`}</dd>
              </div>
              <div>
                <dt>Negative marking</dt>
                <dd>{Number(t.negative_marking) ? `−${num(t.negative_marking)} × marks per wrong answer` : "None"}</dd>
              </div>
              <div>
                <dt>Shuffle</dt>
                <dd>{[t.shuffle_questions ? "Questions" : "", t.shuffle_options ? "Options" : ""].filter(Boolean).join(" and ") || "Off"}</dd>
              </div>
              <div>
                <dt>Results shown</dt>
                <dd>{VISIBILITY[t.result_visibility]}</dd>
              </div>
            </dl>
            {t.instructions ? (
              <>
                <div className="gap" />
                <p style={{ whiteSpace: "pre-line" }}>{t.instructions}</p>
              </>
            ) : null}
          </div>
          <div className="aside-panel">
            <h3>Bloom&apos;s mix</h3>
            {blooms.length ? (
              <dl className="kv">
                {blooms.map(([b, m]) => (
                  <div key={b}>
                    <dt>{cap(b)}</dt>
                    <dd>{`${num(m)} marks`}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">No questions yet.</p>
            )}
          </div>
          {!t.can_edit ? (
            <div className="tip">
              <span>Only the subject teacher or the school admin can change this test.</span>
            </div>
          ) : null}
        </aside>
      </div>

      {editing ? (
        <TestForm
          test={t}
          classSubjects={cs.rows}
          onClose={() => setEditing(false)}
          onSaved={(d) => {
            setEditing(false);
            setTest(d);
            notify("Test saved.");
          }}
        />
      ) : null}
      {picking ? <BankPicker test={t} onClose={() => setPicking(false)} run={run} /> : null}
      {autoPick ? <AutoPick test={t} onClose={() => setAutoPick(false)} run={run} /> : null}
    </>
  );
}

type Run = (fn: () => Promise<unknown>, done?: string) => Promise<boolean>;

/** Choose bank questions of this test's subject: POST …/questions. */
function BankPicker({ test, onClose, run }: { test: TestDetail; onClose: () => void; run: Run }) {
  const [bloom, setBloom] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [kind, setKind] = useState("");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [marks, setMarks] = useState("");

  useEffect(() => {
    const h = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(h);
  }, [typed]);

  const bank = useApi<QuestionPage>("/api/v1/school/questions", { subject_id: test.subject_id, bloom_level: bloom, difficulty, kind, search, limit: 200 });
  const inTest = new Set(test.questions.map((q) => q.id));
  const items = (bank.data?.items ?? []).filter((q) => !inTest.has(q.id));

  const flip = (id: number) => {
    const n = new Set(chosen);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setChosen(n);
  };

  async function submit(_e: FormEvent<HTMLFormElement>) {
    if (!chosen.size) return;
    const ok = await run(
      () => api.post(`/api/v1/school/online-tests/${test.id}/questions`, { question_ids: [...chosen], marks: marks.trim() === "" ? null : marks.trim() }),
      `${chosen.size} question${chosen.size === 1 ? "" : "s"} added.`,
    );
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      wide
      title={`Add ${test.subject_name} questions`}
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!chosen.size}>
            {`Add ${chosen.size || ""} question${chosen.size === 1 ? "" : "s"}`}
          </button>
        </>
      }
    >
      <div className="filterbar" style={{ marginBottom: 0 }}>
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search the bank…" aria-label="Search the bank" />
        </div>
        <select aria-label="Bloom's level" value={bloom} onChange={(e) => setBloom(e.target.value)}>
          <option value="">Any Bloom's level</option>
          {BLOOMS.map((b) => (
            <option key={b} value={b}>
              {cap(b)}
            </option>
          ))}
        </select>
        <select aria-label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">Any difficulty</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {cap(d)}
            </option>
          ))}
        </select>
        <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Any type</option>
          {KINDS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{bank.error}</ErrorNote>
      <div className="checklist">
        {items.map((q) => (
          <label key={q.id} className="check-item" style={{ alignItems: "flex-start" }}>
            <input type="checkbox" checked={chosen.has(q.id)} onChange={() => flip(q.id)} />
            <span>
              {q.text}
              <small className="muted" style={{ display: "block" }}>{`${KIND_SHORT[q.kind]} · ${cap(q.bloom_level)} · ${cap(q.difficulty)} · ${num(q.marks)} mark${Number(q.marks) === 1 ? "" : "s"}`}</small>
            </span>
          </label>
        ))}
      </div>
      {!items.length ? <p className="muted">{bank.loading ? "Loading the bank…" : "No more questions of this subject match. Add some in the question bank."}</p> : null}
      <Field label="Marks each (leave blank to keep each question's own)">
        <input type="number" min={0.25} max={100} step={0.25} value={marks} onChange={(e) => setMarks(e.target.value)} />
      </Field>
    </Dialog>
  );
}

type Rule = { bloom_level: string; difficulty: string; kind: string; count: string };

/** Random questions from the bank, row by row: POST …/auto-pick. */
function AutoPick({ test, onClose, run }: { test: TestDetail; onClose: () => void; run: Run }) {
  const [rules, setRules] = useState<Rule[]>([
    { bloom_level: "remember", difficulty: "", kind: "", count: "3" },
    { bloom_level: "understand", difficulty: "", kind: "", count: "3" },
    { bloom_level: "apply", difficulty: "", kind: "", count: "2" },
  ]);
  const set = (i: number, k: keyof Rule, v: string) => setRules(rules.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function submit(_e: FormEvent<HTMLFormElement>) {
    const body = {
      rules: rules.map((r) => ({ count: Number(r.count), bloom_level: r.bloom_level || null, difficulty: r.difficulty || null, kind: r.kind || null })),
    };
    if (await run(() => api.post(`/api/v1/school/online-tests/${test.id}/auto-pick`, body), "Questions picked.")) onClose();
  }

  return (
    <Dialog
      open
      wide
      title="Auto-pick questions"
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Pick questions
          </button>
        </>
      }
    >
      <p className="muted">{`Random active ${test.subject_name} questions not already in the test, for each row.`}</p>
      {rules.map((r, i) => (
        <div className="form-grid" key={i} style={{ gridTemplateColumns: "1fr 1fr 1fr 90px auto", alignItems: "end" }}>
          <Field label="Bloom's level">
            <select value={r.bloom_level} onChange={(e) => set(i, "bloom_level", e.target.value)}>
              <option value="">Any</option>
              {BLOOMS.map((b) => (
                <option key={b} value={b}>
                  {cap(b)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Difficulty">
            <select value={r.difficulty} onChange={(e) => set(i, "difficulty", e.target.value)}>
              <option value="">Any</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {cap(d)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select value={r.kind} onChange={(e) => set(i, "kind", e.target.value)}>
              <option value="">Any</option>
              {KINDS.map(([v]) => (
                <option key={v} value={v}>
                  {KIND_SHORT[v]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="How many">
            <input type="number" min={1} max={100} required value={r.count} onChange={(e) => set(i, "count", e.target.value)} />
          </Field>
          <button type="button" className="btn text" aria-label="Remove row" disabled={rules.length === 1} onClick={() => setRules(rules.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      {rules.length < 20 ? (
        <div>
          <button type="button" className="btn text" onClick={() => setRules([...rules, { bloom_level: "", difficulty: "", kind: "", count: "2" }])}>
            + Add row
          </button>
        </div>
      ) : null}
      <p className="small muted">Picked questions keep their own marks. If the bank runs short for a row, nothing is added and the shortfall is shown.</p>
    </Dialog>
  );
}
