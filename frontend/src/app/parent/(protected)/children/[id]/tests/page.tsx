"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { fmt } from "@/components/online-exam/Tests";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type ChildTest = {
  id: number;
  title: string;
  subject_name: string;
  student_id: number;
  student_name: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  question_count: number;
  total_marks: string;
  state: "upcoming" | "open" | "in_progress" | "done" | "missed";
  attempt_id: number | null;
  score: string | null;
  percent: number | null;
  result_visible: boolean;
};

const stateBadge = {
  upcoming: <Badge tone="brand">upcoming</Badge>,
  open: <Badge tone="emerald">open now</Badge>,
  in_progress: <Badge tone="amber">in progress</Badge>,
  done: <Badge>submitted</Badge>,
  missed: <Badge tone="rose">missed</Badge>,
};

export default function ChildTestsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [items, setItems] = useState<ChildTest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ChildTest[]>(`/api/v1/parent/me/children/${id}/tests`)
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  async function start(t: ChildTest) {
    if (t.state === "open" && !window.confirm(`Start "${t.title}" now? The ${t.duration_minutes}-minute timer starts immediately and keeps running.`)) return;
    try {
      const r = await api.post<{ attempt_id: number }>(`/api/v1/parent/me/children/${id}/tests/${t.id}/start`);
      router.push(`/parent/tests/${r.data.attempt_id}`);
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-4">
      <Link href={`/parent/children/${id}`} className="text-sm text-brand-700 hover:underline">
        ← Back
      </Link>
      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Online tests</h1>
      <p className="text-sm text-slate-500">Let your child take each test on this device while it&apos;s open. Answers save automatically.</p>
      {error && <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>}
      {items.length === 0 && !error && <p className="text-sm text-slate-500">No tests yet.</p>}
      {items.map((t) => (
        <Card key={t.id}>
          <CardBody className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{t.title}</span>
                {stateBadge[t.state]}
              </div>
              <div className="text-sm text-slate-500">
                {t.subject_name} · {t.question_count} questions · {Number(t.total_marks)} marks · {t.duration_minutes} min
              </div>
              <div className="text-xs text-slate-500">
                {fmt(t.starts_at)} to {fmt(t.ends_at)}
              </div>
            </div>
            {t.state === "done" && t.result_visible && (
              <div className="text-right">
                <div className="text-lg font-bold text-slate-900">
                  {Number(t.score)} / {Number(t.total_marks)}
                </div>
                <div className="text-xs text-slate-500">{t.percent}%</div>
              </div>
            )}
            {(t.state === "open" || t.state === "in_progress") && <Button onClick={() => start(t)}>{t.state === "open" ? "Start test" : "Continue"}</Button>}
            {t.state === "done" && t.attempt_id && (
              <Link href={`/parent/tests/${t.attempt_id}`}>
                <Button variant="secondary">{t.result_visible ? "See answers" : "View"}</Button>
              </Link>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
