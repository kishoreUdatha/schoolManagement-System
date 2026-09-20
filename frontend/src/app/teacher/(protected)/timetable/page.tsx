"use client";

import { Calendar, Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type Slot = {
  entry_id: number;
  section_label: string;
  class_name: string;
  subject_name: string;
  subject_code: string;
  period_id: number;
  period_number: number;
  period_label: string | null;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  is_break: boolean;
  day_of_week: number;
  day_label: string;
  notes: string | null;
};

type DayBlock = {
  day_of_week: number;
  day_label: string;
  is_today: boolean;
  items: Slot[];
};

type Timetable = {
  today_day_of_week: number;
  today_label: string;
  current_time: string;
  today: Slot[];
  by_day: DayBlock[];
  next_class: Slot | null;
  total_entries: number;
};

function shortTime(t: string): string {
  // "09:00:00" → "09:00"
  return t?.slice(0, 5) ?? "";
}

function isNow(slot: Slot, now: string): boolean {
  return slot.start_time <= now && now < slot.end_time;
}

export default function TeacherTimetablePage() {
  const [data, setData] = useState<Timetable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<Timetable>("/api/v1/teacher/timetable")
      .then((r) => {
        setData(r.data);
        setSelectedDay(r.data.today_day_of_week);
      })
      .catch((e) => setError(apiError(e)));
  }, []);

  if (error) {
    return (
      <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
        {error}
      </div>
    );
  }
  if (!data) {
    return <div className="text-sm text-ink-muted">Loading…</div>;
  }

  const active = data.by_day.find((d) => d.day_of_week === selectedDay);
  const dayItems = active?.items ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">My timetable</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {data.total_entries === 0
            ? "Your classes aren't on the timetable yet — ask your school admin to publish it."
            : `${data.total_entries} class${data.total_entries === 1 ? "" : "es"} across the week.`}
        </p>
      </div>

      {/* Next-class hint */}
      {data.next_class && (
        <Card>
          <CardBody>
            <div className="flex items-start gap-3">
              <div className="rounded-[10px] bg-brand-50 p-2.5 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                <Clock className="h-[18px] w-[18px]" />
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
                  Next class
                </div>
                <div className="mt-1 text-[15px] font-extrabold text-ink">
                  {data.next_class.section_label} ·{" "}
                  {data.next_class.subject_name} ({data.next_class.subject_code})
                </div>
                <div className="mt-0.5 text-[12px] text-ink-muted">
                  P{data.next_class.period_number} ·{" "}
                  {shortTime(data.next_class.start_time)} –{" "}
                  {shortTime(data.next_class.end_time)}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Day-of-week tabs */}
      <div className="flex flex-wrap gap-1 rounded-[12px] border border-surface-border bg-surface-subtle p-1.5 text-[13px]">
        {data.by_day.map((d) => (
          <button
            key={d.day_of_week}
            type="button"
            onClick={() => setSelectedDay(d.day_of_week)}
            className={
              "rounded-lg px-4 py-2 font-bold transition-colors " +
              (selectedDay === d.day_of_week
                ? "bg-brand-600 text-white"
                : "text-ink-muted hover:bg-surface-hover hover:text-ink")
            }
          >
            {d.day_label}
            {d.is_today && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            )}
            {d.items.length > 0 && (
              <span className="ml-1.5 text-[11px] opacity-70">
                {d.items.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Calendar className="mr-2 inline h-[18px] w-[18px] text-brand-600 dark:text-brand-300" />
            {active?.day_label}
            {active?.is_today && (
              <Badge tone="brand" className="ml-2">
                today
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardBody>
          {dayItems.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-muted">
              No classes scheduled for {active?.day_label}.
            </p>
          ) : (
            <table className="min-w-full divide-y divide-surface-border text-[13px]">
              <thead className="text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                <tr>
                  <th className="px-4 py-3 font-bold">P #</th>
                  <th className="px-4 py-3 font-bold">Time</th>
                  <th className="px-4 py-3 font-bold">Section</th>
                  <th className="px-4 py-3 font-bold">Subject</th>
                  <th className="px-4 py-3 font-bold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {dayItems.map((s) => {
                  const now =
                    active?.is_today &&
                    isNow(s, data.current_time.slice(0, 8));
                  return (
                    <tr
                      key={s.entry_id}
                      className={
                        "hover:bg-surface-hover " +
                        (now ? "bg-brand-50 dark:bg-brand-500/10" : "")
                      }
                    >
                      <td className="px-4 py-3 font-bold tabular-nums text-ink">
                        {s.period_number}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink-muted">
                        {shortTime(s.start_time)} – {shortTime(s.end_time)}
                        {now && (
                          <Badge tone="emerald" className="ml-2">
                            now
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink">{s.section_label}</td>
                      <td className="px-4 py-3 text-ink">
                        <div className="font-bold">{s.subject_name}</div>
                        <div className="text-[11px] text-ink-subtle">
                          {s.subject_code}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-ink-muted">
                        {s.notes ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <p className="text-[12px] text-ink-subtle">
        Times are local. Free periods aren&apos;t shown.
      </p>
    </div>
  );
}
