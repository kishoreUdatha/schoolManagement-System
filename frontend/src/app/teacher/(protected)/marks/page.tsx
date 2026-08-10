"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type Paper = {
  exam_paper_id: number;
  exam_id: number;
  exam_name: string;
  exam_kind: string;
  exam_is_published: boolean;
  subject_name: string;
  subject_code: string;
  class_id: number;
  class_name: string;
  exam_date: string;
  max_marks: number;
  pass_marks: number;
  duration_minutes: number | null;
  section_count: number;
  students_in_class: number;
  marks_entered: number;
};

export default function MyMarksPapersPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Paper[]>("/api/v1/teacher/marks/papers")
      .then((r) => setPapers(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Marks entry</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every exam paper you&apos;re responsible for. Click a paper to enter
          marks. Once the school admin publishes the exam, marks lock.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {papers.length === 0 && !error && (
        <Card className="p-8 text-center text-slate-500">
          You don&apos;t have any exam papers assigned. The school admin
          schedules these in <em>Exams</em>.
        </Card>
      )}

      <div className="space-y-3">
        {papers.map((p) => {
          const total = p.students_in_class;
          const pct = total > 0 ? Math.round((p.marks_entered / total) * 100) : 0;
          return (
            <Card key={p.exam_paper_id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">
                      {p.exam_name} — {p.subject_name}
                    </h3>
                    <Badge tone="brand">{p.subject_code}</Badge>
                    {p.exam_is_published ? (
                      <Badge tone="emerald">published (locked)</Badge>
                    ) : pct === 100 ? (
                      <Badge tone="emerald">all entered</Badge>
                    ) : pct > 0 ? (
                      <Badge tone="amber">partial</Badge>
                    ) : (
                      <Badge tone="neutral">pending</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {p.class_name} · {p.exam_date} · max {p.max_marks} · pass{" "}
                    {p.pass_marks}
                    {p.duration_minutes && <> · {p.duration_minutes} min</>}
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    {p.marks_entered}/{total} students marked
                    <span className="ml-2 text-slate-400">({p.section_count} section{p.section_count === 1 ? "" : "s"})</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <Link
                  href={`/teacher/marks/papers/${p.exam_paper_id}?class_id=${p.class_id}`}
                  className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  {p.exam_is_published ? "View" : "Enter marks"}
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
