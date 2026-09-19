"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AttemptReview } from "@/components/online-exam/Results";
import type { AttemptResult, PaperQuestion } from "@/components/online-exam/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Paper = {
  attempt_id: number;
  test_id: number;
  title: string;
  instructions: string | null;
  student_id: number;
  student_name: string;
  deadline_at: string;
  seconds_left: number;
  status: string;
  questions: PaperQuestion[];
};
type Resp = PaperQuestion["response"];

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** The exam screen: server-timed countdown, autosave every few seconds, submit. */
export function TakeTest({ attemptId }: { attemptId: string }) {
  const [paper, setPaper] = useState<Paper | null>(null);
  const [answers, setAnswers] = useState<Record<number, Resp>>({});
  const [left, setLeft] = useState(0);
  const [current, setCurrent] = useState(0);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef<Set<number>>(new Set());
  const endAt = useRef(0);
  const submitting = useRef(false);

  const fetchResult = useCallback(async () => {
    const r = await api.get<AttemptResult>(`/api/v1/parent/me/test-attempts/${attemptId}/result`);
    setResult(r.data);
  }, [attemptId]);

  useEffect(() => {
    api
      .get<Paper>(`/api/v1/parent/me/test-attempts/${attemptId}`)
      .then((r) => {
        setPaper(r.data);
        setAnswers(Object.fromEntries(r.data.questions.map((q) => [q.question_id, q.response ?? {}])));
        endAt.current = Date.now() + r.data.seconds_left * 1000;
        setLeft(r.data.seconds_left);
      })
      .catch(() => fetchResult().catch((e) => setError(apiError(e))));
  }, [attemptId, fetchResult]);

  const save = useCallback(async () => {
    if (!dirty.current.size) return true;
    const ids = Array.from(dirty.current);
    dirty.current = new Set();
    setSaving("saving");
    try {
      await api.put(`/api/v1/parent/me/test-attempts/${attemptId}/answers`, {
        answers: Object.fromEntries(ids.map((id) => [id, answers[id] ?? {}])),
      });
      setSaving("saved");
      return true;
    } catch (e) {
      ids.forEach((id) => dirty.current.add(id));
      setSaving("error");
      setError(apiError(e));
      return false;
    }
  }, [answers, attemptId]);

  const submit = useCallback(
    async (auto = false) => {
      if (submitting.current) return;
      if (!auto && !window.confirm("Submit the test? You can't change answers afterwards.")) return;
      submitting.current = true;
      await save();
      try {
        const r = await api.post<AttemptResult>(`/api/v1/parent/me/test-attempts/${attemptId}/submit`);
        setResult(r.data);
        setPaper(null);
      } catch (e) {
        setError(apiError(e));
        await fetchResult().catch(() => undefined);
      }
    },
    [attemptId, save, fetchResult]
  );

  // countdown based on the server's remaining seconds
  useEffect(() => {
    if (!paper) return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        clearInterval(t);
        submit(true);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [paper, submit]);

  // autosave
  useEffect(() => {
    if (!paper) return;
    const t = setInterval(() => void save(), 5000);
    return () => clearInterval(t);
  }, [paper, save]);

  const setAnswer = (qid: number, r: Resp) => {
    dirty.current.add(qid);
    setSaving("idle");
    setAnswers((a) => ({ ...a, [qid]: r }));
  };

  if (result) {
    return (
      <div className="space-y-4">
        <Link href={`/parent/children/${result.student_id}/tests`} className="text-sm text-brand-700 hover:underline">
          ← Back to tests
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{result.title}</h1>
        <Card>
          <CardBody className="text-center">
            <div className="text-sm text-slate-500">
              {result.student_name} · submitted{result.auto_submitted ? " automatically when time ran out" : ""}
            </div>
            {result.visible ? (
              <>
                <div className="mt-1 text-4xl font-bold text-slate-900">
                  {Number(result.score)} / {Number(result.max_score)}
                </div>
                <div className="text-sm text-slate-500">
                  {result.percent}%{result.pending_grading ? ` · ${result.pending_grading} answer(s) still to be marked by the teacher` : ""}
                </div>
              </>
            ) : (
              <div className="mt-2 text-sm text-slate-600">Answers saved. The school will share results later.</div>
            )}
          </CardBody>
        </Card>
        {result.visible && <AttemptReview r={result} />}
      </div>
    );
  }
  if (!paper) return error ? <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null;

  const q = paper.questions[current];
  const r = answers[q.question_id] ?? {};
  const answered = (x: PaperQuestion) => {
    const a = answers[x.question_id] ?? {};
    return (a.keys?.length ?? 0) > 0 || a.value !== undefined || !!a.text?.trim();
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-900">{paper.title}</div>
          <div className="text-xs text-slate-500">
            {paper.student_name} · {paper.questions.filter(answered).length}/{paper.questions.length} answered ·{" "}
            {saving === "saving" ? "saving…" : saving === "saved" ? "saved" : saving === "error" ? "not saved, retrying" : ""}
          </div>
        </div>
        <div className={cn("rounded-md px-3 py-1 font-mono text-lg font-bold", left < 60 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-900")}>{mmss(left)}</div>
        <Button onClick={() => submit(false)}>Submit</Button>
      </div>
      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      {paper.instructions && current === 0 && <p className="whitespace-pre-line text-sm text-slate-600">{paper.instructions}</p>}

      <Card>
        <CardBody className="space-y-3">
          <div className="text-xs text-slate-500">
            Question {q.number} of {paper.questions.length} · {Number(q.marks)} mark{Number(q.marks) === 1 ? "" : "s"}
            {q.kind === "multiple" && " · choose all that apply"}
          </div>
          <div className="whitespace-pre-line text-lg text-slate-900">{q.text}</div>
          {(q.kind === "single" || q.kind === "true_false" || q.kind === "multiple") && (
            <div className="space-y-2">
              {q.options.map((o) => {
                const on = (r.keys ?? []).includes(o.key);
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => {
                      const keys = q.kind === "multiple" ? (on ? (r.keys ?? []).filter((k) => k !== o.key) : [...(r.keys ?? []), o.key]) : [o.key];
                      setAnswer(q.question_id, { keys });
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-slate-800",
                      on ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-400"
                    )}
                  >
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center border text-xs", q.kind === "multiple" ? "rounded" : "rounded-full", on && "border-brand-600 bg-brand-600 text-white")}>
                      {on ? "✓" : ""}
                    </span>
                    {o.text}
                  </button>
                );
              })}
            </div>
          )}
          {q.kind === "numeric" && (
            <input
              type="number"
              step="any"
              className="w-48 rounded-md border border-slate-300 px-3 py-2 text-slate-900"
              value={r.value ?? ""}
              onChange={(e) => setAnswer(q.question_id, e.target.value === "" ? {} : { value: Number(e.target.value) })}
            />
          )}
          {q.kind === "short" && (
            <textarea
              rows={5}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
              value={r.text ?? ""}
              onChange={(e) => setAnswer(q.question_id, { text: e.target.value })}
            />
          )}
          {(r.keys?.length || r.value !== undefined) && q.kind !== "short" ? (
            <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setAnswer(q.question_id, {})}>
              Clear answer
            </button>
          ) : null}
        </CardBody>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="secondary" disabled={current === 0} onClick={() => setCurrent(current - 1)}>
          ← Previous
        </Button>
        <Button variant="secondary" disabled={current === paper.questions.length - 1} onClick={() => setCurrent(current + 1)}>
          Next →
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {paper.questions.map((x, i) => (
          <button
            key={x.question_id}
            type="button"
            onClick={() => setCurrent(i)}
            className={cn(
              "h-8 w-8 rounded-md border text-sm",
              i === current ? "border-brand-600 ring-2 ring-brand-300" : "border-slate-200",
              answered(x) ? "bg-emerald-100 text-emerald-800" : "bg-white text-slate-600"
            )}
          >
            {x.number}
          </button>
        ))}
      </div>
    </div>
  );
}
