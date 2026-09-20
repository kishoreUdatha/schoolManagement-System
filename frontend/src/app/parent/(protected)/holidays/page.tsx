"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { HolidayCalendar, CalendarHoliday } from "@/components/HolidayCalendar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const typeTone = {
  national: "rose",
  school: "amber",
  vacation: "emerald",
} as const;

type Holiday = CalendarHoliday & { days: number; description: string | null };

export default function ParentHolidaysPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { data } = await api.get<Holiday[]>(
        "/api/v1/parent/school/holidays",
        { params: { year, month } }
      );
      setHolidays(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m += 12;
      y -= 1;
    } else if (m > 12) {
      m -= 12;
      y += 1;
    }
    setYear(y);
    setMonth(m);
  }

  return (
    <div className="space-y-6">
      <Link href="/parent" className="text-sm text-brand-700 hover:underline">
        ← Back to dashboard
      </Link>

      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">School holidays</h1>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => shiftMonth(-1)}>
          ← Prev
        </Button>
        <span className="text-base font-semibold text-slate-900">
          {MONTHS[month - 1]} {year}
        </span>
        <Button size="sm" variant="secondary" onClick={() => shiftMonth(1)}>
          Next →
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}

      <HolidayCalendar year={year} month={month} holidays={holidays} />

      {holidays.length > 0 && (
        <Card>
          <ul className="divide-y divide-slate-100 text-sm">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{h.name}</div>
                  <div className="text-xs text-slate-500">
                    {h.start_date === h.end_date
                      ? h.start_date
                      : `${h.start_date} → ${h.end_date}`}
                    {" · "}
                    {h.days} day{h.days === 1 ? "" : "s"}
                  </div>
                  {h.description && (
                    <div className="mt-1 text-xs text-slate-600">{h.description}</div>
                  )}
                </div>
                <Badge tone={typeTone[h.type]}>{h.type}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
