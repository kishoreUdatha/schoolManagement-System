"use client";

import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { childPath, ChildScoped, clock, PmEmpty, PmError, PmLoading, todayIso } from "../home/parts";
import type { SectionTimetable, TimetableDay } from "./types";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** ISO weekday of a YYYY-MM-DD date, 1 = Monday … 7 = Sunday (the timetable's numbering). */
function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1;
}

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DAY_NAMES[new Date(y, m - 1, d).getDay()]}, ${d} ${MONTHS[m - 1]}`;
}

/**
 * PM-018. The child's timetable for a school day (today and the next two
 * weeks), with any cover the school has arranged for that date.
 */
export function Timetable() {
  return <ChildScoped render={(childId) => <TimetableFor childId={childId} />} />;
}

function TimetableFor({ childId }: { childId: number }) {
  const tt = useApi<SectionTimetable>(childPath(childId, "/timetable"));
  const [picked, setPicked] = useState<string | null>(null);

  // School days = weekdays that have periods, over the next 14 days.
  const weekdays = new Set((tt.data?.periods ?? []).map((p) => p.day_of_week));
  const dates = Array.from({ length: 15 }, (_, i) => todayIso(i)).filter((d) => weekdays.has(isoWeekday(d)));
  const day = picked ?? dates[0] ?? null;
  const d = useApi<TimetableDay>(tt.data && day ? childPath(childId, "/timetable/day") : null, { date: day });

  if (tt.error) {
    // The API answers 404 "Timetable is not published yet" until the school publishes it.
    return <PmEmpty title="Timetable not available">{tt.error}</PmEmpty>;
  }
  if (!tt.data) return <PmLoading />;
  if (!day) return <PmEmpty title="No periods yet">The school has not set up this class’s periods.</PmEmpty>;

  const today = todayIso();
  return (
    <>
      <label className="field">
        School day
        <select value={day} onChange={(e) => setPicked(e.target.value)}>
          {dates.map((x) => (
            <option key={x} value={x}>
              {`${dayLabel(x)}${x === today ? " (today)" : ""}`}
            </option>
          ))}
        </select>
      </label>
      <PmError>{d.error}</PmError>
      {!d.data && !d.error ? <PmLoading /> : null}
      {d.data?.holiday_name ? <PmEmpty title={d.data.holiday_name}>The school is closed on this day.</PmEmpty> : null}
      {d.data && !d.data.holiday_name
        ? d.data.slots.map((p) => {
            const time = `${clock(p.start_time, true)}–${clock(p.end_time, true)}`;
            if (p.is_break) {
              return (
                <div key={p.period_id} className="break-row">
                  {`${time} · ${p.label ?? "Break"}`}
                </div>
              );
            }
            const teacher = p.is_substituted ? (p.substitute_teacher_name ? `Cover: ${p.substitute_teacher_name}` : "Cover being arranged") : p.teacher_name;
            return (
              <div key={p.period_id} className="item">
                <span>
                  <strong>{p.subject_name ?? p.label ?? "Free period"}</strong>
                  <small>{[time, teacher, p.room_name].filter(Boolean).join(" · ")}</small>
                  {p.is_substituted && p.cover_note ? <small>{p.cover_note}</small> : null}
                </span>
                <span className={p.is_substituted ? "value warning" : "value"}>{p.is_substituted ? "Cover" : String(p.period_number).padStart(2, "0")}</span>
              </div>
            );
          })
        : null}
    </>
  );
}
