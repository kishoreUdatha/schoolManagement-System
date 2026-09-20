"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type Subject = {
  exam_paper_id: number;
  subject_name: string;
  subject_code: string;
  max_marks: number;
  pass_marks: number;
  exam_date: string;
  status: "scored" | "absent" | "exempt" | null;
  marks_obtained: number | null;
  grade: string | null;
  is_pass: boolean | null;
  remark: string | null;
};

type Result = {
  exam_id: number;
  exam_name: string;
  exam_kind: string;
  start_date: string;
  end_date: string;
  published_at: string | null;
  student_name: string;
  student_admission_no: string;
  student_roll_no: number;
  class_name: string | null;
  section_name: string | null;
  subjects: Subject[];
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

export default function ChildExamDetailPage() {
  const params = useParams<{ id: string; examId: string }>();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api
      .get<Result>(
        `/api/v1/parent/me/children/${params.id}/exams/${params.examId}`,
      )
      .then((r) => setResult(r.data))
      .catch((e) => setError(apiError(e)));
  }, [params.id, params.examId]);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await api.get<Blob>(
        `/api/v1/parent/me/children/${params.id}/exams/${params.examId}/report-card.pdf`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-card-${result?.student_admission_no}-${result?.exam_name.replace(/ /g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setDownloading(false);
    }
  }

  if (error)
    return (
      <div className="space-y-4">
        <Link
          href={`/parent/children/${params.id}/exams`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back
        </Link>
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      </div>
    );
  if (!result) return <div className="text-sm text-slate-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <Link
        href={`/parent/children/${params.id}/exams`}
        className="text-sm text-brand-700 hover:underline"
      >
        ← Back to exams
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">
            {result.exam_name}
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            {result.student_name} · {result.class_name} {result.section_name} ·
            Roll {result.student_roll_no}
          </p>
        </div>
        <button
          onClick={downloadPdf}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
        >
          {downloading ? "Generating…" : "Download report card PDF"}
        </button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="Percentage"
              value={`${result.summary.percentage}%`}
              big
            />
            <Stat label="Overall grade" value={result.summary.overall_grade} big />
            <Stat
              label="Total"
              value={`${result.summary.total_obtained} / ${result.summary.total_max}`}
            />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">Result</div>
              <Badge tone={result.summary.is_pass ? "emerald" : "rose"}>
                {result.summary.is_pass ? "PASS" : "FAIL"}
              </Badge>
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            {result.summary.subjects_passed} passed ·{" "}
            {result.summary.subjects_failed} failed ·{" "}
            {result.summary.subjects_absent} absent ·{" "}
            {result.summary.subjects_exempt} exempt ·{" "}
            {result.summary.subjects_pending} not graded yet
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subject-wise marks</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-surface-border text-[13px]">
            <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
              <tr>
                <th className="px-4 py-3 font-bold">Subject</th>
                <th className="px-4 py-3 font-bold">Exam date</th>
                <th className="px-4 py-3 text-right font-medium">Max</th>
                <th className="px-4 py-3 text-right font-medium">Obtained</th>
                <th className="px-4 py-3 text-center font-medium">Grade</th>
                <th className="px-4 py-3 text-center font-medium">Pass/Fail</th>
                <th className="px-4 py-3 font-bold">Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.subjects.map((s) => {
                let obtained = "—";
                if (s.status === "absent") obtained = "Absent";
                else if (s.status === "exempt") obtained = "Exempt";
                else if (s.marks_obtained != null) obtained = String(s.marks_obtained);
                return (
                  <tr key={s.exam_paper_id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {s.subject_name}{" "}
                      <span className="text-xs text-slate-500">
                        ({s.subject_code})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.exam_date}</td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {s.max_marks}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {obtained}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.grade ? (
                        <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                          {s.grade}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.is_pass === true && <Badge tone="emerald">Pass</Badge>}
                      {s.is_pass === false && <Badge tone="rose">Fail</Badge>}
                      {s.is_pass === null && (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.remark || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  big = false,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">{label}</div>
      <div
        className={
          big
            ? "text-3xl font-bold text-slate-900"
            : "text-lg font-semibold text-slate-900"
        }
      >
        {value}
      </div>
    </div>
  );
}
