"use client";

import { useEffect, useState } from "react";

import type { Scale } from "@/components/grading/GradingSetup";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select, Table, td, tdStrong } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";
import { useAcademicYear } from "@/components/AcademicYearProvider";
import { openAuthed } from "@/lib/download";

type Row = {
  student_id: number;
  student_name: string;
  roll_no: number;
  percentage: number | null;
  grade: string | null;
  rank: number | null;
  teacher_remark: string | null;
  principal_remark: string | null;
  can_edit: boolean;
};
type Exam = { id: number; name: string; is_published: boolean; results_approved_at?: string | null; exam_type_id?: number | null; grade_scale_id?: number | null };
type SectionOpt = { id: number; label: string };
type ExamType = { id: number; name: string };

/** Report cards for one exam + section: remarks, approval, bulk PDF.
 * `mode` decides whether exam setup and approval are offered. */
export function ReportCards({ mode }: { mode: "admin" | "principal" | "teacher" }) {
  // Sections come from the year chosen in the top bar. Teachers read their
  // own classes instead, so this is only consulted in the other two modes.
  const yearId = useAcademicYear()?.yearId ?? null;
  const [exams, setExams] = useState<Exam[]>([]);
  const [sections, setSections] = useState<SectionOpt[]>([]);
  const [examId, setExamId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [scales, setScales] = useState<Scale[]>([]);
  const [types, setTypes] = useState<ExamType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "teacher") {
      api
        .get<{ exam_id: number; exam_name: string; exam_is_published: boolean }[]>("/api/v1/teacher/marks/papers")
        .then((r) => {
          const seen = new Map<number, Exam>();
          r.data.forEach((p) => seen.set(p.exam_id, { id: p.exam_id, name: p.exam_name, is_published: p.exam_is_published }));
          setExams(Array.from(seen.values()));
        })
        .catch((e) => setError(apiError(e)));
      api
        .get<{ class_teacher_of: { section_id: number; section_label: string }[] }>("/api/v1/teacher/my-classes")
        .then((r) => setSections(r.data.class_teacher_of.map((s) => ({ id: s.section_id, label: s.section_label }))))
        .catch(() => setSections([]));
    } else {
      api.get<Exam[]>("/api/v1/school/exams").then((r) => setExams(r.data)).catch((e) => setError(apiError(e)));
      if (yearId) {
        api
          .get<{ id: number; name: string; sections: { id: number; name: string }[] }[]>("/api/v1/school/classes", {
            params: { academic_year_id: yearId },
          })
          .then((cs) =>
            setSections(cs.data.flatMap((c) => c.sections.map((s) => ({ id: s.id, label: `${c.name} ${s.name}` }))))
          )
          .catch(() => setSections([]));
      }
      api.get<Scale[]>("/api/v1/school/grade-scales").then((r) => setScales(r.data)).catch(() => setScales([]));
      api.get<ExamType[]>("/api/v1/school/exam-types").then((r) => setTypes(r.data)).catch(() => setTypes([]));
    }
  }, [mode, yearId]);

  const load = () => {
    if (!examId || !sectionId) return setRows([]);
    api
      .get<Row[]>(`/api/v1/school/exams/${examId}/sections/${sectionId}/remarks`)
      .then((r) => setRows(r.data))
      .catch((e) => setError(apiError(e)));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, sectionId]);

  const exam = exams.find((e) => String(e.id) === examId);

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      setNotice(done);
      setError(null);
      if (mode !== "teacher") {
        const r = await api.get<Exam[]>("/api/v1/school/exams");
        setExams(r.data);
      }
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  function editRemark(r: Row, which: "teacher_remark" | "principal_remark") {
    const value = window.prompt(which === "teacher_remark" ? "Class teacher's remark" : "Principal's remark", r[which] ?? "");
    if (value === null) return;
    run(() => api.put(`/api/v1/school/exams/${examId}/students/${r.student_id}/remark`, { [which]: value }), "Remark saved.");
  }

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-60">
          <Select label="Exam" value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">Choose…</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.is_published ? " (published)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">Choose…</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        {examId && sectionId && (
          <Button
            variant="secondary"
            onClick={() =>
              openAuthed(`/api/v1/school/exams/${examId}/sections/${sectionId}/report-cards.pdf`, `report-cards-${examId}-${sectionId}.pdf`).catch((e) => setError(apiError(e)))
            }
          >
            Download report cards
          </Button>
        )}
      </div>

      {exam && mode !== "teacher" && (
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3">
            {mode === "admin" && (
              <>
                <div className="w-48">
                  <Select
                    label="Exam type"
                    value={exam.exam_type_id ? String(exam.exam_type_id) : ""}
                    onChange={(e) => run(() => api.patch(`/api/v1/school/exams/${exam.id}`, { exam_type_id: e.target.value ? Number(e.target.value) : null }), "Exam type set.")}
                  >
                    <option value="">None</option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-52">
                  <Select
                    label="Grade scale"
                    value={exam.grade_scale_id ? String(exam.grade_scale_id) : ""}
                    onChange={(e) => run(() => api.patch(`/api/v1/school/exams/${exam.id}`, { grade_scale_id: e.target.value ? Number(e.target.value) : null }), "Grade scale set. Re-save marks to re-grade them.")}
                  >
                    <option value="">School default</option>
                    {scales.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}
            <div className="flex items-center gap-2">
              {exam.results_approved_at ? (
                <Badge tone="emerald">results approved</Badge>
              ) : (
                <Button onClick={() => run(() => api.post(`/api/v1/school/exams/${exam.id}/approve-results`), "Results approved.")}>Approve results</Button>
              )}
              {exam.results_approved_at && !exam.is_published && (
                <Button variant="ghost" onClick={() => run(() => api.post(`/api/v1/school/exams/${exam.id}/approve-results?approve=false`), "Approval withdrawn.")}>
                  Withdraw approval
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {examId && sectionId && (
        <Card>
          <Table head={["Roll", "Student", "Result", "Rank", "Class teacher's remark", "Principal's remark"]} empty={rows.length === 0 && "No students, or marks not entered."}>
            {rows.map((r) => (
              <tr key={r.student_id}>
                <td className={td}>{r.roll_no}</td>
                <td className={tdStrong}>{r.student_name}</td>
                <td className={td}>
                  {r.percentage === null ? "—" : `${r.percentage}%`} {r.grade && <Badge>{r.grade}</Badge>}
                </td>
                <td className={td}>{r.rank ?? "—"}</td>
                <td className={td}>
                  <button type="button" className="text-left hover:underline" disabled={!r.can_edit} onClick={() => editRemark(r, "teacher_remark")}>
                    {r.teacher_remark || <span className="text-ink-subtle">add…</span>}
                  </button>
                </td>
                <td className={td}>
                  <button type="button" className="text-left hover:underline" disabled={mode === "teacher"} onClick={() => editRemark(r, "principal_remark")}>
                    {r.principal_remark || <span className="text-ink-subtle">{mode === "teacher" ? "—" : "add…"}</span>}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
