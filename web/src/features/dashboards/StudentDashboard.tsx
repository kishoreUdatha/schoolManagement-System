"use client";

import Link from "next/link";
import { Fragment } from "react";
import { Icon } from "@/components/ui/Icon";
import { StatStrip, type Stat } from "@/components/ui/StatStrip";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { date, label, pct } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { DateRow, Empty, Hero, nowStatus, QuickActions, TimeRow, todayIso } from "./parts";
import type { CalendarItem, StudentDashboardData, StudentExamResult } from "./types";

const BAR_COLOURS = ["#2563eb", "#4e9f8d", "#8b75c6", "#e0915a", "#2563eb", "#4e9f8d"];
const AVATAR_TONES = ["", "mint", "lilac"];

function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return todayIso(d);
}

/** SCR-036, live: GET /api/v1/student/dashboard, GET /api/v1/student/exams/{id} for the latest exam, and GET /api/v1/student/calendar. */
export function StudentDashboard() {
  const dash = useApi<StudentDashboardData>("/api/v1/student/dashboard");
  const calendar = useApi<CalendarItem[]>("/api/v1/student/calendar", { start: todayIso(), end: inDays(60) });
  const events = (calendar.data ?? []).filter((c) => !c.is_cancelled && !c.is_draft).slice(0, 3);
  const d = dash.data;
  const latest = d?.recent_exams[0];
  const result = useApi<StudentExamResult>(latest ? `/api/v1/student/exams/${latest.exam_id}` : null);
  const r = result.data;
  const subjects = (r?.subjects ?? []).filter((s) => s.marks_obtained !== null && s.max_marks > 0);

  const stats: Stat[] = [
    { label: "Attendance", value: d ? (d.attendance.marked_days ? pct(d.attendance.percent) : "—") : "…", note: d ? `${d.attendance.present} of ${d.attendance.marked_days} days present` : "This academic year" },
    { label: "Learning average", value: !d ? "…" : r && subjects.length ? pct(r.summary.percentage) : "—", note: latest ? latest.name : "No exam results yet" },
    { label: "Assignments due", value: d ? String(d.homework_due) : "…", note: d?.homework_overdue ? `${d.homework_overdue} overdue` : "Nothing overdue" },
    (() => {
      const s = d?.learning_streak;
      return {
        label: "Learning streak",
        value: !d ? "…" : s ? `${s.count} in a row` : "—",
        note: !s || !s.set ? "Homework handed in on time, in a row" : s.count ? `Homework on time since ${date(s.since)}` : `${s.on_time} of ${s.set} handed in on time`,
      };
    })(),
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
          <Panel title="Coming up">
            {events.length ? (
              events.map((c) => (
                <DateRow key={`${c.type}${c.id}`} day={c.start_date} title={c.title} sub={[label(c.type), c.start_time?.slice(0, 5), c.detail].filter(Boolean).join(" · ")} />
              ))
            ) : (
              <Empty>{calendar.loading ? "Loading…" : (calendar.error ?? "Nothing on the school calendar in the next 60 days.")}</Empty>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
