"use client";

/*
 * PM-101 · Online tests and PM-102 · Online test. The child takes the test on
 * the parent's phone:
 *   GET  /parent/me/children/{id}/tests                  the list, with state
 *   POST /parent/me/children/{id}/tests/{test}/start     start or resume → paper
 *   GET  /parent/me/test-attempts/{attempt}              the paper (answers so far)
 *   PUT  /parent/me/test-attempts/{attempt}/answers      autosave
 *   POST /parent/me/test-attempts/{attempt}/submit       hand in → result
 *   GET  /parent/me/test-attempts/{attempt}/result       score, once released
 * The server keeps the clock: seconds_left comes from it, and it closes an
 * attempt that runs past its deadline even if this page is shut.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { parentRoute } from "@/lib/parentScreens";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading, useChildPath } from "../support/pm";

type TestState = "open" | "in_progress" | "upcoming" | "done" | "missed";

type ChildTest = {
  id: number;
  title: string;
  subject_name: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  question_count: number;
  total_marks: string;
  state: TestState | string;
  attempt_id?: number | null;
  score?: string | null;
  percent?: number | null;
  result_visible?: boolean;
};

type Kind = "single" | "multiple" | "true_false" | "numeric" | "short";
type Option = { key: string; text: string };
type Response = { keys?: string[]; value?: number | string; text?: string };

type PaperQuestion = {
  question_id: number;
  number: number;
  kind: Kind;
  text: string;
  options: Option[];
  marks: string;
  response?: Response;
};

type Paper = {
  attempt_id: number;
  test_id: number;
  title: string;
  instructions: string | null;
  student_name: string;
  deadline_at: string;
  seconds_left: number;
  status: "in_progress" | "submitted" | "graded";
  questions: PaperQuestion[];
};

type ReviewQuestion = PaperQuestion & {
  correct: Response;
  explanation: string | null;
  is_correct: boolean | null;
  marks_awarded: string | null;
  teacher_comment: string | null;
};

type AttemptResult = {
  attempt_id: number;
  title: string;
  student_name: string;
  status: "in_progress" | "submitted" | "graded";
  submitted_at: string | null;
  auto_submitted: boolean;
  visible: boolean;
  score?: string | null;
  max_score?: string | null;
  percent?: number | null;
  pending_grading?: number;
  questions?: ReviewQuestion[];
};

const testPath = (attempt: number) => `${parentRoute(102)}?attempt=${attempt}`;
const num = (v: string | null | undefined) => (v == null ? "—" : String(Number(v)));

/* ------------------------------------------------------------------ PM-101 */

export function OnlineTests() {
  return (
    <ChildGate>
      <TestList />
    </ChildGate>
  );
}

function TestList() {
  const router = useRouter();
  const base = useChildPath();
  const tests = useApi<ChildTest[]>(base && `${base}/tests`);
  const [confirm, setConfirm] = useState<ChildTest | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const all = tests.data ?? [];
  const now = all.filter((t) => t.state === "in_progress" || t.state === "open");
  const soon = all.filter((t) => t.state === "upcoming").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const done = all.filter((t) => t.state === "done");
  const missed = all.filter((t) => t.state === "missed");

  async function start(t: ChildTest) {
    if (!base) return;
    setBusy(true);
    setErr(null);
    try {
      const paper = await api.post<Paper>(`${base}/tests/${t.id}/start`);
      router.push(testPath(paper.attempt_id));
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  }

  if (tests.loading && !tests.data) return <PmLoading />;

  return (
    <>
      <PmError>{err || tests.error}</PmError>

      {confirm ? (
        <div className="panel soft">
          <span className="eyebrow">READY TO START?</span>
          <h3>{confirm.title}</h3>
          <p>
            {`${confirm.question_count} questions · ${num(confirm.total_marks)} marks · ${confirm.duration_minutes} minutes. `}
            The timer starts now and keeps running if you leave the page. Answers save as you go.
          </p>
          <button className="action" onClick={() => start(confirm)} disabled={busy}>
            {busy ? "Starting…" : "Start the test"}
          </button>
          <button className="text-button" onClick={() => setConfirm(null)} disabled={busy}>
            Not now
          </button>
        </div>
      ) : null}

      {now.length ? <h3 className="section-head">Available now</h3> : null}
      {now.map((t) => (
        <button
          key={t.id}
          className="item"
          onClick={() => (t.state === "in_progress" && t.attempt_id ? router.push(testPath(t.attempt_id)) : setConfirm(t))}
        >
          <span>
            <strong>{t.title}</strong>
            <small>{`${t.subject_name} · ${t.duration_minutes} min · closes ${dateTime(t.ends_at)}`}</small>
          </span>
          <span className="value warning">{t.state === "in_progress" ? "Resume" : "Start"}</span>
        </button>
      ))}

      {soon.length ? <h3 className="section-head">Coming up</h3> : null}
      {soon.map((t) => (
        <div key={t.id} className="item">
          <span>
            <strong>{t.title}</strong>
            <small>{`${t.subject_name} · ${t.duration_minutes} min · opens ${dateTime(t.starts_at)}`}</small>
          </span>
          <span className="value">Upcoming</span>
        </div>
      ))}

      {done.length ? <h3 className="section-head">Completed</h3> : null}
      {done.map((t) => (
        <button key={t.id} className="item" onClick={() => t.attempt_id && router.push(testPath(t.attempt_id))} disabled={!t.attempt_id}>
          <span>
            <strong>{t.title}</strong>
            <small>{`${t.subject_name} · ${num(t.total_marks)} marks`}</small>
          </span>
          <span className={t.result_visible ? "value good" : "value"}>
            {t.result_visible ? `${num(t.score)} / ${num(t.total_marks)}` : "Result pending"}
          </span>
        </button>
      ))}

      {missed.length ? <h3 className="section-head">Missed</h3> : null}
      {missed.map((t) => (
        <div key={t.id} className="item">
          <span>
            <strong>{t.title}</strong>
            <small>{`${t.subject_name} · closed ${dateTime(t.ends_at)}`}</small>
          </span>
          <span className="value bad">Missed</span>
        </div>
      ))}

      {!all.length && !tests.error ? (
        <PmEmpty title="No online tests yet">Tests your child&apos;s teachers set online will appear here.</PmEmpty>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ PM-102 */

export function OnlineTest() {
  const attempt = Number(useSearchParams().get("attempt")) || 0;
  const { go } = useParent();
  const paper = useApi<Paper>(attempt ? `/api/v1/parent/me/test-attempts/${attempt}` : null);
  const [result, setResult] = useState<AttemptResult | null>(null);

  if (!attempt)
    return (
      <>
        <PmEmpty title="No test chosen">Open a test from the online tests list.</PmEmpty>
        <button className="action" onClick={() => go(101)}>
          Online tests
        </button>
      </>
    );
  if (result) return <ResultView r={result} />;
  if (paper.loading && !paper.data) return <PmLoading />;
  if (paper.error) return <PmError>{paper.error}</PmError>;
  if (!paper.data) return null;
  if (paper.data.status !== "in_progress") return <LoadResult attempt={attempt} />;
  return <TakeTest key={paper.data.attempt_id} paper={paper.data} onDone={setResult} />;
}

function LoadResult({ attempt }: { attempt: number }) {
  const r = useApi<AttemptResult>(`/api/v1/parent/me/test-attempts/${attempt}/result`);
  if (r.loading && !r.data) return <PmLoading />;
  if (r.error) return <PmError>{r.error}</PmError>;
  return r.data ? <ResultView r={r.data} /> : null;
}

function answered(r: Response | undefined): boolean {
  if (!r) return false;
  if (r.keys) return r.keys.length > 0;
  if (r.text !== undefined) return r.text.trim() !== "";
  return r.value !== undefined && r.value !== "";
}

function clock(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function TakeTest({ paper, onDone }: { paper: Paper; onDone: (r: AttemptResult) => void }) {
  const base = `/api/v1/parent/me/test-attempts/${paper.attempt_id}`;
  const [answers, setAnswers] = useState<Record<number, Response>>(() =>
    Object.fromEntries(paper.questions.filter((q) => answered(q.response)).map((q) => [q.question_id, q.response as Response])),
  );
  const [left, setLeft] = useState(paper.seconds_left);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Unsaved changes, sent on a short delay and before submitting.
  const dirty = useRef<Record<number, Response>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const submitted = useRef(false);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const batch = dirty.current;
    if (!Object.keys(batch).length) return;
    dirty.current = {};
    setSaving("saving");
    try {
      await api.put(`${base}/answers`, { answers: batch });
      setSaving("saved");
    } catch (e) {
      // keep them for the next try, unless newer answers replaced them
      dirty.current = { ...batch, ...dirty.current };
      setSaving("failed");
      setErr(errorText(e));
    }
  }, [base]);

  function answer(qid: number, r: Response) {
    setAnswers((a) => ({ ...a, [qid]: r }));
    dirty.current[qid] = r;
    setErr(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1200);
  }

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setErr(null);
    try {
      await flush();
      onDone(await api.post<AttemptResult>(`${base}/submit`));
    } catch (e) {
      submitted.current = false;
      setErr(errorText(e));
      setBusy(false);
    }
  }, [base, flush, onDone]);

  // Count down from the server's figure; hand in when time is up.
  useEffect(() => {
    const end = Date.now() + paper.seconds_left * 1000;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        clearInterval(t);
        void submit();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [paper.seconds_left, submit]);

  // Save what is pending if the page is left.
  useEffect(() => () => void flush(), [flush]);

  const total = paper.questions.length;
  const done = paper.questions.filter((q) => answered(answers[q.question_id])).length;

  return (
    <>
      <div className="panel soft">
        <span className="eyebrow">{paper.student_name.toUpperCase()}</span>
        <h3>{paper.title}</h3>
        <div className="between">
          <span className={left <= 60 ? "status amber" : "status blue"}>{`Time left ${clock(left)}`}</span>
          <span className="micro">
            {`${done} of ${total} answered · `}
            {saving === "saving" ? "Saving…" : saving === "failed" ? "Not saved" : saving === "saved" ? "Saved" : "Saves as you go"}
          </span>
        </div>
        {paper.instructions ? <p>{paper.instructions}</p> : null}
      </div>
      <PmError>{err}</PmError>

      {paper.questions.map((q) => (
        <Question key={q.question_id} q={q} value={answers[q.question_id]} onChange={(r) => answer(q.question_id, r)} disabled={busy} />
      ))}

      {confirm ? (
        <div className="panel soft">
          <h3>Submit the test?</h3>
          <p>
            {done < total ? `${total - done} question${total - done === 1 ? " is" : "s are"} not answered. ` : "All questions are answered. "}
            Answers cannot be changed after submitting.
          </p>
          <button className="action" onClick={() => void submit()} disabled={busy}>
            {busy ? "Submitting…" : "Submit now"}
          </button>
          <button className="text-button" onClick={() => setConfirm(false)} disabled={busy}>
            Keep answering
          </button>
        </div>
      ) : (
        <button className="action" onClick={() => setConfirm(true)} disabled={busy}>
          Submit test
        </button>
      )}
    </>
  );
}

function Question({ q, value, onChange, disabled }: { q: PaperQuestion; value: Response | undefined; onChange: (r: Response) => void; disabled: boolean }) {
  const keys = value?.keys ?? [];
  const name = `q${q.question_id}`;
  return (
    <div className="panel">
      <span className="eyebrow">{`QUESTION ${q.number} · ${num(q.marks)} MARK${Number(q.marks) === 1 ? "" : "S"}`}</span>
      <p style={{ whiteSpace: "pre-wrap", fontWeight: 600 }}>{q.text}</p>
      {q.kind === "single" || q.kind === "true_false" || q.kind === "multiple"
        ? q.options.map((o) => {
            const multi = q.kind === "multiple";
            const on = keys.includes(o.key);
            return (
              <label key={o.key} className="check answer">
                <input
                  type={multi ? "checkbox" : "radio"}
                  name={name}
                  checked={on}
                  disabled={disabled}
                  onChange={() => onChange({ keys: multi ? (on ? keys.filter((k) => k !== o.key) : [...keys, o.key]) : [o.key] })}
                />
                <span>{o.text}</span>
              </label>
            );
          })
        : null}
      {q.kind === "multiple" ? <p className="micro">Choose every correct answer.</p> : null}
      {q.kind === "numeric" ? (
        <label className="field">
          Your answer
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={value?.value ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ value: e.target.value })}
          />
        </label>
      ) : null}
      {q.kind === "short" ? (
        <label className="field">
          Your answer
          <textarea rows={4} maxLength={5000} value={value?.text ?? ""} disabled={disabled} onChange={(e) => onChange({ text: e.target.value })} />
        </label>
      ) : null}
    </div>
  );
}

function shownAnswer(q: PaperQuestion, r: Response | undefined): string {
  if (!answered(r)) return "Not answered";
  if (r?.keys) return r.keys.map((k) => q.options.find((o) => o.key === k)?.text ?? k).join(", ");
  if (r?.text !== undefined) return r.text;
  return String(r?.value);
}

function ResultView({ r }: { r: AttemptResult }) {
  const { go } = useParent();
  return (
    <>
      <div className="panel soft">
        <span className="eyebrow">{r.student_name.toUpperCase()}</span>
        <h3>{r.title}</h3>
        <p>
          {r.submitted_at ? `Submitted ${dateTime(r.submitted_at)}` : "Submitted"}
          {r.auto_submitted ? " · handed in automatically when time ran out" : ""}
        </p>
        {r.visible ? (
          <div className="metrics two">
            <div className="metric">
              <small>Score</small>
              <b>{`${num(r.score)} / ${num(r.max_score)}`}</b>
            </div>
            <div className="metric">
              <small>Percentage</small>
              <b>{r.percent != null ? `${r.percent}%` : "—"}</b>
            </div>
          </div>
        ) : (
          <p className="micro">The school will release the result later. It will show here and in the online tests list.</p>
        )}
        {r.visible && r.pending_grading ? (
          <p className="micro">{`${r.pending_grading} written answer${r.pending_grading === 1 ? " is" : "s are"} still being marked by the teacher.`}</p>
        ) : null}
      </div>

      {r.visible
        ? (r.questions ?? []).map((q) => (
            <div key={q.question_id} className="panel">
              <div className="between">
                <span className="eyebrow">{`QUESTION ${q.number}`}</span>
                <span className={q.is_correct === true ? "status" : q.is_correct === false ? "status amber" : "status blue"}>
                  {q.marks_awarded != null ? `${num(q.marks_awarded)} / ${num(q.marks)}` : "Being marked"}
                </span>
              </div>
              <p style={{ whiteSpace: "pre-wrap", fontWeight: 600 }}>{q.text}</p>
              <p>
                <b>Answer given: </b>
                {shownAnswer(q, q.response)}
              </p>
              {q.kind !== "short" && q.is_correct !== true ? (
                <p>
                  <b>Correct answer: </b>
                  {shownAnswer(q, q.correct)}
                </p>
              ) : null}
              {q.explanation ? <p className="micro">{q.explanation}</p> : null}
              {q.teacher_comment ? <p className="micro">{`Teacher: ${q.teacher_comment}`}</p> : null}
            </div>
          ))
        : null}

      <button className="action" onClick={() => go(101)}>
        Back to online tests
      </button>
    </>
  );
}
