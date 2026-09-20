"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";

type Subject = {
  class_subject_id: number;
  subject_name: string;
  subject_code: string | null;
  kind: string | null;
  teacher_name: string | null;
};
type Enrolment = {
  enrollment_id: number;
  academic_year_name: string | null;
  class_name: string | null;
  section_name: string | null;
  roll_no: number | null;
  outcome: string | null;
};
type Academic = {
  student_id: number;
  admission_no: string;
  full_name: string;
  roll_no: number | null;
  class_name: string | null;
  section_name: string | null;
  is_active: boolean;
  photo_url: string | null;
  subjects: Subject[];
  history: Enrolment[];
};

/** An outcome is a fact about a year, not a judgement: "repeated" is amber
 *  because it changes what happens next, not because it is bad news. */
const OUTCOME: Record<string, "emerald" | "amber" | "neutral" | "brand"> = {
  promoted: "emerald",
  repeated: "amber",
  left: "neutral",
  studying: "brand",
};

export default function StudentAcademicPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Academic | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Academic>(`/api/v1/school/student-detail/${id}/academic`)
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  const subjects = data?.subjects ?? [];
  const history = data?.history ?? [];

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
        title={data ? data.full_name : "Academic details"}
        subtitle={
          data
            ? `${data.admission_no} · ${data.class_name ?? "No class"} ${data.section_name ?? ""}`.trim()
            : "What this child studies, and the years behind them."
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <Card>
        <CardHeader>
          <CardTitle>Subjects this year</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Subject", "Code", "Kind", "Taught by"]}
            empty={subjects.length === 0 && "No subjects have been set up for this class yet."}
          >
            {subjects.map((s) => (
              <tr key={s.class_subject_id}>
                <td className={tdStrong}>{s.subject_name}</td>
                <td className={td}>
                  {s.subject_code ? (
                    <span className="font-mono text-[12px]">{s.subject_code}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={td}>{humanize(s.kind)}</td>
                <td className={td}>
                  {s.teacher_name ?? <span className="text-ink-subtle">Not assigned</span>}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Year by year</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Year", "Class", "Section", "Roll", "Outcome"]}
            empty={history.length === 0 && "No enrolment history has been recorded yet."}
          >
            {history.map((h) => (
              <tr key={h.enrollment_id}>
                <td className={tdStrong}>{h.academic_year_name ?? "—"}</td>
                <td className={td}>{h.class_name ?? "—"}</td>
                <td className={td}>{h.section_name ?? "—"}</td>
                <td className={td}>{h.roll_no ?? "—"}</td>
                <td className={td}>
                  {h.outcome ? (
                    <Badge tone={OUTCOME[h.outcome] ?? "neutral"}>{humanize(h.outcome)}</Badge>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
