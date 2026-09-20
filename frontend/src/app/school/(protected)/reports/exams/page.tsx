"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BreakdownChart, ChartCard, ShareChart } from "@/components/charts/Charts";
import { VERDICT } from "@/components/charts/theme";
import { ReportShell, percentTone } from "@/components/reports/ReportShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { NoticeBox, Select, Table, WarnBox, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type ExamOption = {
  id: number;
  name: string;
  academic_year_name: string | null;
  start_date: string;
  is_published: boolean;
};
type SubjectRow = {
  subject_id: number;
  subject_name: string;
  subject_code: string | null;
  max_marks: number;
  entered: number;
  passed: number;
  absent: number;
  highest: number;
  lowest: number | null;
  average: number;
  average_percent: number;
  pass_percent: number;
};
type Topper = {
  student_id: number;
  student_name: string;
  admission_no: string;
  section_label: string | null;
  obtained: number;
  max: number;
  percent: number;
};
type Analysis = {
  exam_id: number;
  exam_name: string;
  is_published: boolean;
  marks_entered: number;
  pass_percent: number;
  grades: { grade: string; count: number }[];
  subjects: SubjectRow[];
  toppers: Topper[];
  struggling: SubjectRow[];
};

/** The whole cohort's results for one exam, rather than one report card.
 *
 *  Subjects arrive weakest first, because a subject the whole year group
 *  failed is a teaching problem, and it is the only thing on this page that
 *  a head can actually do something about before the next exam.
 */
export default function ExamAnalysisPage() {
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [examId, setExamId] = useState<string>("");
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ExamOption[]>("/api/v1/school/exams")
      .then((r) => {
        setExams(r.data);
        if (r.data.length) setExamId(String(r.data[0].id));
      })
      .catch((e) => setError(apiError(e)));
  }, []);

  useEffect(() => {
    if (!examId) return;
    setData(null);
    api
      .get<Analysis>(`/api/v1/school/analytics/exams/${examId}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [examId]);

  const subjects = data?.subjects ?? [];
  const toppers = data?.toppers ?? [];
  const grades = data?.grades ?? [];

  const subjectBars = subjects.map((s) => ({
    label: s.subject_name,
    pass: s.pass_percent,
  }));

  return (
    <ReportShell
      title="Exam analysis"
      subtitle="How a whole exam went: who passed, which grades were awarded, and which subjects went wrong."
      error={error}
      actions={
        <Select
          aria-label="Exam"
          value={examId}
          onChange={(e) => setExamId(e.target.value)}
          className="min-w-[220px]"
        >
          {exams.length === 0 && <option value="">No exams yet</option>}
          {exams.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.academic_year_name ? ` — ${x.academic_year_name}` : ""}
            </option>
          ))}
        </Select>
      }
    >
      {data && !data.is_published && (
        <NoticeBox>
          This exam has not been published, so these figures are provisional and the
          families cannot see them yet.
        </NoticeBox>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Marks entered" value={data?.marks_entered ?? "—"} />
        <StatCard
          label="Pass rate"
          value={data ? `${data.pass_percent}%` : "—"}
          accent={data ? percentTone(data.pass_percent) : "brand"}
        />
        <StatCard label="Subjects" value={subjects.length || "—"} />
        <StatCard
          label="Subjects below 60%"
          value={data?.struggling.length ?? "—"}
          accent={data && data.struggling.length > 0 ? "rose" : "emerald"}
        />
      </div>

      {data && data.struggling.length > 0 && (
        <WarnBox>
          {data.struggling.map((s) => s.subject_name).join(", ")}{" "}
          {data.struggling.length === 1 ? "had" : "each had"} a pass rate under 60%. When a
          whole cohort misses a subject, the mark scheme or the teaching is usually a better
          place to look than the children.
        </WarnBox>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Pass rate by subject"
          subtitle="Weakest first. Absent candidates are excluded, not counted as failures."
          empty={subjectBars.length === 0 && "No marks have been entered for this exam."}
          height={Math.max(240, subjectBars.length * 34)}
        >
          <BreakdownChart
            data={subjectBars}
            x="label"
            layout="vertical"
            series={[{ key: "pass", name: "Pass %" }]}
            colorBy={(row) => {
              const v = Number(row.pass);
              return v >= 85 ? VERDICT.good : v >= 60 ? VERDICT.fair : VERDICT.poor;
            }}
            xFormatter={(v) => `${v}%`}
          />
        </ChartCard>

        <ChartCard
          title="Grades awarded"
          subtitle="The spread across the whole exam."
          empty={grades.length === 0 && "No grades have been awarded — check the grading scale."}
        >
          <ShareChart
            data={grades}
            nameKey="grade"
            valueKey="count"
            centreValue={String(grades.reduce((n, g) => n + g.count, 0))}
            centreLabel="graded"
          />
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subject by subject</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Subject", "Out of", "Entered", "Absent", "Average", "Highest", "Lowest", "Passed"]}
            empty={subjects.length === 0 && "No marks yet."}
          >
            {subjects.map((s) => (
              <tr key={s.subject_id}>
                <td className={tdStrong}>
                  {s.subject_name}
                  {s.subject_code && (
                    <span className="block font-mono text-[11px] font-normal text-ink-subtle">
                      {s.subject_code}
                    </span>
                  )}
                </td>
                <td className={td}>{s.max_marks}</td>
                <td className={td}>{s.entered}</td>
                <td className={td}>{s.absent || "—"}</td>
                <td className={td}>
                  {s.average} <span className="text-ink-subtle">({s.average_percent}%)</span>
                </td>
                <td className={td}>{s.highest}</td>
                <td className={td}>{s.lowest ?? "—"}</td>
                <td className={td}>
                  <Badge tone={percentTone(s.pass_percent)}>{s.pass_percent}%</Badge>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Highest aggregates</CardTitle>
          <span className="text-[12px] font-bold text-ink-muted">Top ten</span>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["#", "Student", "Section", "Total", "Percent"]}
            empty={toppers.length === 0 && "No aggregates yet."}
          >
            {toppers.map((t, i) => (
              <tr key={t.student_id}>
                <td className={td}>{i + 1}</td>
                <td className={tdStrong}>
                  <Link href={`/school/students/${t.student_id}`} className="hover:underline">
                    {t.student_name}
                  </Link>
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {t.admission_no}
                  </span>
                </td>
                <td className={td}>{t.section_label ?? "—"}</td>
                <td className={td}>
                  {t.obtained} <span className="text-ink-subtle">/ {t.max}</span>
                </td>
                <td className={td}>
                  <Badge tone={percentTone(t.percent)}>{t.percent}%</Badge>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>
    </ReportShell>
  );
}
