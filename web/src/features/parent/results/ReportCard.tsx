"use client";

/*
 * PM-022 · Report card for one published exam (?exam=), with the school's
 * name and logo, its remarks, the school-generated PDF, and the parent's
 * acknowledgement.
 */

import { useState } from "react";
import { initialsOf, useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
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
  const [acking, setAcking] = useState(false);

  async function acknowledge() {
    if (!base || !r) return;
    setAcking(true);
    try {
      await api.post(`${base}/exams/${r.exam_id}/acknowledge`);
      notify("Thank you — the school can see you have read this report.");
      res.reload();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setAcking(false);
    }
  }

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
        <div className="report-logo">
          {r.school_logo_url && /^(https?:\/\/|\/)/i.test(r.school_logo_url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.school_logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "inherit" }} />
          ) : (
            initialsOf(r.school_name ?? child?.full_name ?? r.student_name)
          )}
        </div>
        <h3>{(r.school_name ?? "Report card").toUpperCase()}</h3>
        <p>{`${r.exam_name} · Report card`}</p>
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
      {r.acknowledged_at ? (
        <p className="micro">{`You acknowledged this report on ${dateTime(r.acknowledged_at)}.`}</p>
      ) : (
        <button className="action secondary" disabled={acking} onClick={acknowledge}>
          {acking ? "Saving…" : "Acknowledge report"}
        </button>
      )}
      <button className="action secondary" onClick={() => goTo(21, { exam: r.exam_id })}>
        View subject marks
      </button>
    </>
  );
}
