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
      <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
        <h1 className="text-2xl font-bold text-ink">My timetable</h1>
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
              <div className="rounded-full bg-brand-500/20 p-2 text-brand-400 ring-1 ring-brand-500/30">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-ink-subtle">
                  Next class
                </div>
                <div className="mt-0.5 text-sm font-medium text-ink">
                  {data.next_class.section_label} ·{" "}
                  {data.next_class.subject_name} ({data.next_class.subject_code})
                </div>
                <div className="text-xs text-ink-muted">
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
      <div className="flex flex-wrap gap-1 rounded-md bg-surface-subtle p-1 text-sm">
        {data.by_day.map((d) => (
          <button
            key={d.day_of_week}
            type="button"
            onClick={() => setSelectedDay(d.day_of_week)}
            className={
              "rounded-md px-3 py-1.5 font-medium transition " +
              (selectedDay === d.day_of_week
                ? "bg-surface-raised text-ink shadow-sm"
                : "text-ink-muted hover:bg-surface-hover")
            }
          >
            {d.day_label}
            {d.is_today && (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
            )}
            {d.items.length > 0 && (
              <span className="ml-1 text-[10px] text-ink-subtle">
                {d.items.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Calendar className="mr-2 inline h-4 w-4 text-brand-400" />
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
            <p className="text-sm text-ink-muted">
              No classes scheduled for {active?.day_label}.
            </p>
          ) : (
            <table className="min-w-full divide-y divide-surface-border text-sm">
              <thead className="text-left text-xs uppercase text-ink-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">P #</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Section</th>
                  <th className="px-3 py-2 font-medium">Subject</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
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
                        (now ? "bg-brand-500/10" : "")
                      }
                    >
                      <td className="px-3 py-2 font-mono text-ink">
                        {s.period_number}
                      </td>
                      <td className="px-3 py-2 font-mono text-ink-muted">
                        {shortTime(s.start_time)} – {shortTime(s.end_time)}
                        {now && (
                          <Badge tone="emerald" className="ml-2">
                            now
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-ink">{s.section_label}</td>
                      <td className="px-3 py-2 text-ink">
                        <div className="font-medium">{s.subject_name}</div>
                        <div className="font-mono text-xs text-ink-subtle">
                          {s.subject_code}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-muted">
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

      <p className="text-xs text-ink-subtle">
        Times are local. Free periods aren&apos;t shown.
      </p>
    </div>
  );
}
