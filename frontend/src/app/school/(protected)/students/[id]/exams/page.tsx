"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";
import { shortDate } from "@/lib/dates";

type SubjectRow = {
  subject_name: string;
  subject_code: string | null;
  max_marks: number;
  pass_marks: number;
  marks_obtained: number | null;
  grade: string | null;
  status: string | null;
  is_pass: boolean | null;
};
type ExamRow = {
  exam_id: number;
  exam_name: string;
  kind: string;
  start_date: string;
  subjects: SubjectRow[];
  obtained: number;
  out_of: number;
  percent: number;
  marked: number;
};
type History = {
  student_id: number;
  admission_no: string;
  full_name: string;
  class_name: string | null;
  section_name: string | null;
  exams: ExamRow[];
};

export default function StudentExamsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<History>(`/api/v1/school/student-detail/${id}/exams`)
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  const exams = data?.exams ?? [];

  return (
    <div className="space-y-6">
      <Link
        href={`/school/students/${id}`}
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to the child
      </Link>

      <PageHeader
        title={data ? `${data.full_name} — results` : "Results"}
        subtitle="Every published exam this child sat, newest first."
      />
      <ErrorBox>{error}</ErrorBox>

      {exams.length === 0 && !error && (
        <Card>
          <CardBody className="text-[13px] text-ink-subtle">
            No results have been published for this child&apos;s class yet.
          </CardBody>
        </Card>
      )}

      {exams.map((e) => (
        <Card key={e.exam_id}>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>{e.exam_name}</CardTitle>
              <p className="mt-1 text-[13px] text-ink-muted">
                {humanize(e.kind)} · {shortDate(e.start_date)}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[19px] font-extrabold text-ink">
                {e.obtained} <span className="text-ink-subtle">/ {e.out_of}</span>
              </div>
              <div className="text-[12px] font-bold text-ink-muted">{e.percent}%</div>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <Table head={["Subject", "Out of", "Marks", "Grade", "Result"]}>
              {e.subjects.map((s, i) => (
                <tr key={i}>
                  <td className={tdStrong}>
                    {s.subject_name}
                    {s.subject_code && (
                      <span className="block font-mono text-[11px] font-normal text-ink-subtle">
                        {s.subject_code}
                      </span>
                    )}
                  </td>
                  <td className={td}>{s.max_marks}</td>
                  <td className={td}>
                    {/* A blank mark and a nought are different facts about a
                        child, and only one of them is about how they did. */}
                    {s.marks_obtained === null ? (
                      <span className="text-ink-subtle">
                        {s.status && s.status !== "scored" ? humanize(s.status) : "Not marked"}
                      </span>
                    ) : (
                      s.marks_obtained
                    )}
                  </td>
                  <td className={td}>{s.grade ?? "—"}</td>
                  <td className={td}>
                    {s.is_pass === null ? (
                      "—"
                    ) : s.is_pass ? (
                      <Badge tone="emerald">Passed</Badge>
                    ) : (
                      <Badge tone="rose">Failed</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
