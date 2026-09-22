"use client";

import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { childPath, ChildScoped, clock, PmEmpty, PmLoading } from "../home/parts";
import type { SectionTimetable } from "./types";

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Today as ISO weekday, 1 = Monday … 7 = Sunday (the timetable's numbering). */
const isoToday = () => ((new Date().getDay() + 6) % 7) + 1;

/** PM-018. The child's section timetable, one school day at a time. */
export function Timetable() {
  return <ChildScoped render={(childId) => <TimetableFor childId={childId} />} />;
}

function TimetableFor({ childId }: { childId: number }) {
  const tt = useApi<SectionTimetable>(childPath(childId, "/timetable"));
  const [picked, setPicked] = useState<number | null>(null);

  if (tt.error) {
    // The API answers 404 "Timetable is not published yet" until the school publishes it.
    return <PmEmpty title="Timetable not available">{tt.error}</PmEmpty>;
  }
  if (!tt.data) return <PmLoading />;

  const days = Array.from(new Set(tt.data.periods.map((p) => p.day_of_week))).sort((a, b) => a - b);
  if (!days.length) return <PmEmpty title="No periods yet">The school has not set up this class’s periods.</PmEmpty>;
  const day = picked ?? (days.includes(isoToday()) ? isoToday() : days[0]);
  const periods = tt.data.periods.filter((p) => p.day_of_week === day).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const byPeriod = new Map(tt.data.entries.map((e) => [e.period_id, e]));

  return (
    <>
      <label className="field">
        School day
        <select value={day} onChange={(e) => setPicked(Number(e.target.value))}>
          {days.map((d) => (
            <option key={d} value={d}>
              {`${DAY_NAMES[d]}${d === isoToday() ? " (today)" : ""}`}
            </option>
          ))}
        </select>
      </label>
      {periods.map((p) => {
        const time = `${clock(p.start_time, true)}–${clock(p.end_time, true)}`;
        if (p.is_break) {
          return (
            <div key={p.id} className="break-row">
              {`${time} · ${p.label ?? "Break"}`}
            </div>
          );
        }
        const e = byPeriod.get(p.id);
        return (
          <div key={p.id} className="item">
            <span>
              <strong>{e?.subject_name ?? p.label ?? "Free period"}</strong>
              <small>{[time, e?.teacher_name, e?.room_name].filter(Boolean).join(" · ")}</small>
            </span>
            <span className="value">{String(p.period_number).padStart(2, "0")}</span>
          </div>
        );
      })}
    </>
  );
}
