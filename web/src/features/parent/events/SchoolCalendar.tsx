"use client";

/*
 * PM-037 · School calendar: holidays, exams, events, PTMs and the parent's own
 * PTM bookings (GET /parent/me/calendar), a week at a time with what is
 * coming up from the chosen day.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useApi } from "@/lib/useApi";
import { hhmm, PmError, PmLoading, useGoTo } from "../comms/ui";
import { dayLabel, iso, monthTitle, type CalendarItem } from "./common";

const ICONS: Record<string, [string, ReactNode]> = {
  ptm: [
    "blue",
    <>
      <circle cx="9" cy="7" r="3" />
      <circle cx="17" cy="8" r="2.5" opacity=".55" />
      <path d="M3 20v-4c0-4 12-4 12 0v4zM16 13c3-1 6 1 6 4v3h-5z" />
    </>,
  ],
  event: [
    "green",
    <>
      <path d="M21 3C7 1 2 8 6 16c5 6 16 1 15-13" />
      <path d="m3 22 13-13" fill="none" stroke="currentColor" strokeWidth="2" />
    </>,
  ],
  exam: [
    "purple",
    <>
      <path d="M5 3h10l5 5v13H5z" />
      <path d="M15 3v6h5" className="cut" />
      <path d="M8 12h8M8 16h6" className="cut" />
    </>,
  ],
  holiday: [
    "amber",
    <>
      <rect x="3" y="5" width="18" height="17" rx="3" />
      <path d="M3 10h18M8 2v6M16 2v6" className="cut" />
      <rect x="7" y="13" width="4" height="4" rx="1" className="cutfill" />
    </>,
  ],
};
ICONS.ptm_slot = ICONS.ptm;

const WEEK = ["S", "M", "T", "W", "T", "F", "S"];

function when(i: CalendarItem): string {
  const days = i.end_date !== i.start_date ? `${dayLabel(i.start_date)} – ${dayLabel(i.end_date)}` : dayLabel(i.start_date);
  return `${days}${i.start_time ? ` · ${hhmm(i.start_time)}` : ""}${i.detail ? ` · ${i.detail}` : ""}${i.is_cancelled ? " · cancelled" : ""}`;
}

export function SchoolCalendar() {
  const goTo = useGoTo();
  const [day, setDay] = useState(() => new Date(new Date().toDateString()));
  const monthStart = new Date(day.getFullYear(), day.getMonth(), 1);
  const rangeEnd = new Date(day.getFullYear(), day.getMonth() + 2, 0); // end of next month
  const cal = useApi<CalendarItem[]>("/api/v1/parent/me/calendar", { start: iso(monthStart), end: iso(rangeEnd) });

  const week = useMemo(() => {
    const s = new Date(day);
    s.setDate(day.getDate() - ((day.getDay() + 6) % 7)); // Monday
    return Array.from({ length: 7 }, (_, k) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + k));
  }, [day]);

  const from = iso(day);
  const items = (cal.data ?? []).filter((i) => !i.is_draft && i.end_date >= from);
  const holidays = items.filter((i) => i.type === "holiday");
  const upcoming = items.filter((i) => i.type !== "holiday");
  const busy = new Set((cal.data ?? []).flatMap((i) => (i.start_date === i.end_date ? [i.start_date] : [i.start_date, i.end_date])));

  const shiftMonth = (n: number) => setDay(new Date(day.getFullYear(), day.getMonth() + n, 1));
  const open = (i: CalendarItem) => {
    if (i.type === "event") goTo(38, { id: i.id });
    else if (i.type === "ptm") goTo(39);
    else if (i.type === "ptm_slot") goTo(40, { slot: i.id });
    else if (i.type === "exam") goTo(20);
  };

  return (
    <>
      <div className="month-selector">
        <button className="quiet-link" onClick={() => goTo(18)}>
          Timetable
        </button>
        <span>
          <button className="quiet-link" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
            ‹
          </button>
          <b>{monthTitle(day)}</b>
          <button className="quiet-link" aria-label="Next month" onClick={() => shiftMonth(1)}>
            ›
          </button>
        </span>
      </div>
      <div className="week-strip">
        {week.map((d) => (
          <span key={iso(d)} className={iso(d) === from ? "selected" : ""} role="button" tabIndex={0} onClick={() => setDay(d)} onKeyDown={(e) => e.key === "Enter" && setDay(d)} aria-label={dayLabel(iso(d))}>
            <small>{WEEK[d.getDay()]}</small>
            <b style={busy.has(iso(d)) ? { textDecoration: "underline" } : undefined}>{d.getDate()}</b>
          </span>
        ))}
      </div>
      <div className="section-head">
        <h3>Coming up</h3>
      </div>
      <PmError>{cal.error}</PmError>
      {cal.loading && !cal.data ? <PmLoading /> : null}
      {cal.data && !upcoming.length ? <p className="muted">{`Nothing scheduled from ${dayLabel(from)} to the end of ${monthTitle(rangeEnd)}.`}</p> : null}
      {upcoming.length ? (
        <div className="row-group">
          {upcoming.map((i) => {
            const [color, icon] = ICONS[i.type] ?? ICONS.event;
            const action = i.type === "ptm" ? "Book" : i.type === "event" ? "Details" : i.type === "ptm_slot" ? "Booked" : "";
            return (
              <button key={`${i.type}${i.id}`} className="v-row" onClick={() => open(i)}>
                <span className={`v-icon ${color}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {icon}
                  </svg>
                </span>
                <span className="v-row-copy">
                  <strong>{i.title}</strong>
                  <small>{when(i)}</small>
                </span>
                <span className="v-row-value">{action}</span>
                <span className="v-icon neutral mini">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {holidays.map((h) => (
        <div className="holiday-note" key={`h${h.id}`}>
          <span className="v-icon amber">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {ICONS.holiday[1]}
            </svg>
          </span>
          <span>
            <b>{h.title}</b>
            <small>{`${when(h)} · School holiday`}</small>
          </span>
        </div>
      ))}
    </>
  );
}
