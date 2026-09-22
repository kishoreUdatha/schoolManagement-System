"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useParent } from "@/components/parent/ParentShell";
import { parentRoute } from "@/lib/parentScreens";
import { useApi } from "@/lib/useApi";
import { ActionLink, childPath, ChildScoped, dateRange, longDate, PmEmpty, PmError, PmLoading, shortDate, todayIso } from "../home/parts";
import type { CalendarItem, ExamListItem, ExamResult } from "./types";

/** Upcoming exams: the parent calendar's exam entries for the next year (the widest window it allows is 400 days). */
function useUpcomingExams() {
  const cal = useApi<CalendarItem[]>("/api/v1/parent/me/calendar", { start: todayIso(), end: todayIso(365) });
  const exams = (cal.data ?? []).filter((i) => i.type === "exam" && !i.is_cancelled).sort((a, b) => a.start_date.localeCompare(b.start_date));
  return { exams, loading: cal.loading && !cal.data, error: cal.error };
}

/** PM-019. The next exam, and the child's published exams with a link to each result. */
export function Exams() {
  return <ChildScoped render={(childId) => <ExamsFor childId={childId} />} />;
}

function ExamsFor({ childId }: { childId: number }) {
  const router = useRouter();
  const { go } = useParent();
  const upcoming = useUpcomingExams();
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
        <button key={x.exam_id} className="item" onClick={() => router.push(`${parentRoute(21)}?id=${x.exam_id}`)}>
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
 * PM-020. Paper-by-paper dates for an exam (?id=). The parent API gives
 * papers only for published exams (GET …/exams/{id}); for an exam still to
 * come it gives the calendar's name and dates.
 * Not wired: paper-wise schedule for unpublished (upcoming) exams, syllabus per paper, exam-day instructions and admit card — no parent endpoint.
 */
export function ExamSchedule() {
  const id = Number(useSearchParams().get("id")) || 0;
  return <ChildScoped render={(childId, child) => <ScheduleFor childId={childId} id={id} section={child.section_label} />} />;
}

function ScheduleFor({ childId, id, section }: { childId: number; id: number; section: string | null }) {
  const upcoming = useUpcomingExams();
  const published = useApi<ExamListItem[]>(childPath(childId, "/exams"));
  const isPublished = Boolean(published.data?.some((x) => x.exam_id === id));
  const detail = useApi<ExamResult>(isPublished ? childPath(childId, `/exams/${id}`) : null);

  if (upcoming.loading || (!published.data && !published.error)) return <PmLoading />;
  const target = id || upcoming.exams[0]?.id || 0;
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

  if (isPublished) {
    if (detail.error) return <PmError>{detail.error}</PmError>;
    if (!detail.data) return <PmLoading />;
    const d = detail.data;
    const papers = [...d.subjects].sort((a, b) => a.exam_date.localeCompare(b.exam_date));
    return (
      <>
        <p className="lead">{[d.exam_name, [d.class_name, d.section_name].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</p>
        {papers.length ? (
          papers.map((p) => (
            <div key={p.exam_paper_id} className="item">
              <span>
                <strong>{p.subject_name}</strong>
                <small>{longDate(p.exam_date)}</small>
              </span>
              <span className="value">{`Max ${p.max_marks}`}</span>
            </div>
          ))
        ) : (
          <PmEmpty title="No papers listed">The school has not listed papers for this exam.</PmEmpty>
        )}
        <div className="panel">
          <h3>{`${dateRange(d.start_date, d.end_date)}`}</h3>
          <p>Results for this exam are published.</p>
        </div>
      </>
    );
  }

  const exam = upcoming.exams.find((x) => x.id === target);
  if (!exam) {
    return (
      <>
        <PmEmpty title="Exam not found">This exam is not in the school calendar for the coming year.</PmEmpty>
        <ActionLink secondary href={parentRoute(19)}>
          Go to exams
        </ActionLink>
      </>
    );
  }
  return (
    <>
      <p className="lead">{[exam.title, section].filter(Boolean).join(" · ")}</p>
      <div className="panel soft">
        <span className="eyebrow">EXAM DATES</span>
        <h2>{dateRange(exam.start_date, exam.end_date)}</h2>
        <p>The paper-by-paper timetable is not shared in the parent app yet. Please check with the class teacher for paper dates.</p>
      </div>
    </>
  );
}
