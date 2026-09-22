"use client";

/*
 * PM-021 · Results. Only school-published exams come back from the API, so
 * everything shown here has been released by the school.
 */

import { useEffect, useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { date, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { PmEmpty, PmError, PmLoading, useGoTo, useQueryId } from "../comms/ui";
import type { ExamListItem, ExamResult, SubjectResult } from "./types";

function subjectValue(s: SubjectResult): string {
  if (s.marks_obtained !== null) return `${s.marks_obtained} / ${s.max_marks}`;
  return s.status ? label(s.status) : "Pending";
}

export function Results() {
  const { childId } = useParent();
  const fromUrl = useQueryId("exam");
  const goTo = useGoTo();
  const list = useApi<ExamListItem[]>(childId ? `/api/v1/parent/me/children/${childId}/exams` : null);
  const [examId, setExamId] = useState<number | null>(null);

  // Pick the exam from ?exam= when it belongs to this child, else the latest published one.
  useEffect(() => {
    const items = list.data ?? [];
    if (!items.length) {
      setExamId(null);
      return;
    }
    setExamId((cur) => {
      if (cur && items.some((e) => e.exam_id === cur)) return cur;
      if (fromUrl && items.some((e) => e.exam_id === fromUrl)) return fromUrl;
      return items[0].exam_id;
    });
  }, [list.data, fromUrl]);

  const detail = useApi<ExamResult>(childId && examId ? `/api/v1/parent/me/children/${childId}/exams/${examId}` : null);
  const r = detail.data && detail.data.exam_id === examId && detail.data.student_id === childId ? detail.data : null;

  if (!childId) return <PmLoading />;
  // While a switched child's list loads, show nothing of the previous child's.
  if (list.loading) return <PmLoading />;
  if (list.error) return <PmError>{list.error}</PmError>;
  if (!list.data?.length) return <PmEmpty title="No results yet">Results appear here once the school publishes them.</PmEmpty>;

  return (
    <>
      <label className="field">
        Assessment
        <select value={examId ?? ""} onChange={(e) => setExamId(Number(e.target.value))}>
          {list.data.map((e) => (
            <option key={e.exam_id} value={e.exam_id}>
              {e.exam_name}
            </option>
          ))}
        </select>
      </label>
      <PmError>{detail.error}</PmError>
      {r && r.result_status === "withheld" ? (
        // A withheld result has no marks to show; zeros would read as a score.
        <div className="panel soft">
          <span className="eyebrow">RESULT WITHHELD</span>
          <p>{r.parent_note || "The school has withheld this result. Please contact the school office."}</p>
        </div>
      ) : r ? (
        <>
          <div className="metrics two">
            <div className="metric">
              <small>Overall</small>
              <b>{`${Math.round(r.summary.percentage)}%`}</b>
              <small>{`${r.summary.total_obtained} / ${r.summary.total_max}`}</small>
            </div>
            <div className="metric">
              <small>Grade</small>
              <b>{r.summary.overall_grade || "—"}</b>
              <small>{r.published_at ? `Published ${date(r.published_at)}` : ""}</small>
            </div>
          </div>
          {r.subjects.map((s) => (
            <div className="item" key={s.exam_paper_id}>
              <span>
                <strong>{s.subject_name}</strong>
                {/* Not wired: subject teacher's name — not in the result response. */}
                <small>{[s.grade ? `Grade ${s.grade}` : null, s.remark].filter(Boolean).join(" · ") || s.subject_code}</small>
              </span>
              <span className={`value ${s.is_pass === false ? "bad" : ""}`}>{subjectValue(s)}</span>
            </div>
          ))}
          {r.parent_note ? (
            <div className="panel soft">
              <p>{r.parent_note}</p>
            </div>
          ) : null}
          <button className="action" onClick={() => goTo(22, { exam: r.exam_id })}>
            View report card
          </button>
        </>
      ) : detail.loading ? (
        <PmLoading />
      ) : null}
    </>
  );
}
