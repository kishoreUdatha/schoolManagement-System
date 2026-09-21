"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { downloadFile, ExamSelects, useExamChoice } from "./common";
import type { ExamDashboard } from "./types";

/**
 * SCR-148, live: GET /school/exams/{id} (papers, who signed off) and
 * /school/exam-ops/{id}/dashboard (candidates, marks entered);
 * POST /school/exams/papers/{id}/verify {verified}; POST
 * /school/exams/{id}/marks-window {open}; marks CSV from /school/exports/marks.csv.
 * The server refuses a sign-off by whoever entered the marks; that refusal is shown.
 */
export function MarksVerification() {
  const c = useExamChoice();
  const dash = useApi<ExamDashboard>(c.examId ? `/api/v1/school/exam-ops/${c.examId}/dashboard` : null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exam = c.exam;
  const byPaper = new Map((dash.data?.rows ?? []).map((r) => [r.paper_id, r]));
  const papers = (exam?.papers ?? []).map((p) => {
    const d = byPaper.get(p.id);
    const state = p.marks_verified_at ? "Verified" : d?.marks_complete ? "Ready to review" : "Marks pending";
    return { p, d, state };
  });
  const shown = papers.filter((x) => !status || x.state === status);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      notify(done);
      c.reloadExam();
      dash.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const verified = papers.filter((x) => x.p.marks_verified_at).length;
  const ready = papers.filter((x) => x.state === "Ready to review").length;
  const stats = [
    { label: "Exam", value: exam?.name ?? "—", note: exam?.academic_year_name ?? "" },
    { label: "Papers", value: exam ? String(papers.length) : "—", note: "In this exam" },
    { label: "Signed off", value: exam ? `${verified} / ${papers.length}` : "—", note: "Marks verified" },
    { label: "Ready to review", value: exam ? String(ready) : "—", note: "Fully marked, not signed off" },
  ];

  return (
    <>
      <div className="filterbar">
        <ExamSelects c={c} />
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All papers</option>
          <option>Ready to review</option>
          <option>Marks pending</option>
          <option>Verified</option>
        </select>
        {exam ? (
          <>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                downloadFile(`/api/v1/school/exports/marks.csv?exam_id=${exam.id}`, `marks-${exam.name.replace(/\s+/g, "-")}.csv`).catch((err) => setError(errorText(err)))
              }
            >
              <Icon name="download" className="sm" />
              Download marks
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || exam.is_published}
              onClick={() => run(() => api.post(`/api/v1/school/exams/${exam.id}/marks-window`, { open: !exam.marks_open }), exam.marks_open ? "Marks entry closed." : "Marks entry reopened.")}
            >
              <Icon name="clock" className="sm" />
              {exam.marks_open ? "Close marks entry" : "Reopen marks entry"}
            </button>
          </>
        ) : null}
      </div>
      <ErrorNote>{error ?? c.error ?? dash.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <Panel
        title="Verify marks"
        sub={exam ? `${exam.name} · marks entry ${exam.marks_open ? "open" : "closed"}` : c.examsLoading ? "Loading…" : "Choose an exam"}
        action={<Badge>{ready ? "Ready to review" : verified === papers.length && papers.length ? "Verified" : "Pending"}</Badge>}
        flush
      >
        <div className="table-wrap">
          <table className="data-table marks-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Class</th>
                <th>Date</th>
                <th>Marks entered</th>
                <th>Signed off by</th>
                <th>Review</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ p, d, state }) => (
                <tr key={p.id}>
                  <td>
                    {p.subject_name ?? "—"}
                    <small className="muted" style={{ display: "block" }}>{`Out of ${p.max_marks} · pass ${p.pass_marks}`}</small>
                  </td>
                  <td>{p.class_name ?? "—"}</td>
                  <td>{date(p.exam_date)}</td>
                  <td className="mark-total strong">{d ? `${d.marks_entered} / ${d.candidates}` : String(p.marks_entered_count)}</td>
                  <td>{p.marks_verified_by_name ? `${p.marks_verified_by_name} · ${date(p.marks_verified_at)}` : "—"}</td>
                  <td>
                    <Badge>{state}</Badge>
                  </td>
                  <td className="right">
                    {p.marks_verified_at ? (
                      <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.post(`/api/v1/school/exams/papers/${p.id}/verify`, { verified: false }), `Sign-off removed from ${p.subject_name ?? "the paper"}.`)}>
                        Remove sign-off
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn primary"
                        disabled={busy || !(d?.marks_entered ?? p.marks_entered_count)}
                        title={d?.marks_entered || p.marks_entered_count ? undefined : "No marks have been entered for this paper yet"}
                        onClick={() =>
                          (d?.marks_complete || window.confirm(`Only ${d?.marks_entered ?? p.marks_entered_count} of ${d?.candidates ?? "the"} candidates are marked. Sign off anyway?`)) &&
                          run(() => api.post(`/api/v1/school/exams/papers/${p.id}/verify`, { verified: true }), `${p.subject_name ?? "Paper"} marks signed off.`)
                        }
                      >
                        <Icon name="check" className="sm" />
                        Approve marks
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={shown.length > 0}>
          {c.examsLoading ? "Loading…" : exam ? "No papers match this filter." : "No exam chosen."}
        </div>
      </Panel>
      <div className="tip">
        <Icon name="shield" className="sm" />
        {/* Not wired: per-student marks on screen — the school portal has no per-section marks read for whole-mark papers; the CSV above carries them. */}
        <span>Whoever entered a paper’s marks cannot sign them off. Changing marks after sign-off removes the sign-off. Download the marks to check them student by student.</span>
      </div>
    </>
  );
}
