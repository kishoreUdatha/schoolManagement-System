"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { errorText, type Paginated } from "@/lib/api";
import { date, dateTime, label, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import type { SchoolClass, Student } from "@/features/students/types";
import { downloadFile, useSetParam } from "./common";
import type { ChildOverview, Exam, ExamListItem, ExamResult } from "./types";
import { useSearchParams } from "next/navigation";

/**
 * SCR-151 Student Result and SCR-152 Report Card, live. One renderer for all
 * who may see a result, each through their own portal:
 *  - student: GET /student/exams, /student/exams/{id}, …/report-card.pdf
 *  - parent:  GET /parent/me/children, …/children/{sid}/exams[/{id}], …/report-card.pdf
 *  - school:  GET /school/exams, /school/students, /school/result-decisions/exams/{id}/students/{sid}
 * Students and parents only ever get published results; a withheld result
 * stays withheld — no marks are drawn for it.
 */
export function ResultCard({ kind }: { kind: "result" | "report" }) {
  const sess = useSession();
  const role = sess?.user.role;
  if (!sess) return <Loading what="Loading…" />;
  if (role === "student") return <StudentView kind={kind} />;
  if (role === "parent") return <ParentView kind={kind} />;
  return <SchoolView kind={kind} />;
}

function StudentView({ kind }: { kind: "result" | "report" }) {
  const exams = useApi<ExamListItem[]>("/api/v1/student/exams");
  const [examId, setExamId] = useFirst(exams.data?.map((e) => e.exam_id));
  const res = useApi<ExamResult>(examId ? `/api/v1/student/exams/${examId}` : null);
  return (
    <Shell
      kind={kind}
      selects={<ExamPick items={exams.data?.map((e) => [e.exam_id, e.exam_name]) ?? []} value={examId} onChange={setExamId} loading={exams.loading} />}
      result={res.data?.exam_id === examId ? res.data : null}
      loading={exams.loading || res.loading}
      error={exams.error ?? res.error}
      pdf={examId ? `/api/v1/student/exams/${examId}/report-card.pdf` : null}
    />
  );
}

function ParentView({ kind }: { kind: "result" | "report" }) {
  const children = useApi<ChildOverview[]>("/api/v1/parent/me/children");
  const [childId, setChildId] = useFirst(children.data?.map((c) => c.id), "student");
  const exams = useApi<ExamListItem[]>(childId ? `/api/v1/parent/me/children/${childId}/exams` : null);
  const [examId, setExamId] = useFirst(exams.data?.map((e) => e.exam_id));
  const res = useApi<ExamResult>(childId && examId ? `/api/v1/parent/me/children/${childId}/exams/${examId}` : null);
  return (
    <Shell
      kind={kind}
      selects={
        <>
          <select aria-label="Child" value={childId ?? ""} onChange={(e) => setChildId(Number(e.target.value))}>
            {children.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {`${c.full_name}${c.section_label ? ` · ${c.section_label}` : ""}`}
              </option>
            ))}
          </select>
          <ExamPick items={exams.data?.map((e) => [e.exam_id, e.exam_name]) ?? []} value={examId} onChange={setExamId} loading={exams.loading} />
        </>
      }
      result={res.data?.exam_id === examId && res.data?.student_id === childId ? res.data : null}
      loading={children.loading || exams.loading || res.loading}
      error={children.error ?? exams.error ?? res.error}
      pdf={childId && examId ? `/api/v1/parent/me/children/${childId}/exams/${examId}/report-card.pdf` : null}
    />
  );
}

function SchoolView({ kind }: { kind: "result" | "report" }) {
  const exams = useApi<Exam[]>("/api/v1/school/exams");
  const [examId, setExamId] = useFirst(exams.data?.map((e) => e.id), "id");
  const exam = exams.data?.find((e) => e.id === examId);
  const classes = useApi<SchoolClass[]>(exam ? "/api/v1/school/classes" : null, { academic_year_id: exam?.academic_year_id });
  const [classId, setClassId] = useFirst(classes.data?.map((c) => c.id), "class");
  const students = useApi<Paginated<Student>>(classId ? "/api/v1/school/students" : null, { class_id: classId, academic_year_id: exam?.academic_year_id, page_size: 200 });
  const [studentId, setStudentId] = useFirst(students.data?.items.map((s) => s.id), "student");
  const res = useApi<ExamResult>(examId && studentId ? `/api/v1/school/result-decisions/exams/${examId}/students/${studentId}` : null);
  return (
    <Shell
      kind={kind}
      selects={
        <>
          <ExamPick items={exams.data?.map((e) => [e.id, e.name]) ?? []} value={examId} onChange={setExamId} loading={exams.loading} />
          <select aria-label="Class" value={classId ?? ""} onChange={(e) => setClassId(Number(e.target.value))}>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select aria-label="Student" value={studentId ?? ""} onChange={(e) => setStudentId(Number(e.target.value))} disabled={!students.data?.items.length}>
            {!students.data?.items.length ? <option value="">{students.loading ? "Loading…" : "No students"}</option> : null}
            {students.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {`${s.full_name} · ${s.admission_no}`}
              </option>
            ))}
          </select>
        </>
      }
      result={res.data?.exam_id === examId && res.data?.student_id === studentId ? res.data : null}
      loading={exams.loading || res.loading || students.loading}
      error={exams.error ?? classes.error ?? students.error ?? res.error}
      pdf={null}
      school
    />
  );
}

/** A choice kept in the URL (when `param` is given), falling back to the first option. */
function useFirst(options: number[] | undefined, param?: string): [number | null, (v: number) => void] {
  const params = useSearchParams();
  const setParam = useSetParam();
  const [local, setLocal] = useState<number | null>(null);
  const wanted = param ? Number(params.get(param)) || null : local;
  useEffect(() => {
    if (!param && options && local !== null && !options.includes(local)) setLocal(null);
  }, [options, local, param]);
  const value = wanted !== null && options?.includes(wanted) ? wanted : (options?.[0] ?? null);
  return [value, (v) => (param ? setParam({ [param]: v }) : setLocal(v))];
}

function ExamPick({ items, value, onChange, loading }: { items: [number, string][]; value: number | null; onChange: (v: number) => void; loading: boolean }) {
  return (
    <select aria-label="Exam" value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} disabled={!items.length}>
      {!items.length ? <option value="">{loading ? "Loading exams…" : "No published results yet"}</option> : null}
      {items.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
}

function Shell({
  kind,
  selects,
  result: r,
  loading,
  error,
  pdf,
  school = false,
}: {
  kind: "result" | "report";
  selects: JSX.Element;
  result: ExamResult | null;
  loading: boolean;
  error: string | null;
  pdf: string | null;
  school?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);
  const held = Boolean(r && r.result_status === "withheld");

  async function download() {
    if (!pdf || !r) return;
    setBusy(true);
    setDlError(null);
    try {
      await downloadFile(pdf, `report-card-${r.student_admission_no}-${r.exam_name.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      setDlError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const rows: Row[] = (r?.subjects ?? []).map((s) => {
    const got = s.status === "absent" ? "Absent" : s.status === "exempt" ? "Exempt" : s.marks_obtained !== null ? String(s.marks_obtained) : "Not marked";
    const outcome = s.status === "absent" ? "Absent" : s.status === "exempt" ? "Exempt" : s.is_pass === null ? "Pending" : s.is_pass ? "Pass" : "Fail";
    return [s.subject_name, String(s.max_marks), got, s.grade ?? "—", outcome];
  });
  const sum = r?.summary;
  const outcome = r ? (r.result_status === "pass_by_grace" ? "Pass (by grace)" : r.result_status === "failed" ? "Not passed" : sum?.is_pass ? "Pass" : "Not passed") : "—";

  return (
    <>
      <div className="filterbar">
        {selects}
        <button type="button" className="btn" onClick={() => window.print()} disabled={!r || held}>
          <Icon name="download" className="sm" />
          Print
        </button>
        {pdf ? (
          <button type="button" className="btn primary" onClick={download} disabled={!r || held || busy}>
            <Icon name="download" className="sm" />
            {busy ? "Preparing…" : kind === "report" ? "Download report card" : "Download result"}
          </button>
        ) : null}
      </div>
      <ErrorNote>{dlError ?? error}</ErrorNote>
      {school && r && !r.is_published ? (
        <div className="tip warn" style={{ marginBottom: 16 }}>
          <Icon name="bell" className="sm" />
          <span>Not published yet — students and parents cannot see this result.</span>
        </div>
      ) : null}
      {!r ? (
        <section className="panel">
          <div className="panel-pad muted">{loading ? "Loading the result…" : "No result to show yet."}</div>
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
              <h2>{kind === "report" ? `${r.exam_name} Report Card` : `${r.exam_name} Result`}</h2>
              <p className="small muted">{`${date(r.start_date)} to ${date(r.end_date)}`}</p>
            </div>
          </div>
          <div className="invoice-meta">
            <div>
              <p>Student</p>
              <h3>{r.student_name}</h3>
              <p>{`${r.student_admission_no} · ${r.class_name ?? "—"} ${r.section_name ?? ""} · Roll no. ${String(r.student_roll_no).padStart(2, "0")}`}</p>
            </div>
            <div className="right">
              <p>{`Published: ${r.published_at ? dateTime(r.published_at) : "Not yet"}`}</p>
              <p>{`Attendance: ${r.attendance_percent !== null ? pct(r.attendance_percent, 0) : "—"}`}</p>
              <p>{`${label(r.exam_kind)}${r.rank && r.class_size ? ` · Rank ${r.rank} of ${r.class_size}` : ""}`}</p>
            </div>
          </div>
          {held ? (
            <div className="tip warn">
              <Icon name="bell" className="sm" />
              <span>{`The school is holding this result for now, so the marks are not shown. ${r.parent_note ?? "Please speak to the school office."}`}</span>
            </div>
          ) : (
            <>
              <DataTable
                columns={["Subject", "Maximum marks", "Marks obtained", "Grade", "Result"]}
                rows={rows}
                selectable={false}
                rowAction={false}
                emptyState={{ title: "No subjects marked yet", note: "This exam's marks have not been entered for this student yet." }}
              />
              <div className="invoice-total">
                <div>
                  <span>Total</span>
                  <strong>{sum ? `${sum.total_obtained} / ${sum.total_max}` : "—"}</strong>
                </div>
                <div>
                  <span>Percentage</span>
                  <strong>{sum && sum.total_max ? pct(sum.percentage, 2) : "—"}</strong>
                </div>
                <div className="grand">
                  <span>Overall grade</span>
                  <strong>{sum?.overall_grade ?? "—"}</strong>
                </div>
                <div>
                  <span>Result</span>
                  <strong>{outcome}</strong>
                </div>
              </div>
              {sum?.subjects_pending ? (
                <p className="small muted">{`${sum.subjects_pending} subject${sum.subjects_pending === 1 ? " is" : "s are"} not yet marked; the total leaves them out rather than counting them as zero.`}</p>
              ) : null}
              {r.teacher_remark ? <div className="tip">{r.teacher_remark}</div> : null}
              {r.principal_remark ? <div className="tip">{r.principal_remark}</div> : null}
              {r.parent_note ? <div className="tip">{r.parent_note}</div> : null}
            </>
          )}
          <div className="cert-sign">
            <strong>Class Teacher</strong>
            <strong>Principal</strong>
          </div>
        </article>
      )}
    </>
  );
}
