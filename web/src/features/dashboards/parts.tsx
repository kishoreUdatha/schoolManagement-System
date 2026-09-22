"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { useApi } from "@/lib/useApi";
import { useHydrated, useSession } from "@/lib/useSession";
import type { TodaySchedule } from "./types";

/*
 * The pieces every role dashboard shares, in the mocks' markup: the hero,
 * the quick-action row, and the three kinds of row the panels are built of
 * (a timed row, a dated row, a timeline entry).
 */

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Today as the school's calendar has it, in the viewer's time zone: "2026-09-21". */
export function todayIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ISO weekday, 1 = Monday … 7 = Sunday, as the timetable stores it. */
export function isoWeekday(d = new Date()): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

/** The hero's greeting: the signed-in person's first name and the date. */
export function useGreeting() {
  const s = useSession();
  // The server renders before we know the viewer's clock; say the date once hydrated.
  const hydrated = useHydrated();
  const now = new Date();
  const h = now.getHours();
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const first = s?.user.full_name?.trim().split(/\s+/)[0];
  return {
    eyebrow: hydrated ? `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}` : " ",
    title: !hydrated ? "Welcome." : first ? `Good ${part}, ${first}.` : `Good ${part}.`,
  };
}

export function Hero({ tone = "", text, cta }: { tone?: string; text: ReactNode; cta: { href: string; label: string } }) {
  const g = useGreeting();
  return (
    <section className={`hero ${tone}`}>
      <div className="hero-content">
        <div className="eyebrow">{g.eyebrow}</div>
        <h2>{g.title}</h2>
        <p>{text}</p>
        <Link href={cta.href} className="btn white">
          <Icon name="arrow" className="sm" />
          {cta.label}
        </Link>
      </div>
      <HeroArt />
    </section>
  );
}

export function QuickActions({ items }: { items: [href: string, icon: IconName, label: string][] }) {
  return (
    <div className="dashboard-actions">
      <span className="small strong muted">Quick actions</span>
      <div className="quick-row">
        {items.map(([href, icon, text]) => (
          <Link key={href + text} className="quick-action" href={href}>
            <Icon name={icon} />
            {text}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** "08:30" or "08:30:00" -> ["08:30", "AM"]. */
function clock(t: string): [string, string] {
  const [hh, mm] = t.split(":").map(Number);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return [`${String(h12).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, hh < 12 ? "AM" : "PM"];
}

/** A row led by a time of day (today's classes, today's schedule). No time: an all-day or to-do line. */
export function TimeRow({ time, title, sub, badge, untimed = "All day" }: { time: string | null; title: string; sub: string; badge?: string; untimed?: string }) {
  const [t, ap] = time ? clock(time) : [untimed, ""];
  return (
    <div className="event-row">
      <div className="event-time">
        {t}
        {ap ? <small style={{ display: "block", fontSize: "9px" }}>{ap}</small> : null}
      </div>
      <div className="event-content">
        <h4>{title}</h4>
        <p>{sub}</p>
      </div>
      {badge ? <Badge>{badge}</Badge> : null}
    </div>
  );
}

/** Where a timed item stands against the clock right now. */
export function nowStatus(start: string, end: string): string {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const m = (t: string) => {
    const [h, mm] = t.split(":").map(Number);
    return h * 60 + mm;
  };
  if (mins < m(start)) return "Upcoming";
  if (mins <= m(end)) return "In progress";
  return "Done";
}

/**
 * "Today's schedule", live: GET /api/v1/school/insights/schedule/today. The
 * head and the office get the whole school's timetable for the day; anyone
 * else their own lessons and meetings; both with today's calendar events.
 * `todo` lines (untimed jobs) follow the timed ones.
 */
export function TodaySchedulePanel({ href = "/timetable/class-timetable", todo = [], limit = 4 }: { href?: string; todo?: { title: string; sub: string; badge?: string }[]; limit?: number }) {
  const s = useApi<TodaySchedule>("/api/v1/school/insights/schedule/today");
  const d = s.data;
  const items = d?.items ?? [];
  // Show what is on now and next, not the morning that has gone.
  const upcoming = items.filter((i) => !i.end_time || nowStatus(i.start_time ?? "00:00", i.end_time) !== "Done");
  const shown = (upcoming.length ? upcoming : items).slice(0, limit);
  const sub = d?.holiday ? `Holiday · ${d.holiday}` : d?.scope === "school" ? "Whole school" : d ? "Your day" : undefined;
  return (
    <Panel title="Today’s schedule" sub={sub} action={<Link href={href} className="btn text">View all</Link>}>
      {shown.map((i, n) => (
        <TimeRow
          key={`t${n}`}
          time={i.start_time}
          title={i.title}
          sub={i.sub}
          badge={i.start_time && i.end_time ? nowStatus(i.start_time, i.end_time) : i.kind === "break" ? "Break" : undefined}
        />
      ))}
      {todo.map((t, n) => (
        <TimeRow key={`d${n}`} time={null} untimed="To do" title={t.title} sub={t.sub} badge={t.badge ?? "Pending"} />
      ))}
      {!shown.length && !todo.length ? <Empty>{s.loading ? "Loading…" : (s.error ?? (d?.holiday ? `${d.holiday} — no classes today.` : "Nothing on the timetable or calendar today."))}</Empty> : null}
    </Panel>
  );
}

/** A row led by a date tile (coming up: exams, holidays, events). */
export function DateRow({ day, title, sub, href }: { day: string; title: string; sub: string; href?: string }) {
  const [, m, d] = day.slice(0, 10).split("-").map(Number);
  return (
    <div className="event-row">
      <div className="calendar-tile">
        {d}
        <small>{SHORT[(m || 1) - 1]}</small>
      </div>
      <div className="event-content">
        <h4>{title}</h4>
        <p>{sub}</p>
      </div>
      {href ? (
        <Link href={href} className="btn text">
          View
        </Link>
      ) : null}
    </div>
  );
}

/** A line in "Recent activity". */
export function TimelineRow({ icon, title, sub, time }: { icon: IconName; title: string; sub: string; time?: string }) {
  return (
    <div className="timeline-item">
      <span className="timeline-dot">
        <Icon name={icon} />
      </span>
      <div>
        <h4>{title}</h4>
        <p>{sub}</p>
      </div>
      {time ? <time>{time}</time> : null}
    </div>
  );
}

/** A plain line inside a panel when there is nothing to list. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>;
}

/** The last `n` months as "YYYY-MM", oldest first, ending with this month. */
export function lastMonths(n = 6, d = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** "2026-09" -> "Sep". */
export function monthLabel(ym: string): string {
  return SHORT[Number(ym.slice(5, 7)) - 1] ?? ym;
}

/** Whole numbers the Indian way; undefined while loading. */
export function count(v: number | undefined | null): string {
  return v === undefined || v === null ? "…" : v.toLocaleString("en-IN");
}
