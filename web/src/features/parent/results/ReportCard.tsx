"use client";

/*
 * PM-022 · Report card for one published exam (?exam=), with the school's
 * remarks and the school-generated PDF.
 */

import { useState } from "react";
import { initialsOf, useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { PmEmpty, PmError, PmLoading, useGoTo, useQueryId } from "../comms/ui";
import type { ExamListItem, ExamResult } from "./types";

export function ReportCard() {
  const { childId, child, notify } = useParent();
  const goTo = useGoTo();
  const fromUrl = useQueryId("exam");
  const base = childId ? `/api/v1/parent/me/children/${childId}` : null;
  // Without ?exam=, show the latest published exam.
  const list = useApi<ExamListItem[]>(base && !fromUrl ? `${base}/exams` : null);
  const examId = fromUrl ?? list.data?.[0]?.exam_id ?? null;
  const res = useApi<ExamResult>(base && examId ? `${base}/exams/${examId}` : null);
  const r = res.data && res.data.student_id === childId && res.data.exam_id === examId ? res.data : null;
  const [busy, setBusy] = useState(false);

  async function download() {
    if (!base || !r) return;
    setBusy(true);
    try {
      await api.download(`${base}/exams/${r.exam_id}/report-card.pdf`, `report-card-${r.student_admission_no}-${r.exam_name.replace(/\s+/g, "_")}.pdf`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!childId || list.loading || (res.loading && !r)) return <PmLoading />;
  if (list.error || res.error) return <PmError>{list.error ?? res.error}</PmError>;
  if (!r) return <PmEmpty title="No report card yet">A report card appears here once the school releases results.</PmEmpty>;

  const cls = [r.class_name, r.section_name ? `Section ${r.section_name}` : null].filter(Boolean).join(" · ");
  return (
    <>
      <div className="report">
        {/* Not wired: school name and logo — not in the parent result response. */}
        <div className="report-logo">{initialsOf(child?.full_name ?? r.student_name)}</div>
        <h3>REPORT CARD</h3>
        <p>{`${r.exam_name} · ${r.exam_kind.replace(/_/g, " ")}`}</p>
        <hr />
        <h2 className="child-name">{r.student_name}</h2>
        <p className="child-class">{cls || `Admission no. ${r.student_admission_no}`}</p>
        <div className="metrics two">
          <div className="metric">
            <small>Result</small>
            <b>{`${r.summary.total_obtained} / ${r.summary.total_max}`}</b>
            <small>{`${r.summary.percentage.toFixed(1)}%${r.summary.is_pass ? "" : " · not passed"}`}</small>
          </div>
          <div className="metric">
            <small>Grade</small>
            <b>{r.summary.overall_grade || "—"}</b>
            <small>{r.rank && r.class_size ? `Rank ${r.rank} of ${r.class_size}` : ""}</small>
          </div>
        </div>
        {r.attendance_percent !== null ? <p className="micro">{`Attendance ${r.attendance_percent}%`}</p> : null}
        <hr />
        <h3>Class teacher’s remarks</h3>
        <p>{r.teacher_remark || "No remarks recorded."}</p>
        {r.principal_remark ? (
          <>
            <h3>Principal’s remarks</h3>
            <p>{r.principal_remark}</p>
          </>
        ) : null}
        {r.parent_note ? <p className="micro">{r.parent_note}</p> : null}
      </div>
      <button className="action" disabled={busy} onClick={download}>
        {busy ? "Preparing PDF…" : "Download report card"}
      </button>
      {/* Not wired: "Acknowledge report" — no endpoint records a parent's acknowledgement. */}
      <button className="action secondary" onClick={() => goTo(21, { exam: r.exam_id })}>
        View subject marks
      </button>
    </>
  );
}
