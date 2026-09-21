"use client";

import Link from "next/link";
import { Fragment } from "react";
import { Icon } from "@/components/ui/Icon";
import { StatStrip, type Stat } from "@/components/ui/StatStrip";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { date, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { DateRow, Empty, Hero, nowStatus, QuickActions, TimeRow } from "./parts";
import type { StudentDashboardData, StudentExamResult } from "./types";

const BAR_COLOURS = ["#2563eb", "#4e9f8d", "#8b75c6", "#e0915a", "#2563eb", "#4e9f8d"];
const AVATAR_TONES = ["", "mint", "lilac"];

/** SCR-036, live: GET /api/v1/student/dashboard and GET /api/v1/student/exams/{id} for the latest exam. */
export function StudentDashboard() {
  const dash = useApi<StudentDashboardData>("/api/v1/student/dashboard");
  const d = dash.data;
  const latest = d?.recent_exams[0];
  const result = useApi<StudentExamResult>(latest ? `/api/v1/student/exams/${latest.exam_id}` : null);
  const r = result.data;
  const subjects = (r?.subjects ?? []).filter((s) => s.marks_obtained !== null && s.max_marks > 0);

  const stats: Stat[] = [
    { label: "Attendance", value: d ? (d.attendance.marked_days ? pct(d.attendance.percent) : "—") : "…", note: d ? `${d.attendance.present} of ${d.attendance.marked_days} days present` : "This academic year" },
    { label: "Learning average", value: !d ? "…" : r && subjects.length ? pct(r.summary.percentage) : "—", note: latest ? latest.name : "No exam results yet" },
    { label: "Assignments due", value: d ? String(d.homework_due) : "…", note: d?.homework_overdue ? `${d.homework_overdue} overdue` : "Nothing overdue" },
    // Not wired: the mock's "Learning streak" — no endpoint; the latest result's grade stands in its place.
    { label: "Latest grade", value: !d ? "…" : r && subjects.length ? r.summary.overall_grade : "—", note: r ? (r.summary.is_pass ? "Passed" : "Needs another try") : "From your latest exam" },
  ];

  const teaching = d?.timetable.filter((p) => !p.is_break) ?? [];
  const hero = !d
    ? "Your learning journey continues."
    : `${teaching.length ? `${teaching.length} class${teaching.length === 1 ? "" : "es"} today` : "No classes today"}${
        d.homework_due ? ` and ${d.homework_due} piece${d.homework_due === 1 ? "" : "s"} of homework to hand in.` : "."
      }`;

  return (
    <>
      <Hero tone="student-hero" text={hero} cta={{ href: "/homework/student-homework-view", label: "Continue learning" }} />
      <ErrorNote>{dash.error ?? result.error}</ErrorNote>
      <StatStrip items={stats} />
      <QuickActions
        items={[
          ["/homework/student-homework-view", "file", "My homework"],
          ["/timetable/class-timetable", "calendar", "My timetable"],
          ["/examinations/student-result", "chart", "My results"],
          ["/library/library-catalogue", "book", "Library"],
        ]}
      />
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel title="Your learning progress" sub={latest ? `${latest.name} · Keep building on your strengths` : "Your latest exam"}>
            {subjects.length ? (
              subjects.slice(0, 6).map((s, i) => {
                const p = Math.round(((s.marks_obtained ?? 0) / s.max_marks) * 100);
                return (
                  <Fragment key={s.exam_paper_id}>
                    <div className="progress-label">
                      <span>{s.subject_name}</span>
                      <span>{`${p}%`}</span>
                    </div>
                    <div className="bar-track">
                      <i style={{ width: `${p}%`, background: BAR_COLOURS[i] }} />
                    </div>
                    <div style={{ height: "16px" }} />
                  </Fragment>
                );
              })
            ) : (
              <Empty>{dash.loading || result.loading ? "Loading…" : "Your marks will show here once a result is published."}</Empty>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Today’s classes" action={<Link href="/timetable/class-timetable" className="btn text">View all</Link>}>
            {d?.timetable.length ? (
              d.timetable.map((p) => (
                <TimeRow
                  key={p.period_number}
                  time={p.start_time}
                  title={p.is_break ? (p.label ?? "Break") : (p.subject_name ?? "Free period")}
                  sub={[d.class_name && `${d.class_name} ${d.section_name ?? ""}`.trim(), p.teacher_name].filter(Boolean).join(" · ")}
                  badge={nowStatus(p.start_time, p.end_time)}
                />
              ))
            ) : (
              <Empty>{d ? "No classes today." : "Loading…"}</Empty>
            )}
          </Panel>
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <Panel title="Homework due soon">
            {d?.homework.length ? (
              d.homework.slice(0, 4).map((h, i) => (
                <div className="event-row" key={h.homework_id}>
                  <span className={`avatar ${AVATAR_TONES[i % 3]}`}>
                    <Icon name="book" />
                  </span>
                  <div className="event-content">
                    <h4>{h.title}</h4>
                    <p>{`${h.subject_name ?? "—"} · Due ${date(h.due_date)}`}</p>
                  </div>
                  <Badge>{h.submitted ? "Submitted" : h.overdue ? "Overdue" : "Due soon"}</Badge>
                </div>
              ))
            ) : (
              <Empty>{d ? "No homework due. Well done." : "Loading…"}</Empty>
            )}
          </Panel>
        </div>
        <aside>
          {/* Not wired: the mock's "Coming up" events — the student portal has no calendar feed; its notices and recent exams stand in their place. */}
          <Panel title="From school">
            {d && (d.recent_exams.length || d.notices.length) ? (
              <>
                {d.notices.slice(0, 2).map((n) => (
                  <DateRow key={`n${n.notice_id}`} day={n.created_at} title={n.title} sub="School notice" />
                ))}
                {d.recent_exams.slice(0, 2).map((e) => (
                  <DateRow key={`e${e.exam_id}`} day={e.end_date} title={e.name} sub="Exam · results" href="/examinations/student-result" />
                ))}
              </>
            ) : (
              <Empty>{d ? "Nothing new from school." : "Loading…"}</Empty>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
