"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type ExamSummary = {
  exam_id: number;
  exam_name: string;
  exam_kind: string;
  start_date: string;
  end_date: string;
  published_at: string | null;
  summary: {
    total_max: number;
    total_obtained: number;
    percentage: number;
    overall_grade: string;
    is_pass: boolean;
    subjects_total: number;
    subjects_passed: number;
    subjects_failed: number;
    subjects_absent: number;
    subjects_exempt: number;
    subjects_pending: number;
  };
};

export default function ChildExamsPage() {
  const params = useParams<{ id: string }>();
  const [items, setItems] = useState<ExamSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ExamSummary[]>(`/api/v1/parent/me/children/${params.id}/exams`)
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, [params.id]);

  if (error)
    return (
      <div className="space-y-4">
        <Link
          href={`/parent/children/${params.id}`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back
        </Link>
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      </div>
    );
  if (!items) return <div className="text-sm text-slate-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/parent/children/${params.id}`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back to child
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold text-slate-900">Exam results</h1>
        <p className="text-sm text-slate-500">
          Only published exams are visible. Tap one for the detailed mark sheet.
        </p>
      </header>

      {items.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-slate-500">
            No published exam results yet. They will appear here once the school
            publishes them.
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((e) => (
            <Link
              key={e.exam_id}
              href={`/parent/children/${params.id}/exams/${e.exam_id}`}
              className="block"
            >
              <Card className="transition hover:border-brand-300 hover:shadow-sm">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>{e.exam_name}</CardTitle>
                    <Badge tone={e.summary.is_pass ? "emerald" : "rose"}>
                      {e.summary.is_pass ? "PASS" : "FAIL"}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {e.exam_kind.replace(/_/g, " ")} · {e.start_date} → {e.end_date}
                  </div>
                </CardHeader>
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-bold text-slate-900">
                        {e.summary.percentage}%
                      </div>
                      <div className="text-xs text-slate-500">
                        {e.summary.total_obtained} / {e.summary.total_max}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-semibold text-brand-700">
                        {e.summary.overall_grade}
                      </div>
                      <div className="text-xs text-slate-500">
                        {e.summary.subjects_passed} / {e.summary.subjects_total}{" "}
                        subjects passed
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
