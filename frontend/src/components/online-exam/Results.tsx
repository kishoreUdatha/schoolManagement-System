"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fmt } from "@/components/online-exam/Tests";
import { bloomTone, cap, formatAnswer, kindLabel, type AttemptResult, type Bloom, type Kind, type TestRead } from "@/components/online-exam/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Row = {
  student_id: number;
  student_name: string;
  section_label: string;
  attempt_id: number | null;
  status: "in_progress" | "submitted" | "graded" | null;
  started_at: string | null;
  submitted_at: string | null;
  auto_submitted: boolean;
  score: string | null;
  max_score: string | null;
  percent: number | null;
  pending_grading: number;
};
type QStat = { question_id: number; sequence: number; text: string; kind: Kind; bloom_level: Bloom; answered: number; correct: number; percent_correct: number | null; avg_marks: string | null };
type Results = {
  test: TestRead;
  eligible: number;
  attempted: number;
  average_percent: number | null;
  highest: string | null;
  lowest: string | null;
  rows: Row[];
  questions: QStat[];
  blooms: { bloom_level: Bloom; max_marks: string; avg_percent: number | null }[];
};

/** One attempt's answers with correctness; `onGrade` enables marking short answers. */
export function AttemptReview({ r, onGrade }: { r: AttemptResult; onGrade?: (qid: number, marks: string, comment: string) => void }) {
  return (
    <div className="space-y-3">
      {(r.questions ?? []).map((q) => {
        const tone = q.marks_awarded === null ? "border-amber-500/50" : q.is_correct ? "border-emerald-500/50" : "border-rose-500/40";
        return (
          <div key={q.question_id} className={cn("rounded-md border p-3 text-sm", tone)}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
              <span className="font-semibold text-ink">Q{q.number}</span>
              <span className={cn("h-2 w-2 rounded-full", bloomTone[q.bloom_level])} />
              {cap(q.bloom_level)} · {kindLabel(q.kind)}
              <span className="ml-auto font-medium text-ink">
                {q.marks_awarded === null ? "to be marked" : `${Number(q.marks_awarded)} / ${Number(q.marks)}`}
              </span>
            </div>
            <div className="mt-1 whitespace-pre-line text-ink">{q.text}</div>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              <div>
                <span className="text-xs text-ink-subtle">Answer given: </span>
                <span className={q.is_correct ? "text-emerald-500" : q.marks_awarded === null ? "text-ink" : "text-rose-400"}>{formatAnswer(q, q.response)}</span>
              </div>
              <div>
                <span className="text-xs text-ink-subtle">{q.kind === "short" ? "Model answer: " : "Correct: "}</span>
                <span className="text-emerald-500">{formatAnswer(q, q.correct)}</span>
              </div>
            </div>
            {q.explanation && <div className="mt-1 text-xs text-ink-muted">Why: {q.explanation}</div>}
            {q.teacher_comment && <div className="mt-1 rounded bg-surface-subtle p-2 text-xs text-ink">Teacher: {q.teacher_comment}</div>}
            {onGrade && q.kind === "short" && (
              <GradeBox max={q.marks} current={q.marks_awarded} comment={q.teacher_comment} onSave={(m, c) => onGrade(q.question_id, m, c)} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function GradeBox({ max, current, comment, onSave }: { max: string; current: string | null; comment: string | null; onSave: (m: string, c: string) => void }) {
  const [m, setM] = useState(current ? String(Number(current)) : "");
  const [c, setC] = useState(comment ?? "");
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <div className="w-28">
        <Input label={`Marks (of ${Number(max)})`} type="number" min={0} max={Number(max)} step={0.25} value={m} onChange={(e) => setM(e.target.value)} />
      </div>
      <div className="min-w-48 flex-1">
        <Input label="Comment" value={c} onChange={(e) => setC(e.target.value)} />
      </div>
      <Button size="sm" disabled={m === ""} onClick={() => onSave(m, c)}>
        Save mark
      </Button>
    </div>
  );
}

export function TestResults({ testId, base }: { testId: string; base: string }) {
  const [d, setD] = useState<Results | null>(null);
  const [open, setOpen] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .get<Results>(`/api/v1/school/online-tests/${testId}/results`)
      .then((r) => setD(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  async function view(aid: number) {
    try {
      const r = await api.get<AttemptResult>(`/api/v1/school/test-attempts/${aid}`);
      setOpen(r.data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function grade(qid: number, marks: string, comment: string) {
    if (!open) return;
    try {
      const r = await api.put<AttemptResult>(`/api/v1/school/test-attempts/${open.attempt_id}/answers/${qid}/grade`, { marks, comment: comment.trim() || null });
      setOpen(r.data);
      setError(null);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  if (!d) return <ErrorBox>{error}</ErrorBox>;
  const pending = d.rows.reduce((a, r) => a + r.pending_grading, 0);

  return (
    <div className="space-y-6">
      <Link href={`${base}/${testId}`} className="text-sm text-brand-500 hover:underline">
        ← Back to the test
      </Link>
      <PageHeader title={`Results: ${d.test.title}`} subtitle={`${d.test.class_name} · ${d.test.subject_name} · ${d.test.audience_label}`} />
      <ErrorBox>{error}</ErrorBox>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Attempted", `${d.attempted} / ${d.eligible}`],
          ["Average", d.average_percent === null ? "—" : `${d.average_percent}%`],
          ["Highest", d.highest === null ? "—" : `${Number(d.highest)} / ${Number(d.test.total_marks)}`],
          ["To mark", String(pending)],
        ].map(([k, v]) => (
          <Card key={k}>
            <CardBody className="py-3">
              <div className="text-xs text-ink-subtle">{k}</div>
              <div className="text-xl font-semibold text-ink">{v}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By Bloom&apos;s level</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          {d.blooms.map((b) => (
            <div key={b.bloom_level} className="flex items-center gap-3 text-sm">
              <span className="w-24 text-ink">{cap(b.bloom_level)}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-subtle">
                <div className={cn("h-full", bloomTone[b.bloom_level])} style={{ width: `${b.avg_percent ?? 0}%` }} />
              </div>
              <span className="w-28 text-right text-ink-muted">
                {b.avg_percent === null ? "—" : `${b.avg_percent}%`} of {Number(b.max_marks)}
              </span>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Students</CardTitle>
        </CardHeader>
        <Table head={["Student", "Section", "Status", "Score", "Submitted", ""]} empty={d.rows.length === 0 && "No students."}>
          {d.rows.map((r) => (
            <tr key={r.student_id}>
              <td className={tdStrong}>{r.student_name}</td>
              <td className={td}>{r.section_label}</td>
              <td className={td}>
                {!r.status ? (
                  <Badge>not attempted</Badge>
                ) : r.status === "in_progress" ? (
                  <Badge tone="brand">writing</Badge>
                ) : r.pending_grading ? (
                  <Badge tone="amber">{r.pending_grading} to mark</Badge>
                ) : (
                  <Badge tone="emerald">marked</Badge>
                )}
                {r.auto_submitted && <div className="text-xs text-ink-subtle">time ran out</div>}
              </td>
              <td className={td}>{r.score === null ? "—" : `${Number(r.score)} / ${Number(r.max_score)} (${r.percent}%)`}</td>
              <td className={td}>{r.submitted_at ? fmt(r.submitted_at) : "—"}</td>
              <td className="px-3 py-2 text-right">
                {r.attempt_id && r.status !== "in_progress" && (
                  <Button size="sm" variant="secondary" onClick={() => view(r.attempt_id!)}>
                    {r.pending_grading ? "Mark" : "View"}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By question</CardTitle>
        </CardHeader>
        <Table head={["#", "Question", "Bloom", "Answered", "Correct"]} empty={false}>
          {d.questions.map((q) => (
            <tr key={q.question_id}>
              <td className={td}>{q.sequence}</td>
              <td className={cn(td, "max-w-md truncate")}>{q.text}</td>
              <td className={td}>{cap(q.bloom_level)}</td>
              <td className={td}>{q.answered}</td>
              <td className={td}>
                {q.percent_correct === null ? "—" : (
                  <span className={q.percent_correct < 40 ? "text-rose-400" : q.percent_correct < 70 ? "text-amber-500" : "text-emerald-500"}>{q.percent_correct}%</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.student_name}: ${Number(open.score ?? 0)} / ${Number(open.max_score ?? 0)}` : ""} size="lg">
        {open && (
          <div className="max-h-[70vh] overflow-auto">
            <AttemptReview r={open} onGrade={d.test.can_edit ? grade : undefined} />
          </div>
        )}
      </Modal>
    </div>
  );
}
