"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, FileText } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, Table, WarnBox, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { readableDate, shortDate } from "@/lib/dates";
import { openAuthed } from "@/lib/download";

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
  result_status: string;
  parent_note: string | null;
  rank: number | null;
  class_size: number | null;
};

export default function StudentExamResultPage() {
  const { examId } = useParams<{ examId: string }>();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Result>(`/api/v1/student/exams/${examId}`)
      .then((r) => setResult(r.data))
      .catch((e) => setError(apiError(e)));
  }, [examId]);

  // A held result arrives with no subjects at all. Everything below has to
  // cope with that without drawing an empty table or a row of noughts.
  const held = result !== null && result.result_status !== "normal";

  async function downloadCard() {
    if (!result) return;
    setBusy(true);
    try {
      await openAuthed(
        `/api/v1/student/exams/${examId}/report-card.pdf`,
        `report-card-${result.exam_name.replace(/ /g, "_")}.pdf`
      );
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/student/exams"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        All results
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-1px] text-ink">
            {result?.exam_name ?? "Result"}
          </h1>
          {result && (
            <p className="mt-1 text-[13px] text-ink-muted">
              {readableDate(result.start_date)} to {readableDate(result.end_date)}
              {result.class_name && ` · ${result.class_name} ${result.section_name ?? ""}`}
            </p>
          )}
        </div>
        {result && !held && (
          <Button variant="secondary" onClick={downloadCard} loading={busy}>
            <FileText className="mr-1.5 h-4 w-4" />
            Report card
          </Button>
        )}
      </div>

      <ErrorBox>{error}</ErrorBox>

      {held && (
        <WarnBox>
          Your school is holding this result for now, so the marks are not shown
          here. {result?.parent_note ?? "Please speak to the school office."}
        </WarnBox>
      )}

      {result && !held && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Percentage" value={`${result.summary.percentage}%`} />
            <StatCard label="Grade" value={result.summary.overall_grade} />
            <StatCard
              label="Total"
              value={`${result.summary.total_obtained} / ${result.summary.total_max}`}
            />
            <StatCard
              label="Result"
              value={result.summary.is_pass ? "Pass" : "Not passed"}
              accent={result.summary.is_pass ? "emerald" : "rose"}
              hint={
                result.rank && result.class_size
                  ? `${result.rank} of ${result.class_size} in your class`
                  : undefined
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Subject by subject</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <Table
                head={["Subject", "Date", "Out of", "You got", "Grade", "", "Remark"]}
                empty={
                  result.subjects.length === 0 &&
                  "No subjects have been marked for this exam yet."
                }
              >
                {result.subjects.map((s) => {
                  let got = "—";
                  if (s.status === "absent") got = "Away";
                  else if (s.status === "exempt") got = "Not taken";
                  else if (s.marks_obtained !== null) got = String(s.marks_obtained);
                  return (
                    <tr key={s.exam_paper_id}>
                      <td className={tdStrong}>
                        {s.subject_name}
                        <span className="block text-[11px] font-normal text-ink-subtle">
                          {s.subject_code}
                        </span>
                      </td>
                      <td className={td}>{shortDate(s.exam_date)}</td>
                      <td className={td}>{s.max_marks}</td>
                      <td className={tdStrong}>{got}</td>
                      <td className={td}>{s.grade ?? "—"}</td>
                      <td className={td}>
                        {s.is_pass === true && <Badge tone="emerald">Pass</Badge>}
                        {s.is_pass === false && <Badge tone="rose">Not passed</Badge>}
                        {s.is_pass === null && <span className="text-ink-subtle">—</span>}
                      </td>
                      <td className={td}>{s.remark ?? "—"}</td>
                    </tr>
                  );
                })}
              </Table>
            </CardBody>
          </Card>

          <p className="text-[12px] text-ink-subtle">
            {result.summary.subjects_passed} passed ·{" "}
            {result.summary.subjects_failed} not passed ·{" "}
            {result.summary.subjects_absent} away ·{" "}
            {result.summary.subjects_pending} not marked yet
          </p>
        </>
      )}
    </div>
  );
}
