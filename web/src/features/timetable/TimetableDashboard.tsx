"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { DAY_NAME, DAY_SHORT, hhmm, schoolWeekday, todayIso } from "./shared";
import type { CoverDay, Dashboard, DayView } from "./types";

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

/**
 * SCR-120, live: GET /school/timetable-gen/dashboard (completeness and
 * clashes), /timetable-gen/coordinator (today's periods across sections)
 * and /cover/day (who is away today).
 */
export function TimetableDashboard() {
  const router = useRouter();
  const user = useSession()?.user;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const dash = useApi<Dashboard>("/api/v1/school/timetable-gen/dashboard");
  const day = useApi<DayView>("/api/v1/school/timetable-gen/coordinator", { day_of_week: schoolWeekday() });
  const cover = useApi<CoverDay>("/api/v1/school/cover/day", { date: todayIso() });

  const d = dash.data;
  const rows = d?.sections ?? [];
  const clashes = d?.clashes ?? [];
  const stats = [
    { label: "Sections finished", value: d ? `${d.complete} of ${rows.length}` : "…", note: "Every teaching slot filled" },
    { label: "Not started", value: d ? String(d.not_started) : "…", note: "Sections with an empty week" },
    { label: "Slots filled", value: d ? `${d.percent}%` : "…", note: d ? `${d.teaching_slots_per_week} teaching slots a week` : "Across all sections" },
    { label: "Conflicts", value: d ? String(clashes.length) : "…", note: "Teachers in two rooms at once" },
  ];

  const table: Row[] = rows.map((r) => [
    r.class_name,
    r.section_name,
    `${r.filled} / ${r.slots}`,
    `${r.percent}%`,
    r.empty === 0 ? "Complete" : r.filled === 0 ? "Not started" : `Pending · ${r.empty} free`,
  ]);

  // Today's periods, with how many sections have a lesson in each.
  const today = day.data;
  const nowHm = now ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` : "";
  const isToday = now ? (now.getDay() === 0 ? 7 : now.getDay()) === today?.day_of_week : false;
  const periods = (today?.periods ?? []).filter((p) => !p.is_break);
  const stateOf = (start: string, end: string) => {
    if (!isToday || !nowHm) return "Scheduled";
    if (nowHm >= end.slice(0, 5)) return "Done";
    if (nowHm >= start.slice(0, 5)) return "In progress";
    return "Upcoming";
  };

  const first = user?.full_name.split(/\s+/)[0];
  const hour = now?.getHours() ?? 9;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const c = cover.data;

  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <div className="eyebrow">{now ? `${DAY_NAME[now.getDay() === 0 ? 7 : now.getDay()].toUpperCase()}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}` : " "}</div>
          <h2>{`${greeting}${first ? `, ${first}` : ""}.`}</h2>
          <p>Here’s how far every section’s week has got, and anything that cannot stand.</p>
          <Link href={routeOf(121)} className="btn white">
            <Icon name="arrow" className="sm" />
            Open timetable setup
          </Link>
        </div>
        <HeroArt />
      </section>
      <ErrorNote>{dash.error ?? day.error}</ErrorNote>
      <StatStrip items={stats} />
      <div className="dashboard-actions">
        <span className="small strong muted">Quick actions</span>
        <div className="quick-row">
          <Link className="quick-action" href={routeOf(124)}>
            <Icon name="grid" />
            Generate timetable
          </Link>
          <Link className="quick-action" href={routeOf(122)}>
            <Icon name="clock" />
            Period setup
          </Link>
          <Link className="quick-action" href={routeOf(123)}>
            <Icon name="calendar" />
            Teacher availability
          </Link>
          <Link className="quick-action" href={routeOf(127)}>
            <Icon name="users" />
            Substitutions
          </Link>
        </div>
      </div>
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel title="Section by section" sub={d ? `${rows.length} sections · ${d.complete} finished` : "Loading…"} flush>
            <DataTable
              columns={["Class", "Section", "Filled", "Progress", "Status"]}
              rows={table}
              selectable={false}
              onView={(i) => router.push(`${routeOf(121)}?section=${rows[i].section_id}`)}
              empty={dash.loading ? "Loading sections…" : undefined}
              emptyState={{
                title: "No sections set up yet",
                note: "Timetable progress is tracked per class section. Add classes and sections under Academics to see them here.",
              }}
            />
          </Panel>
        </div>
        <aside>
          <Panel title="Today’s schedule" sub={today ? `${DAY_NAME[today.day_of_week]} · ${today.sections.length} sections` : undefined} action={<Link href={routeOf(126)} className="btn text">View all</Link>}>
            {periods.length ? (
              periods.map((p) => {
                const taught = today!.sections.filter((s) => s.lessons[String(p.period_number)]).length;
                const [h, m] = hhmm(p.start_time).split(":");
                return (
                  <div className="event-row" key={p.period_number}>
                    <div className="event-time">
                      {`${h}:${m}`}
                      <small style={{ display: "block", fontSize: "9px" }}>{Number(p.start_time.slice(0, 2)) < 12 ? "AM" : "PM"}</small>
                    </div>
                    <div className="event-content">
                      <h4>{p.label ?? `Period ${p.period_number}`}</h4>
                      <p>{`${taught} of ${today!.sections.length} sections have a lesson`}</p>
                    </div>
                    <span className="badge">{stateOf(p.start_time, p.end_time)}</span>
                  </div>
                );
              })
            ) : (
              <p className="muted">{day.loading ? "Loading…" : "No periods are set up for today."}</p>
            )}
          </Panel>
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <Panel title="Teacher clashes" sub="A teacher timetabled in more than one room at the same hour">
            {clashes.length ? (
              clashes.map((k, i) => (
                <div className="timeline-item" key={i}>
                  <span className="timeline-dot">
                    <Icon name="bell" />
                  </span>
                  <div>
                    <h4>{k.teacher_name ?? "A teacher"}</h4>
                    <p>{`${k.day_of_week ? DAY_SHORT[k.day_of_week] : "Unknown day"} · Period ${k.period_number ?? "?"} · ${k.sections} sections at once`}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">{dash.loading ? "Loading…" : "No clashes. Every teacher is in one room at a time."}</p>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Cover today" action={<Link href={routeOf(127)} className="btn text">Open</Link>}>
            {cover.error ? (
              <p className="muted">{cover.error}</p>
            ) : c ? (
              <>
                <div className="event-row">
                  <div className="calendar-tile">
                    {c.absent.length}
                    <small>away</small>
                  </div>
                  <div className="event-content">
                    <h4>{c.is_holiday ? "Holiday" : c.absent.length ? c.absent.map((a) => a.full_name).join(", ") : "Nobody is away"}</h4>
                    <p>{`${c.slots.length} lessons need cover`}</p>
                  </div>
                </div>
                <div className="event-row">
                  <div className="calendar-tile">
                    {c.uncovered}
                    <small>open</small>
                  </div>
                  <div className="event-content">
                    <h4>{c.uncovered ? "Still uncovered" : "Every slot has somebody"}</h4>
                    <p>{`${c.covered} covered by a substitute`}</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">Loading…</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
