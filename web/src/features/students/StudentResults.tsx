"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { date, label, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { StudentFrame, today } from "./StudentFrame";
import type { ExamHistory, RemarkRow } from "./records";
import type { StudentProfile } from "./types";

/**
 * SCR-061, live: GET /student-detail/{id}/exams (per paper, unmarked kept
 * apart from nought), /exams/{exam}/sections/{section}/remarks, /profile.
 */
export function StudentResults() {
  return <StudentFrame active={61}>{(s) => <ResultsBody s={s} />}</StudentFrame>;
}

/** The Print button in the page head. */
export function PrintButton({ children = "Print" }: { children?: string }) {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      <Icon name="download" className="sm" />
      {children}
    </button>
  );
}

/** The screen's content under the banner; the profile's tab renders it too. */
export function ResultsBody({ s }: { s: StudentProfile }) {
  const history = useApi<ExamHistory>(`/api/v1/school/student-detail/${s.id}/exams`);
  const school = useApi<{ name: string; address: string | null }>("/api/v1/school/profile");
  const exams = history.data?.exams ?? [];
  const [examId, setExamId] = useState<number | null>(null);
  useEffect(() => {
    if (examId === null && exams.length) setExamId(exams[0].exam_id);
  }, [exams, examId]);
  const exam = exams.find((e) => e.exam_id === examId);
  const remarks = useApi<RemarkRow[]>(exam ? `/api/v1/school/exams/${exam.exam_id}/sections/${s.section_id}/remarks` : null);
  const mine = remarks.data?.find((r) => r.student_id === s.id);
  const grade = mine?.grade && mine.grade !== "—" ? mine.grade : null;
  const parent = s.parents[0];

  const wait = history.loading && !history.data;
  const stats = [
    { label: "Exams", value: wait ? "…" : String(exams.length), note: "With results recorded" },
    { label: "This exam", value: wait ? "…" : pct(exam?.percent), note: exam ? exam.exam_name : "No exam yet" },
    { label: "Papers failed", value: wait ? "…" : String((exam?.subjects ?? []).filter((p) => p.is_pass === false).length), note: exam ? `${exam.marked} of ${exam.subjects.length} marked` : "—" },
    { label: "Average", value: wait ? "…" : pct(exams.length ? exams.reduce((t, e) => t + Number(e.percent), 0) / exams.length : null), note: `Across ${exams.length} exam(s)` },
  ];

  const rows: Row[] = (exam?.subjects ?? []).map((p) => [
    p.subject_name,
    String(p.max_marks),
    p.marks_obtained === null ? (p.status ? label(p.status) : "Not marked") : String(p.marks_obtained),
    p.grade ?? "—",
    p.is_pass === null ? "—" : p.is_pass ? "Pass" : "Fail",
  ]);

  return (
    <>
      <StatStrip items={stats} compact />
      <ErrorNote>{history.error}</ErrorNote>
      {exams.length > 1 ? (
        <div className="filterbar">
          <select aria-label="Examination" value={examId ?? ""} onChange={(e) => setExamId(Number(e.target.value))}>
            {exams.map((e) => (
              <option key={e.exam_id} value={e.exam_id}>
                {`${e.exam_name} · ${date(e.start_date)}`}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {!exam ? (
        <section className="panel">
          <div className="panel-pad muted">{history.loading ? "Loading results…" : "No examination results are recorded for this student yet."}</div>
        </section>
      ) : (
        <article className="invoice">
          <div className="spread">
            <Link href="/screens" className="brand">
              <span className="brand-mark">
                <Icon name="book" />
              </span>
              <span>
                BrightCampus
                <small>SCHOOL ERP</small>
              </span>
            </Link>
            <div className="right">
              <h2>{`${exam.exam_name} Report Card`}</h2>
              <p className="small muted">{`Academic year ${s.academic_year_name ?? "—"}`}</p>
            </div>
          </div>
          <div className="invoice-meta">
            <div>
              <p>Student</p>
              <h3>{s.full_name}</h3>
              <p>{`${s.admission_no} · ${s.class_name ?? ""} ${s.section_name ?? ""}${s.roll_no ? ` · Roll no. ${s.roll_no}` : ""}`}</p>
              <p>{[school.data?.name, school.data?.address].filter(Boolean).join(", ") || "—"}</p>
            </div>
            <div className="right">
              <p>{`Issued on: ${date(today())}`}</p>
              <p>{`Parent: ${parent?.full_name ?? "—"}`}</p>
              <p>{`${exam.exam_name} · ${label(exam.kind)} · from ${date(exam.start_date)}`}</p>
            </div>
          </div>
          <DataTable columns={["Subject", "Maximum marks", "Marks obtained", "Grade", "Result"]} rows={rows} selectable={false} rowAction={false} />
          <div className="invoice-total">
            <div>
              <span>Total</span>
              <strong>{`${exam.obtained} / ${exam.out_of}`}</strong>
            </div>
            <div>
              <span>Percentage</span>
              <strong>{pct(exam.percent, 2)}</strong>
            </div>
            <div className="grand">
              <span>{grade ? "Overall grade" : "Papers marked"}</span>
              <strong>{grade ?? `${exam.marked} / ${exam.subjects.length}`}</strong>
            </div>
          </div>
          {mine?.teacher_remark || mine?.principal_remark ? <div className="tip">{[mine.teacher_remark, mine.principal_remark].filter(Boolean).join(" ")}</div> : null}
          <div className="cert-sign">
            <strong>Class Teacher</strong>
            <strong>Principal</strong>
          </div>
        </article>
      )}
    </>
  );
}
