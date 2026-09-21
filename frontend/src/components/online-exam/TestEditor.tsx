"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { TestForm, fmt, statusBadge } from "@/components/online-exam/Tests";
import { BLOOMS, bloomTone, cap, formatAnswer, kindLabel, type Bloom, type Question, type TestDetail } from "@/components/online-exam/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function BloomBar({ mix }: { mix: Partial<Record<Bloom, string | number>> }) {
  const total = BLOOMS.reduce((a, b) => a + Number(mix[b] ?? 0), 0);
  if (!total) return null;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {BLOOMS.filter((b) => Number(mix[b] ?? 0) > 0).map((b) => (
          <div key={b} className={bloomTone[b]} style={{ width: `${(100 * Number(mix[b])) / total}%` }} />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-muted">
        {BLOOMS.filter((b) => Number(mix[b] ?? 0) > 0).map((b) => (
          <span key={b} className="flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-full", bloomTone[b])} />
            {cap(b)} {Math.round((100 * Number(mix[b])) / total)}%
          </span>
        ))}
      </div>
    </div>
  );
}

type Rule = { bloom_level: string; difficulty: string; count: string };

export function TestEditor({ testId, base }: { testId: string; base: string }) {
  const router = useRouter();
  const url = `/api/v1/school/online-tests/${testId}`;
  const [t, setT] = useState<TestDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState(false);
  const [bank, setBank] = useState<Question[]>([]);
  const [bankFilter, setBankFilter] = useState({ bloom_level: "", difficulty: "", search: "" });
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api
      .get<TestDetail>(url)
      .then((r) => setT(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  useEffect(() => {
    if (!picker || !t) return;
    const params: Record<string, string | number> = { limit: 200 };
    Object.entries(bankFilter).forEach(([k, v]) => v && (params[k] = v));
    api
      .get<{ items: Question[] }>("/api/v1/school/questions", {
        params: { ...params, subject_id: t.subject_id },
      })
      .then((r) => setBank(r.data.items))
      .catch((e) => setError(apiError(e)));
  }, [picker, bankFilter, t]);

  async function run(fn: () => Promise<{ data: TestDetail } | unknown>, done?: string) {
    try {
      const r = (await fn()) as { data?: TestDetail } | undefined;
      if (r && r.data && (r.data as TestDetail).questions) setT(r.data as TestDetail);
      else await load();
      setError(null);
      if (done) setNotice(done);
      return true;
    } catch (e) {
      setError(apiError(e));
      return false;
    }
  }

  if (!t) return <ErrorBox>{error}</ErrorBox>;
  const draft = t.status === "draft" && t.can_edit;
  const inTest = new Set(t.questions.map((q) => q.id));
  const bankForSubject = bank.filter((q) => !inTest.has(q.id));

  const move = (i: number, d: -1 | 1) => {
    const ids = t.questions.map((q) => q.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    run(() => api.put(`${url}/question-order`, { question_ids: ids }));
  };

  return (
    <div className="space-y-6">
      <Link href={base} className="text-sm text-brand-500 hover:underline">
        ← All tests
      </Link>
      <PageHeader
        title={t.title}
        subtitle={`${t.class_name} · ${t.subject_name} · ${t.audience_label} · ${t.duration_minutes} min · ${fmt(t.starts_at)} to ${fmt(t.ends_at)}`}
        actions={
          <>
            {t.attempts > 0 && (
              <Link href={`${base}/${t.id}/results`}>
                <Button variant="secondary">Results ({t.attempts})</Button>
              </Link>
            )}
            {draft && (
              <Button onClick={() => window.confirm("Publish? Parents will be notified and the paper is locked.") && run(() => api.post(`${url}/publish`), "Published. Parents were notified.")}>
                Publish
              </Button>
            )}
            {t.can_edit && t.status === "published" && (
              <Button variant="secondary" onClick={() => window.confirm("Close now? Anyone still writing is submitted.") && run(() => api.post(`${url}/close`), "Test closed.")}>
                Close now
              </Button>
            )}
            {t.can_edit && t.status !== "closed" && t.attempts === 0 && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {t.can_edit && t.attempts === 0 && (
              <Button
                variant="ghost"
                onClick={async () => {
                  if (window.confirm("Delete this test?") && (await run(() => api.delete(url)))) router.push(base);
                }}
              >
                Delete
              </Button>
            )}
          </>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      <div className="flex flex-wrap items-center gap-2">
        {statusBadge(t)}
        <Badge>{t.question_count} questions</Badge>
        <Badge>{Number(t.total_marks)} marks</Badge>
        {Number(t.negative_marking) > 0 && <Badge tone="rose">−{Number(t.negative_marking)} × marks per wrong answer</Badge>}
        <Badge>results {t.result_visibility === "on_submit" ? "right after submitting" : t.result_visibility === "after_close" ? "after close" : "hidden"}</Badge>
      </div>
      {t.instructions && <p className="whitespace-pre-line text-sm text-ink-muted">{t.instructions}</p>}
      <BloomBar mix={t.by_bloom} />

      {draft && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setChosen(new Set());
              setPicker(true);
            }}
          >
            Add from question bank
          </Button>
          <Button variant="secondary" onClick={() => setRules([{ bloom_level: "remember", difficulty: "", count: "5" }])}>
            Auto-pick by Bloom&apos;s level
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Paper</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {t.questions.length === 0 && <p className="text-sm text-ink-subtle">No questions yet.</p>}
          {t.questions.map((q, i) => (
            <div key={q.id} className="rounded-md border border-surface-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">Q{i + 1}.</span>
                <span className={cn("h-2 w-2 rounded-full", bloomTone[q.bloom_level])} />
                <span className="text-xs text-ink-subtle">
                  {cap(q.bloom_level)} · {q.difficulty} · {kindLabel(q.kind)} · {Number(q.test_marks)} marks
                </span>
                {draft && (
                  <span className="ml-auto flex gap-2 text-xs">
                    <button type="button" disabled={i === 0} className="text-ink-subtle disabled:opacity-30" onClick={() => move(i, -1)}>
                      ↑
                    </button>
                    <button type="button" disabled={i === t.questions.length - 1} className="text-ink-subtle disabled:opacity-30" onClick={() => move(i, 1)}>
                      ↓
                    </button>
                    <button type="button" className="text-danger hover:underline" onClick={() => run(() => api.delete(`${url}/questions/${q.id}`))}>
                      Remove
                    </button>
                  </span>
                )}
              </div>
              <div className="mt-1 whitespace-pre-line text-ink">{q.text}</div>
              {q.options.length > 0 && (
                <ul className="mt-1 pl-2">
                  {q.options.map((o) => (
                    <li key={o.key} className={(q.answer.keys ?? []).includes(o.key) ? "text-success" : "text-ink-muted"}>
                      {o.key}. {o.text}
                    </li>
                  ))}
                </ul>
              )}
              {(q.kind === "numeric" || q.kind === "short") && <div className="mt-1 text-success">Answer: {formatAnswer(q, q.answer)}</div>}
            </div>
          ))}
        </CardBody>
      </Card>

      <Modal open={picker} onClose={() => setPicker(false)} title={`Add ${t.subject_name} questions`} size="lg">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Select label="Bloom's level" value={bankFilter.bloom_level} onChange={(e) => setBankFilter({ ...bankFilter, bloom_level: e.target.value })}>
              <option value="">All</option>
              {BLOOMS.map((b) => (
                <option key={b} value={b}>
                  {cap(b)}
                </option>
              ))}
            </Select>
            <Select label="Difficulty" value={bankFilter.difficulty} onChange={(e) => setBankFilter({ ...bankFilter, difficulty: e.target.value })}>
              <option value="">All</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
            <Input label="Search" value={bankFilter.search} onChange={(e) => setBankFilter({ ...bankFilter, search: e.target.value })} />
          </div>
          <div className="max-h-[50vh] space-y-1 overflow-auto">
            {bankForSubject.length === 0 && <p className="text-sm text-ink-subtle">No more questions match. Add some in the question bank.</p>}
            {bankForSubject.map((q) => (
              <label key={q.id} className="flex items-start gap-2 rounded-md p-2 text-sm hover:bg-surface-subtle">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={chosen.has(q.id)}
                  onChange={(e) => {
                    const n = new Set(chosen);
                    if (e.target.checked) n.add(q.id);
                    else n.delete(q.id);
                    setChosen(n);
                  }}
                />
                <span>
                  <span className="text-ink">{q.text}</span>
                  <span className="block text-xs text-ink-subtle">
                    {cap(q.bloom_level)} · {q.difficulty} · {kindLabel(q.kind)} · {Number(q.marks)} marks
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPicker(false)}>
              Cancel
            </Button>
            <Button
              disabled={chosen.size === 0}
              onClick={async () => {
                if (await run(() => api.post(`${url}/questions`, { question_ids: Array.from(chosen) }), `${chosen.size} question(s) added.`)) setPicker(false);
              }}
            >
              Add {chosen.size || ""}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!rules} onClose={() => setRules(null)} title="Auto-pick questions" size="lg">
        {rules && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">Random questions from the bank for each row. Great for a balanced Bloom&apos;s mix.</p>
            {rules.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_6rem_auto] items-end gap-2">
                <Select label="Bloom's level" value={r.bloom_level} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, bloom_level: e.target.value } : x)))}>
                  <option value="">Any</option>
                  {BLOOMS.map((b) => (
                    <option key={b} value={b}>
                      {cap(b)}
                    </option>
                  ))}
                </Select>
                <Select label="Difficulty" value={r.difficulty} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, difficulty: e.target.value } : x)))}>
                  <option value="">Any</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </Select>
                <Input label="How many" type="number" min={1} max={100} value={r.count} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)))} />
                <Button variant="ghost" onClick={() => setRules(rules.filter((_, j) => j !== i))} disabled={rules.length === 1}>
                  ✕
                </Button>
              </div>
            ))}
            <button type="button" className="text-sm text-brand-500 hover:underline" onClick={() => setRules([...rules, { bloom_level: "understand", difficulty: "", count: "3" }])}>
              + row
            </button>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRules(null)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const body = {
                    rules: rules.map((r) => ({ bloom_level: r.bloom_level || null, difficulty: r.difficulty || null, count: Number(r.count) })),
                  };
                  if (await run(() => api.post(`${url}/auto-pick`, body), "Questions picked.")) setRules(null);
                }}
              >
                Pick
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <TestForm
        open={editing}
        test={t}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          setNotice("Test updated.");
          load();
        }}
      />
    </div>
  );
}
