"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type CalendarHoliday = {
  id: number;
  name: string;
  type: "national" | "school" | "vacation";
  start_date: string;
  end_date: string;
};

interface Props {
  year: number;
  month: number; // 1-12
  holidays: CalendarHoliday[];
  workingDays?: string[]; // e.g. ["MON","TUE",...] from school profile
  onSelectHoliday?: (h: CalendarHoliday) => void;
  onClickDate?: (iso: string) => void;
}

const typeTone: Record<CalendarHoliday["type"], string> = {
  national: "bg-rose-100 text-rose-800 ring-rose-300",
  school: "bg-amber-100 text-amber-800 ring-amber-300",
  vacation: "bg-emerald-100 text-emerald-800 ring-emerald-300",
};

const dayCodeMap = ["", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export function HolidayCalendar({
  year,
  month,
  holidays,
  workingDays,
  onSelectHoliday,
  onClickDate,
}: Props) {
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const last = new Date(Date.UTC(year, month, 0));
    // ISO weekday: Mon=1..Sun=7
    const firstWeekday = ((first.getUTCDay() + 6) % 7) + 1;
    const daysInMonth = last.getUTCDate();
    const grid: ({ iso: string; day: number } | null)[] = [];
    for (let i = 1; i < firstWeekday; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const m = String(month).padStart(2, "0");
      const day = String(d).padStart(2, "0");
      grid.push({ iso: `${year}-${m}-${day}`, day: d });
    }
    while (grid.length % 7) grid.push(null);
    return grid;
  }, [year, month]);

  // Map ISO date -> all holidays that include it
  const holidaysByDate = useMemo(() => {
    const map = new Map<string, CalendarHoliday[]>();
    holidays.forEach((h) => {
      const start = new Date(h.start_date + "T00:00:00Z");
      const end = new Date(h.end_date + "T00:00:00Z");
      for (
        let d = new Date(start);
        d <= end;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const iso = d.toISOString().slice(0, 10);
        const arr = map.get(iso) ?? [];
        arr.push(h);
        map.set(iso, arr);
      }
    });
    return map;
  }, [holidays]);

  const workingSet = new Set(workingDays ?? []);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-xs font-medium uppercase text-slate-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c, i) => {
          if (!c)
            return (
              <div
                key={i}
                className="aspect-square border-b border-r border-slate-100 bg-slate-50"
              />
            );
          const dayCol = ((i % 7) + 1) as number; // 1-7 Mon-Sun
          const dayCode = dayCodeMap[dayCol];
          const isWorking = workingSet.size === 0 || workingSet.has(dayCode);
          const dayHolidays = holidaysByDate.get(c.iso) ?? [];
          const main = dayHolidays[0];
          const today = new Date().toISOString().slice(0, 10) === c.iso;
          return (
            <button
              key={i}
              onClick={() =>
                main && onSelectHoliday
                  ? onSelectHoliday(main)
                  : onClickDate?.(c.iso)
              }
              className={cn(
                "relative flex flex-col items-start gap-1 border-b border-r border-slate-100 px-2 py-1.5 text-left hover:bg-slate-50",
                !isWorking && "bg-slate-50",
                today && "ring-2 ring-brand-400 ring-inset"
              )}
            >
              <span
                className={cn(
                  "text-xs font-medium",
                  today ? "text-brand-700" : "text-slate-600"
                )}
              >
                {c.day}
              </span>
              {main && (
                <span
                  className={cn(
                    "max-w-full truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1",
                    typeTone[main.type]
                  )}
                >
                  {main.name}
                  {dayHolidays.length > 1 && ` +${dayHolidays.length - 1}`}
                </span>
              )}
              {!main && !isWorking && (
                <span className="text-[10px] text-slate-400">weekend</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
