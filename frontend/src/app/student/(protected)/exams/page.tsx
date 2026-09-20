"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ErrorBox, PageHeader, humanize } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";
import { readableDate } from "@/lib/dates";

type Summary = {
  total_max: number;
  total_obtained: number;
  percentage: number;
  overall_grade: string;
  is_pass: boolean;
  subjects_total: number;
  subjects_passed: number;
  subjects_failed: number;
};

type ExamRow = {
  exam_id: number;
  exam_name: string;
  exam_kind: string;
  start_date: string;
  end_date: string;
  published_at: string | null;
  summary: Summary;
  result_status: string;
  parent_note: string | null;
};

export default function StudentExamsPage() {
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get<ExamRow[]>("/api/v1/student/exams")
      .then((r) => setExams(r.data))
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Results"
        subtitle="Exams your school has finished checking and published."
      />
      <ErrorBox>{error}</ErrorBox>

      {loaded && exams.length === 0 && (
        <Card className="p-6 text-center text-[13px] text-ink-muted">
          No results have been published yet. They will appear here once your
          school is ready.
        </Card>
      )}

      <div className="space-y-3">
        {exams.map((e) => (
          <ExamCard key={e.exam_id} exam={e} />
        ))}
      </div>
    </div>
  );
}

function ExamCard({ exam }: { exam: ExamRow }) {
  // A held result comes back with an empty summary. Showing 0% would read as
  // a mark of nought, which is a different and much worse thing to be told.
  const held = exam.result_status !== "normal";

  return (
    <Link href={`/student/exams/${exam.exam_id}`}>
      <Card className="p-4 transition-colors hover:border-brand-300 hover:bg-surface-hover">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-extrabold text-ink">{exam.exam_name}</h3>
              <Badge tone="neutral">{humanize(exam.exam_kind)}</Badge>
            </div>
            <p className="mt-1 text-[12px] text-ink-muted">
              {readableDate(exam.start_date)} to {readableDate(exam.end_date)}
            </p>

            {held && exam.parent_note && (
              <p className="mt-2 text-[13px] font-medium text-warning">
                {exam.parent_note}
              </p>
            )}
          </div>

          {held ? (
            <Badge tone="amber">{humanize(exam.result_status)}</Badge>
          ) : (
            <div className="text-right">
              <div className="text-[24px] font-extrabold leading-none tracking-[-0.8px] text-ink">
                {exam.summary.percentage}%
              </div>
              <div className="mt-1 text-[11px] text-ink-subtle">
                {exam.summary.total_obtained} of {exam.summary.total_max}
              </div>
              <div className="mt-1.5">
                <Badge tone={exam.summary.is_pass ? "emerald" : "rose"}>
                  {exam.summary.overall_grade}
                </Badge>
              </div>
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
