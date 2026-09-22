"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { parentRoute } from "@/lib/parentScreens";
import { useApi } from "@/lib/useApi";
import { ActionLink, childPath, ChildScoped, clock, dateRange, PmEmpty, PmError, PmLoading, shortDate, todayIso } from "../home/parts";
import type { CalendarItem, ExamListItem, ExamSchedule as Schedule } from "./types";

/**
 * Upcoming exams: the child's datesheets (exams with papers for the child's
 * class), plus calendar exams the school has not listed papers for yet.
 */
function useUpcomingExams(childId: number) {
  const sheets = useApi<Schedule[]>(childPath(childId, "/exam-schedule"));
  const cal = useApi<CalendarItem[]>("/api/v1/parent/me/calendar", { start: todayIso(), end: todayIso(365) });
  const listed = new Set((sheets.data ?? []).map((s) => s.exam_id));
  const exams = [
    ...(sheets.data ?? []).map((s) => ({ id: s.exam_id, title: s.exam_name, start_date: s.start_date, end_date: s.end_date, papers: s.papers.length })),
    ...(cal.data ?? []).filter((i) => i.type === "exam" && !i.is_cancelled && !listed.has(i.id)).map((i) => ({ id: i.id, title: i.title, start_date: i.start_date, end_date: i.end_date, papers: 0 })),
  ].sort((a, b) => a.start_date.localeCompare(b.start_date));
  return { exams, loading: (sheets.loading && !sheets.data) || (cal.loading && !cal.data), error: sheets.error ?? cal.error };
}

/** PM-019. The next exam, and the child's published exams with a link to each result. */
export function Exams() {
  return <ChildScoped render={(childId) => <ExamsFor childId={childId} />} />;
}

function ExamsFor({ childId }: { childId: number }) {
  const router = useRouter();
  const { go } = useParent();
  const upcoming = useUpcomingExams(childId);
  const results = useApi<ExamListItem[]>(childPath(childId, "/exams"));
  const next = upcoming.exams[0];

  return (
    <>
      <PmError>{upcoming.error}</PmError>
      {upcoming.loading ? <PmLoading /> : null}
      {next ? (
        <div className="panel soft">
          <span className="eyebrow">UPCOMING ASSESSMENT</span>
          <h2>{next.title}</h2>
          <p>{dateRange(next.start_date, next.end_date)}</p>
          <button className="action" onClick={() => router.push(`${parentRoute(20)}?id=${next.id}`)}>
            View exam schedule
          </button>
        </div>
      ) : !upcoming.loading && !upcoming.error ? (
        <PmEmpty title="No upcoming exams">Exams the school schedules appear here.</PmEmpty>
      ) : null}
      {upcoming.exams.slice(1).map((x) => (
        <button key={x.id} className="item" onClick={() => router.push(`${parentRoute(20)}?id=${x.id}`)}>
          <span>
            <strong>{x.title}</strong>
            <small>{`Upcoming · ${dateRange(x.start_date, x.end_date)}`}</small>
          </span>
          <span className="value">Schedule</span>
        </button>
      ))}
      <PmError>{results.error}</PmError>
      {(results.data ?? []).map((x) => (
        <button key={x.exam_id} className="item" onClick={() => router.push(`${parentRoute(21)}?exam=${x.exam_id}`)}>
          <span>
            <strong>{x.exam_name}</strong>
            <small>{`Results published · ${shortDate(x.published_at ?? x.end_date)}`}</small>
          </span>
          <span className="value">Results</span>
        </button>
      ))}
      <button className="item" onClick={() => go(22)}>
        <span>
          <strong>Report cards</strong>
          <small>Published school reports</small>
        </span>
        <span className="value">›</span>
      </button>
    </>
  );
}

/**
 * PM-020. Paper-by-paper datesheet for an exam (?id=, else the next one):
 * date and time, the portion each paper covers, the school's instructions,
 * and the admit card while the exam is still to come.
 */
export function ExamSchedule() {
  const id = Number(useSearchParams().get("id")) || 0;
  return <ChildScoped render={(childId, child) => <ScheduleFor childId={childId} id={id} section={child.section_label} />} />;
}

function ScheduleFor({ childId, id, section }: { childId: number; id: number; section: string | null }) {
  const { notify } = useParent();
  const router = useRouter();
  const upcoming = useUpcomingExams(childId);
  const target = id || upcoming.exams[0]?.id || 0;
  const sheet = useApi<Schedule>(target ? childPath(childId, `/exam-schedule/${target}`) : null);
  const [busy, setBusy] = useState(false);

  if (!id && upcoming.loading) return <PmLoading />;
  if (!target) {
    return (
      <>
        <PmEmpty title="No exam chosen">There are no upcoming exams. Choose an exam from the Exams screen.</PmEmpty>
        <ActionLink secondary href={parentRoute(19)}>
          Go to exams
        </ActionLink>
      </>
    );
  }
  if (sheet.loading && !sheet.data) return <PmLoading />;

  if (!sheet.data) {
    // 404: no papers listed for this child's class yet — show what the calendar knows.
    const exam = upcoming.exams.find((x) => x.id === target);
    if (!exam) return upcoming.loading ? <PmLoading /> : <PmEmpty title="Exam not found">{sheet.error ?? "This exam has no papers for your child’s class."}</PmEmpty>;
    return (
      <>
        <p className="lead">{[exam.title, section].filter(Boolean).join(" · ")}</p>
        <div className="panel soft">
          <span className="eyebrow">EXAM DATES</span>
          <h2>{dateRange(exam.start_date, exam.end_date)}</h2>
          <p>The school has not listed the papers for this class yet.</p>
        </div>
      </>
    );
  }

  const d = sheet.data;
  const over = d.end_date < todayIso();
  async function admitCard() {
    setBusy(true);
    try {
      await api.download(childPath(childId, `/exam-schedule/${d.exam_id}/admit-card.pdf`), `admit-card-${d.exam_name.replace(/\s+/g, "_")}.pdf`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="lead">{[d.exam_name, [d.class_name, d.section_name].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</p>
      {d.papers.map((p) => {
        const time = p.start_time ? (p.end_time ? `${clock(p.start_time, true)}–${clock(p.end_time)}` : clock(p.start_time)) : null;
        return (
          <div key={p.paper_id} className="item">
            <span>
              <strong>{p.subject_name}</strong>
              <small>{[shortDate(p.exam_date), time, p.room_name ? `Room ${p.room_name}` : null].filter(Boolean).join(" · ")}</small>
            </span>
            <span className="value">{p.syllabus ?? `Max ${p.max_marks}`}</span>
          </div>
        );
      })}
      {d.instructions ? (
        <div className="panel">
          <h3>Before the exam</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{d.instructions}</p>
        </div>
      ) : null}
      {d.is_published ? (
        <button className="action" onClick={() => router.push(`${parentRoute(21)}?exam=${d.exam_id}`)}>
          View results
        </button>
      ) : null}
      {!over && d.admit_card_available ? (
        <button className="action secondary" disabled={busy} onClick={admitCard}>
          {busy ? "Preparing admit card…" : "View admit card"}
        </button>
      ) : null}
    </>
  );
}
