"use client";

import { useEffect, useState } from "react";

import { QuestionForm, type SubjectOption } from "@/components/online-exam/QuestionForm";
import { BLOOMS, bloomTone, cap, formatAnswer, kindLabel, KINDS, type Question } from "@/components/online-exam/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type CsRow = {
  class_subject_id: number;
  class_name: string;
  subject_id: number;
  subject_name: string;
  can_edit: boolean;
  sections: { section_id: number; section_label: string }[];
};

/** Subjects the user can see (and write for), with class names, from the syllabus list. */
export function useSubjects() {
  const [rows, setRows] = useState<CsRow[]>([]);
  useEffect(() => {
    api
      .get<CsRow[]>("/api/v1/school/syllabus")
      .then((r) => setRows(r.data))
      .catch(() => setRows([]));
  }, []);
  const build = (filter: (r: CsRow) => boolean): SubjectOption[] => {
    const m = new Map<number, SubjectOption>();
    rows.filter(filter).forEach((r) => {
      const s = m.get(r.subject_id) ?? { id: r.subject_id, name: r.subject_name, classes: [] };
      if (!s.classes.includes(r.class_name)) s.classes.push(r.class_name);
      m.set(r.subject_id, s);
    });
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  };
  return { all: build(() => true), writable: build((r) => r.can_edit), classSubjects: rows };
}

type Page = { total: number; items: Question[]; by_bloom: Record<string, number> };

export function QuestionBank() {
  const { all, writable } = useSubjects();
  const [f, setF] = useState({ subject_id: "", bloom_level: "", difficulty: "", kind: "", search: "", include_inactive: false });
  const [page, setPage] = useState<Page | null>(null);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Question | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const LIMIT = 50;

  const load = () => {
    const params: Record<string, string | number | boolean> = { limit: LIMIT, offset };
    Object.entries(f).forEach(([k, v]) => {
      if (v !== "" && v !== false) params[k] = v;
    });
    api
      .get<Page>("/api/v1/school/questions", { params })
      .then((r) => setPage(r.data))
      .catch((e) => setError(apiError(e)));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, offset]);

  const canWrite = (q: Question) => writable.some((s) => s.id === q.subject_id);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setOffset(0);
    setF({ ...f, [k]: e.target.value });
  };

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      setNotice(done);
      setError(null);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  const total = page ? Object.values(page.by_bloom).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Select label="Subject" value={f.subject_id} onChange={set("subject_id")}>
            <option value="">All</option>
            {all.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-36">
          <Select label="Bloom's level" value={f.bloom_level} onChange={set("bloom_level")}>
            <option value="">All</option>
            {BLOOMS.map((b) => (
              <option key={b} value={b}>
                {cap(b)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-32">
          <Select label="Difficulty" value={f.difficulty} onChange={set("difficulty")}>
            <option value="">All</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </Select>
        </div>
        <div className="w-52">
          <Select label="Type" value={f.kind} onChange={set("kind")}>
            <option value="">All</option>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </div>
        <Input label="Search" value={f.search} onChange={set("search")} placeholder="Text or topic" />
        <label className="flex items-center gap-2 pb-2 text-sm text-ink-muted">
          <input type="checkbox" checked={f.include_inactive} onChange={(e) => setF({ ...f, include_inactive: e.target.checked })} />
          Show inactive
        </label>
        {writable.length > 0 && (
          <Button
            className="ml-auto"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New question
          </Button>
        )}
      </div>

      {page && total > 0 && (
        <div>
          <div className="flex h-3 overflow-hidden rounded-full">
            {BLOOMS.filter((b) => page.by_bloom[b]).map((b) => (
              <div key={b} className={bloomTone[b]} style={{ width: `${(100 * page.by_bloom[b]) / total}%` }} title={`${cap(b)}: ${page.by_bloom[b]}`} />
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-ink-muted">
            {BLOOMS.map((b) => (
              <span key={b} className="flex items-center gap-1">
                <span className={cn("h-2 w-2 rounded-full", bloomTone[b])} />
                {cap(b)} {page.by_bloom[b] ?? 0}
              </span>
            ))}
          </div>
        </div>
      )}

      {page?.items.length === 0 && <p className="text-sm text-ink-subtle">No questions match.</p>}
      <div className="space-y-2">
        {page?.items.map((q) => (
          <Card key={q.id} className={q.is_active ? "" : "opacity-60"}>
            <CardBody className="space-y-2 py-3">
              <button type="button" className="w-full text-left" onClick={() => setOpenId(openId === q.id ? null : q.id)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", bloomTone[q.bloom_level])} />
                  <Badge>{cap(q.bloom_level)}</Badge>
                  <Badge tone={q.difficulty === "hard" ? "rose" : q.difficulty === "medium" ? "amber" : "emerald"}>{q.difficulty}</Badge>
                  <span className="text-xs text-ink-subtle">
                    {q.subject_name}
                    {q.class_level && ` · ${q.class_level}`}
                    {q.topic && ` · ${q.topic}`} · {kindLabel(q.kind)} · {Number(q.marks)} mark{Number(q.marks) === 1 ? "" : "s"}
                    {q.used_in_tests > 0 && ` · in ${q.used_in_tests} test(s)`}
                  </span>
                  {!q.is_active && <Badge tone="rose">inactive</Badge>}
                </div>
                <div className="mt-1 whitespace-pre-line text-sm text-ink">{q.text}</div>
              </button>
              {openId === q.id && (
                <div className="space-y-1 text-sm">
                  {q.options.length > 0 && (
                    <ul className="pl-2">
                      {q.options.map((o) => (
                        <li key={o.key} className={(q.answer.keys ?? []).includes(o.key) ? "font-medium text-success" : "text-ink-muted"}>
                          {o.key}. {o.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  {q.kind !== "single" && q.kind !== "multiple" && (
                    <div className="text-success">Answer: {formatAnswer(q, q.answer)}{q.answer.tolerance ? ` (± ${q.answer.tolerance})` : ""}</div>
                  )}
                  {q.explanation && <div className="text-ink-muted">Why: {q.explanation}</div>}
                  {canWrite(q) && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditing(q);
                          setFormOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          run(() => api.post(`/api/v1/school/questions/${q.id}/active`, null, { params: { active: !q.is_active } }), q.is_active ? "Deactivated." : "Activated.")
                        }
                      >
                        {q.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      {q.used_in_tests === 0 && (
                        <Button size="sm" variant="ghost" onClick={() => window.confirm("Delete this question?") && run(() => api.delete(`/api/v1/school/questions/${q.id}`), "Deleted.")}>
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
      {page && page.total > LIMIT && (
        <div className="flex items-center justify-between text-sm text-ink-muted">
          <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
            ← Previous
          </Button>
          {offset + 1}–{Math.min(offset + LIMIT, page.total)} of {page.total}
          <Button size="sm" variant="secondary" disabled={offset + LIMIT >= page.total} onClick={() => setOffset(offset + LIMIT)}>
            Next →
          </Button>
        </div>
      )}
      <QuestionForm
        open={formOpen}
        question={editing}
        subjects={writable}
        defaultSubject={f.subject_id}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setNotice(editing ? "Question updated." : "Question added.");
          load();
        }}
      />
    </div>
  );
}
