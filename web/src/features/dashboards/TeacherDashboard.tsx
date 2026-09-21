"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Chart } from "@/components/ui/Chart";
import { StatStrip, type Stat } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { count, DateRow, Empty, Hero, nowStatus, QuickActions, TimelineRow, TimeRow, todayIso } from "./parts";
import type { SectionAttendance, TeacherDashboardData, TeacherHomework, TeacherNotice } from "./types";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ATTENDED = ["present", "late", "half_day"];

/** The last six school days (Monday to Saturday), oldest first, ending today. */
function recentSchoolDays(): Date[] {
  const out: Date[] = [];
  const d = new Date();
  while (out.length < 6) {
    if (d.getDay() !== 0) out.unshift(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

/** Today's register for each section this teacher is class teacher of. */
function useRegisters(sections: number[]) {
  const [regs, setRegs] = useState<SectionAttendance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = sections.join(",");
  useEffect(() => {
    if (!key) {
      setRegs([]);
      return;
    }
    let live = true;
    Promise.all(key.split(",").map((id) => api.get<SectionAttendance>("/api/v1/teacher/attendance", { section_id: id, date: todayIso() })))
      .then((r) => live && setRegs(r))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [key]);
  return { regs, error };
}

/** One section's attendance over the last six school days. */
function useWeek(sectionId: number | undefined) {
  const [week, setWeek] = useState<{ label: string; pct: number | null }[] | null>(null);
  useEffect(() => {
    if (!sectionId) return;
    let live = true;
    const days = recentSchoolDays();
    Promise.all(
      days.map((d) =>
        api
          .get<SectionAttendance>("/api/v1/teacher/attendance", { section_id: sectionId, date: todayIso(d) })
          .then((r) => {
            const marked = r.rows.filter((x) => x.status);
            return marked.length ? (marked.filter((x) => ATTENDED.includes(x.status ?? "")).length / marked.length) * 100 : null;
          })
          .catch(() => null),
      ),
    ).then((pcts) => live && setWeek(days.map((d, i) => ({ label: WEEKDAY[d.getDay()], pct: pcts[i] }))));
    return () => {
      live = false;
    };
  }, [sectionId]);
  return week;
}

/** SCR-035, live: GET /api/v1/teacher/dashboard, /teacher/attendance, /teacher/notices, /teacher/homework. */
export function TeacherDashboard() {
  const dash = useApi<TeacherDashboardData>("/api/v1/teacher/dashboard");
  const notices = useApi<TeacherNotice[]>("/api/v1/teacher/notices");
  const homework = useApi<TeacherHomework[]>("/api/v1/teacher/homework");
  const d = dash.data;
  const sections = d?.class_teacher_of ?? [];
  const { regs, error: regError } = useRegisters(sections.map((s) => s.section_id));
  const home = sections[0];
  const week = useWeek(home?.section_id);

  const teaching = d?.todays_classes.filter((c) => !c.is_break) ?? [];
  const pending = regs?.filter((r) => !r.is_holiday && r.rows.some((x) => !x.status)) ?? null;

  const stats: Stat[] = [
    { label: "Classes today", value: d ? String(teaching.length) : "…", note: teaching[0] ? `First at ${teaching[0].start_time}` : "Nothing timetabled today" },
    {
      label: "Attendance pending",
      value: pending ? String(pending.length) : "…",
      note: pending?.length ? pending.map((r) => r.section_label ?? "").join(", ") : sections.length ? "Registers complete for today" : "Not a class teacher",
    },
    { label: "Class teacher of", value: d ? String(sections.length) : "…", note: sections.map((s) => s.section_label).join(", ") || "No section assigned" },
    { label: "Unread notices", value: count(d?.unread_notices), note: "In your inbox" },
  ];

  const hero = !d
    ? "Here is your day."
    : `${teaching.length ? `Your first class begins at ${teaching[0].start_time}.` : "Nothing is timetabled for you today."}${
        pending?.length ? ` You have ${pending.length} attendance register${pending.length === 1 ? "" : "s"} to complete.` : ""
      }`;

  const upcoming = (homework.data ?? [])
    .filter((h) => !h.is_past_due && !h.is_closed)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 3);
  const plotted = week?.filter((w) => w.pct !== null) ?? [];

  return (
    <>
      <Hero text={hero} cta={{ href: "/attendance/daily-class-attendance", label: "Mark attendance" }} />
      <ErrorNote>{dash.error ?? regError ?? notices.error}</ErrorNote>
      <StatStrip items={stats} />
      <QuickActions
        items={[
          ["/attendance/daily-class-attendance", "check", "Attendance"],
          ["/homework/create-homework", "file", "Homework"],
          ["/examinations/marks-entry", "chart", "Enter marks"],
          ["/timetable/class-timetable", "calendar", "Timetable"],
        ]}
      />
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel
            title="Attendance overview"
            sub={home ? `Last six school days · ${home.section_label}` : "Your class"}
            action={
              <div className="chart-key">
                <span>Present %</span>
              </div>
            }
          >
            {plotted.length ? (
              <Chart kind="line" labels={plotted.map((w) => w.label)} values={plotted.map((w) => Math.round(w.pct ?? 0))} />
            ) : (
              <Empty>{!d || (home && !week) ? "Loading attendance…" : home ? "No attendance marked in the last six school days." : "You are not class teacher of a section."}</Empty>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Today’s classes" action={<Link href="/timetable/class-timetable" className="btn text">View all</Link>}>
            {d?.todays_classes.length ? (
              d.todays_classes.map((c) => (
                <TimeRow
                  key={c.period_id}
                  time={c.start_time}
                  title={c.is_break ? "Break" : c.subject_name}
                  sub={`${c.section_label} · Period ${c.period_number}`}
                  badge={nowStatus(c.start_time, c.end_time)}
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
          <Panel title="Recent activity">
            {notices.data?.length ? (
              notices.data.slice(0, 3).map((n) => (
                <TimelineRow
                  key={n.id}
                  icon="message"
                  title={n.title}
                  sub={`${n.audience_section_label ?? n.audience_class_name ?? n.audience_student_label ?? label(n.audience)} · ${n.recipient_count} recipient(s)`}
                  time={dateTime(n.sent_at ?? n.scheduled_at)}
                />
              ))
            ) : (
              <Empty>{notices.loading ? "Loading…" : "You have not sent any notices yet."}</Empty>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Coming up">
            {upcoming.length ? (
              upcoming.map((h) => <DateRow key={h.id} day={h.due_date} title={h.title} sub={`Homework due · ${h.subject_name} · ${h.class_name}`} href="/homework/homework-list" />)
            ) : (
              <Empty>{homework.loading ? "Loading…" : "No homework falling due."}</Empty>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
