"use client";

import Link from "next/link";
import { StatStrip, type Stat } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { dateTime, initials, label, money, pct } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { count, DateRow, Empty, Hero, isoWeekday, nowStatus, QuickActions, TimelineRow, TimeRow, todayIso } from "./parts";
import type { CalendarItem, Child, InboxItem, SectionTimetable } from "./types";

const TONES = ["mint", "lilac", "", "peach"];

function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return todayIso(d);
}

/** SCR-037, live: GET /api/v1/parent/me/children, …/children/{id}/timetable, /parent/me/notices, /notices/unread-count, /parent/me/calendar. */
export function ParentDashboard() {
  const children = useApi<Child[]>("/api/v1/parent/me/children");
  const unread = useApi<{ unread: number }>("/api/v1/parent/me/notices/unread-count");
  const inbox = useApi<InboxItem[]>("/api/v1/parent/me/notices", { limit: 3 });
  const calendar = useApi<CalendarItem[]>("/api/v1/parent/me/calendar", { start: todayIso(), end: inDays(60) });
  const kids = children.data ?? [];
  const first = kids[0];
  const timetable = useApi<SectionTimetable>(first ? `/api/v1/parent/me/children/${first.id}/timetable` : null);

  const withAttendance = kids.filter((k) => k.attendance_percent !== null);
  const avg = withAttendance.length ? withAttendance.reduce((n, k) => n + (k.attendance_percent ?? 0), 0) / withAttendance.length : null;
  const owed = kids.reduce((n, k) => n + (k.fees_pending_amount ?? 0), 0);

  const stats: Stat[] = [
    { label: "Children", value: children.data ? String(kids.length) : "…", note: kids.map((k) => k.full_name.split(" ")[0]).join(", ") || "Linked to your account" },
    { label: "Attendance", value: children.data ? pct(avg) : "…", note: kids.length > 1 ? "Average across your children" : "This academic year" },
    { label: "Pending fees", value: children.data ? money(owed) : "…", note: kids.length > 1 ? "All children together" : "Still to pay" },
    { label: "Unread messages", value: count(unread.data?.unread), note: "School notices" },
  ];

  // Today's periods for the first child, in order, with the subject taught in each.
  const today = isoWeekday();
  const tt = timetable.data;
  const periods = (tt?.periods ?? []).filter((p) => p.day_of_week === today).sort((a, b) => a.period_number - b.period_number);
  const entryOf = new Map((tt?.entries ?? []).map((e) => [e.period_id, e]));
  const events = (calendar.data ?? []).filter((c) => !c.is_cancelled && !c.is_draft).slice(0, 3);

  return (
    <>
      <Hero tone="parent-hero" text="Stay connected with your children’s learning, school updates and activities." cta={{ href: routeOf(57) + (first ? `?id=${first.id}` : ""), label: "View children" }} />
      <ErrorNote>{children.error ?? inbox.error}</ErrorNote>
      <StatStrip items={stats} />
      {/* The mock repeats the school admin's shortcuts here (add student, collect fee), which a parent cannot use; these are the parent menu's own. */}
      <QuickActions
        items={[
          [`${routeOf(60)}${first ? `?id=${first.id}` : ""}`, "check", "Attendance"],
          [routeOf(131), "book", "Homework"],
          [routeOf(78), "money", "Payments"],
          [routeOf(296), "message", "Notices"],
        ]}
      />
      <div className="two-col dashboard-grid" style={{ marginBottom: "20px" }}>
        <div>
          <Panel title="Your children">
            {kids.length ? (
              kids.map((k, i) => (
                <div className="event-row" key={k.id}>
                  <span className={`avatar ${TONES[i % 4]} large`}>{initials(k.full_name)}</span>
                  <div className="event-content">
                    <h3>{k.full_name}</h3>
                    <p>{`${k.section_label ?? "—"} · Attendance ${pct(k.attendance_percent)}${k.fees_pending_amount ? ` · ${money(k.fees_pending_amount)} due` : ""}`}</p>
                    <div className="gap" style={{ height: "8px" }} />
                    <Link href={`${routeOf(57)}?id=${k.id}`} className="btn">
                      View profile
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <Empty>{children.loading ? "Loading…" : "No children are linked to your account yet. Ask the school office to link them."}</Empty>
            )}
          </Panel>
        </div>
        <aside>
          <Panel title="Today’s schedule" sub={first ? `${first.full_name.split(" ")[0]} · ${first.section_label ?? ""}` : undefined} action={<Link href="/timetable/class-timetable" className="btn text">View all</Link>}>
            {periods.length ? (
              periods.map((p) => {
                const e = entryOf.get(p.id);
                return (
                  <TimeRow
                    key={p.id}
                    time={p.start_time}
                    title={p.is_break ? (p.label ?? "Break") : (e?.subject_name ?? "Free period")}
                    sub={[tt?.section_label, e?.room_name ?? e?.teacher_name].filter(Boolean).join(" · ")}
                    badge={nowStatus(p.start_time, p.end_time)}
                  />
                );
              })
            ) : (
              <Empty>{timetable.loading || children.loading ? "Loading…" : (timetable.error ?? "No classes today.")}</Empty>
            )}
          </Panel>
        </aside>
      </div>
      <div className="two-col dashboard-grid">
        <div>
          <Panel title="Recent activity">
            {inbox.data?.length ? (
              inbox.data.map((n) => <TimelineRow key={n.recipient_id} icon="message" title={n.title} sub={n.read_at ? "Notice · read" : "Notice · unread"} time={dateTime(n.sent_at)} />)
            ) : (
              <Empty>{inbox.loading ? "Loading…" : "No notices from school yet."}</Empty>
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
              <Empty>{calendar.loading ? "Loading…" : "Nothing on the school calendar in the next 60 days."}</Empty>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
