"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Row } from "@/components/ui/DataTable";
import { date, pct } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { num, ReportView, share } from "./kit";

type Exam = { id: number; name: string; academic_year_name: string | null; start_date: string | null; end_date: string | null; is_published: boolean };
type Subject = {
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
type Analysis = {
  exam_id: number;
  exam_name: string;
  is_published: boolean;
  marks_entered: number;
  pass_percent: number;
  grades: { grade: string; count: number }[];
  subjects: Subject[];
  toppers: { student_id: number; student_name: string; admission_no: string; section_label: string | null; obtained: number; max: number; percent: number }[];
  struggling: Subject[];
};

/**
 * SCR-270 Academic Performance, SCR-271 Subject Performance and SCR-272 Exam
 * Result Analysis, live: GET /api/v1/school/exams, then
 * GET /api/v1/school/analytics/exams/{id}. One exam at a time, whole cohort.
 */
export function ExamReport({ view }: { view: "academic" | "subject" | "result" }) {
  const router = useRouter();
  const exams = useApi<Exam[]>("/api/v1/school/exams");
  const [examId, setExamId] = useState<number | null>(null);
  useEffect(() => {
    if (examId === null && exams.data?.length) setExamId((exams.data.find((e) => e.is_published) ?? exams.data[0]).id);
  }, [exams.data, examId]);
  const res = useApi<Analysis>(examId ? `/api/v1/school/analytics/exams/${examId}` : null);
  const d = res.data;
  const exam = exams.data?.find((e) => e.id === examId);
  const subjects = [...(d?.subjects ?? [])].sort((a, b) => a.pass_percent - b.pass_percent);
  const grades = d?.grades ?? [];
  const gradeTotal = grades.reduce((n, g) => n + g.count, 0);
  const avg = subjects.length ? subjects.reduce((n, s) => n + s.average_percent, 0) / subjects.length : null;
  const empty = exams.data && !exams.data.length ? "No exams have been set up yet." : "No marks have been entered for this exam.";

  const filters = (
    <select aria-label="Exam" value={examId ?? ""} onChange={(e) => setExamId(Number(e.target.value))}>
      {exams.data?.map((e) => (
        <option key={e.id} value={e.id}>{`${e.name}${e.academic_year_name ? ` · ${e.academic_year_name}` : ""}${e.is_published ? "" : " (not published)"}`}</option>
      ))}
    </select>
  );
  const scope: [string, string][] = [
    ["Exam", d?.exam_name ?? exam?.name ?? "—"],
    ["Academic year", exam?.academic_year_name ?? "—"],
    ["Dates", exam ? `${date(exam.start_date)} – ${date(exam.end_date)}` : "—"],
    ["Results", d ? (d.is_published ? "Published" : "Not published") : "—"],
  ];
  const stats = [
    { label: "Pass rate", value: d?.marks_entered ? pct(d.pass_percent) : "—", note: "Across all papers" },
    { label: "Marks entered", value: num(d?.marks_entered), note: d?.exam_name ?? "Selected exam" },
    { label: "Subjects", value: num(d?.subjects.length), note: "With a paper in this exam" },
    { label: "Average score", value: avg === null ? "—" : pct(avg), note: "Mean of subject averages" },
  ];
  const gradeBars = grades.map((g) => ({ label: `Grade ${g.grade}`, value: share(g.count, gradeTotal), text: num(g.count) }));
  const subjectLine = { kind: "line" as const, key: "Average score %", labels: subjects.slice(0, 6).map((s) => s.subject_code || s.subject_name), values: subjects.slice(0, 6).map((s) => s.average_percent) };

  if (view === "academic") {
    const rows: Row[] = (d?.toppers ?? []).map((t) => [{ name: t.student_name, sub: t.admission_no }, t.section_label ?? "—", `${num(t.obtained)} / ${num(t.max)}`, pct(t.percent)]);
    return (
      <ReportView
        filters={filters}
        error={exams.error ?? res.error}
        loading={res.loading || exams.loading}
        stats={stats}
        chart={{ ...subjectLine, title: "Performance overview", sub: "Average score by subject, weakest first (up to six)" }}
        scope={scope}
        summaryTitle="Grade spread"
        summary={gradeBars}
        // Not wired: the mock's per-class rows — the analysis covers the whole cohort, not class by class.
        table={{
          name: "exam-toppers",
          title: "Top performers",
          sub: "Highest overall percentage in this exam",
          columns: ["Student", "Class", "Marks", "Percentage"],
          rows,
          empty,
          onView: (i) => router.push(`${routeOf(57)}?id=${d!.toppers[i].student_id}`),
        }}
      />
    );
  }

  if (view === "subject") {
    const rows: Row[] = subjects.map((s) => [s.subject_name, num(s.entered), `${s.average.toFixed(1)} / ${s.max_marks}`, pct(s.pass_percent), num(s.highest), s.lowest === null ? "—" : num(s.lowest)]);
    return (
      <ReportView
        filters={filters}
        error={exams.error ?? res.error}
        loading={res.loading || exams.loading}
        stats={stats}
        chart={{ kind: "bars", title: "Pass rate by subject", sub: "Weakest first", percent: true, bars: subjects.map((s) => ({ label: s.subject_code || s.subject_name, value: s.pass_percent, text: pct(s.pass_percent, 0) })), empty }}
        scope={scope}
        summaryTitle="Needs attention"
        summary={(d?.struggling ?? []).map((s) => ({ label: s.subject_code || s.subject_name, value: s.pass_percent, text: pct(s.pass_percent, 0) }))}
        table={{ name: "subject-performance", columns: ["Subject", "Students", "Average", "Pass rate", "Highest", "Lowest"], rows, empty }}
      />
    );
  }

  const rows: Row[] = subjects.map((s) => [s.subject_name, num(s.entered), num(s.passed), num(s.absent), pct(s.pass_percent), pct(s.average_percent)]);
  return (
    <ReportView
      filters={filters}
      error={exams.error ?? res.error}
      loading={res.loading || exams.loading}
      stats={stats}
      chart={{ ...subjectLine, title: "Result overview", sub: "Average score by subject, weakest first (up to six)" }}
      scope={scope}
      summaryTitle="Grade spread"
      summary={gradeBars}
      // Not wired: results by class — the analysis is per subject for the whole cohort.
      table={{ name: "exam-result-analysis", columns: ["Subject", "Entered", "Passed", "Absent", "Pass rate", "Average"], rows, empty }}
    />
  );
}
