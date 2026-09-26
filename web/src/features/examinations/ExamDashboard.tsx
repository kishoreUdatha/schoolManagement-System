"use client";

import Link from "next/link";
import { Chart } from "@/components/ui/Chart";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { date, pct } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { clock, ExamSelects, useExamChoice } from "./common";
import type { Datesheet, ExamDashboard as Dashboard } from "./types";
import { useGreeting } from "@/features/dashboards/parts";


/** SCR-138, live: GET /school/exams, /school/exam-ops/{id}/dashboard and /datesheet. */
export function ExamDashboard() {
  const c = useExamChoice();
  const dash = useApi<Dashboard>(c.examId ? `/api/v1/school/exam-ops/${c.examId}/dashboard` : null);
  const sheet = useApi<Datesheet>(c.examId ? `/api/v1/school/exam-ops/${c.examId}/datesheet` : null);
  const d = dash.data;
  // name and date only once hydrated: the server renders before it knows the viewer or their clock
  const g = useGreeting();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const upcoming = c.exams.filter((e) => e.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const awaiting = d ? d.rows.filter((r) => r.marks_complete && !r.verified).length : undefined;
  const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));

  const stats = [
    { label: "Upcoming exams", value: n(c.examsLoading ? undefined : upcoming.length), note: "In the selected academic year" },
    { label: "Students registered", value: n(d?.candidates), note: d ? `Across ${d.papers} paper${d.papers === 1 ? "" : "s"}` : "Candidates for this exam" },
    { label: "Marks entered", value: d ? pct(d.marks_percent, 0) : "…", note: d ? `${d.marks_entered.toLocaleString("en-IN")} of ${d.candidates.toLocaleString("en-IN")} entries` : "For this exam" },
    { label: "Awaiting verification", value: n(awaiting), note: "Fully marked, not signed off" },
  ];

  // Marks entered per paper, the first six papers, as a share of candidates.
  const chartRows = (d?.rows ?? []).slice(0, 6);
  const nextPapers = (sheet.data?.days ?? []).filter((day) => day.date >= today).flatMap((day) => day.papers).slice(0, 3);

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow">{g.eyebrow}</div>
          <h2>{g.title}</h2>
          <p>{d ? `${d.exam_name}: ${d.ready_to_publish ? "ready to publish." : `${d.blockers.length} thing${d.blockers.length === 1 ? "" : "s"} outstanding before results can go out.`}` : "Here’s where your examinations stand."}</p>
          <Link href={`${routeOf(141)}${c.examId ? `?id=${c.examId}` : ""}`} className="btn white">
            <Icon name="arrow" className="sm" />
            View exam schedule
          </Link>
        </div>
        <HeroArt />
      </section>
      <div className="filterbar">
        <ExamSelects c={c} />
      </div>
      <ErrorNote>{c.error ?? dash.error}</ErrorNote>
      <StatStrip items={stats} />
      <div className="dashboard-actions">
        <span className="small strong muted">Quick actions</span>
        <div className="quick-row">
          <Link className="quick-action" href={routeOf(140)}>
            <Icon name="plus" />
            Create exam
          </Link>
          <Link className="quick-action" href={`${routeOf(142)}${c.examId ? `?id=${c.examId}` : ""}`}>
            <Icon name="building" />
            Allocate rooms
          </Link>
          <Link className="quick-action" href={`${routeOf(148)}${c.examId ? `?id=${c.examId}` : ""}`}>
            <Icon name="check" />
            Verify marks
          </Link>
          <Link className="quick-action" href={`${routeOf(150)}`}>
            <Icon name="chart" />
            Publish results
          </Link>
        </div>
      </div>
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel
            title="Marks entry by paper"
            sub={d ? `${d.exam_name} · share of candidates marked` : "Selected exam"}
            action={
              <div className="chart-key">
                <span>Marked</span>
              </div>
            }
          >
            {chartRows.length ? (
              <Chart
                kind="line"
                labels={chartRows.map((r) => r.subject_code ?? r.subject_name.slice(0, 8))}
                values={chartRows.map((r) => (r.candidates ? Math.round((r.marks_entered / r.candidates) * 100) : 0))}
              />
            ) : (
              <p className="muted">{dash.loading ? "Loading…" : "No papers have been added to this exam yet."}</p>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Next papers" action={<Link href={`${routeOf(141)}${c.examId ? `?id=${c.examId}` : ""}`} className="btn text">View all</Link>}>
            {nextPapers.length ? (
              nextPapers.map((p) => {
                const [time, ampm] = clock(p.start_time).split(" ");
                return (
                  <div className="event-row" key={p.paper_id}>
                    <div className="event-time">
                      {p.start_time ? time : date(p.exam_date).slice(0, 6)}
                      <small style={{ display: "block", fontSize: "9px" }}>{p.start_time ? ampm : ""}</small>
                    </div>
                    <div className="event-content">
                      <h4>{p.subject_name}</h4>
                      <p>{`${p.class_name ?? "—"} · ${date(p.exam_date)}`}</p>
                    </div>
                    <Badge>{p.has_time ? "Scheduled" : "Time pending"}</Badge>
                  </div>
                );
              })
            ) : (
              <p className="muted">{sheet.loading ? "Loading…" : "No papers left to sit in this exam."}</p>
            )}
          </Panel>
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <Panel title="Before results can be published">
            {d?.blockers.length ? (
              d.blockers.map((b) => (
                <div className="timeline-item" key={b.kind}>
                  <span className="timeline-dot">
                    <Icon name="bell" />
                  </span>
                  <div>
                    <h4>{b.detail}</h4>
                    <p>{`${b.count} to resolve`}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">{dash.loading ? "Loading…" : d ? (d.is_published ? "Results are published." : "Nothing outstanding. Ready to publish.") : "Choose an exam."}</p>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Coming up">
            {upcoming.length ? (
              upcoming.slice(0, 3).map((e) => (
                <div className="event-row" key={e.id}>
                  <div className="calendar-tile">
                    {e.start_date.slice(8, 10)}
                    <small>{date(e.start_date).slice(3, 6)}</small>
                  </div>
                  <div className="event-content">
                    <h4>{e.name}</h4>
                    <p>{`${date(e.start_date)} to ${date(e.end_date)} · ${e.papers_count} paper${e.papers_count === 1 ? "" : "s"}`}</p>
                  </div>
                  <button type="button" className="btn text" onClick={() => c.setExam(e.id)}>
                    View
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">{c.examsLoading ? "Loading…" : "No upcoming exams this year."}</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
