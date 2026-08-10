"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Period = {
  id: number;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  label: string | null;
  is_break: boolean;
};

type Entry = {
  id: number;
  period_id: number;
  subject_name: string;
  subject_code: string;
  teacher_name: string | null;
};

type Timetable = {
  section_id: number;
  section_label: string | null;
  timetable_published_at: string | null;
  periods: Period[];
  entries: Entry[];
};

function trim(t: string) {
  return t?.slice(0, 5) ?? "";
}

export default function ChildTimetablePage() {
  const params = useParams<{ id: string }>();
  const [tt, setTt] = useState<Timetable | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Timetable>(`/api/v1/parent/me/children/${params.id}/timetable`)
      .then((r) => setTt(r.data))
      .catch((e) => setError(apiError(e)));
  }, [params.id]);

  const periodNumbers = useMemo(
    () =>
      Array.from(new Set(tt?.periods.map((p) => p.period_number) ?? [])).sort(
        (a, b) => a - b
      ),
    [tt]
  );
  const periodMatrix = useMemo(() => {
    const m: Record<string, Period | undefined> = {};
    tt?.periods.forEach((p) => {
      m[`${p.day_of_week}-${p.period_number}`] = p;
    });
    return m;
  }, [tt]);
  const entryByPeriod = useMemo(() => {
    const m = new Map<number, Entry>();
    tt?.entries.forEach((e) => m.set(e.period_id, e));
    return m;
  }, [tt]);

  return (
    <div className="space-y-4">
      <Link
        href={`/parent/children/${params.id}`}
        className="text-sm text-brand-700 hover:underline"
      >
        ← Back to child profile
      </Link>

      <h1 className="text-2xl font-bold text-slate-900">
        Timetable {tt?.section_label && `— ${tt.section_label}`}
      </h1>

      {error && (
        <Card className="p-4 text-sm text-slate-700">
          {error === "Timetable is not published yet"
            ? "The school hasn't published the timetable yet. Check back soon."
            : error}
        </Card>
      )}

      {tt && (
        <Card>
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                <th className="w-24 border-b border-slate-200 px-3 py-2 text-left">
                  Period
                </th>
                {DAYS.map((d) => (
                  <th
                    key={d}
                    className="border-b border-slate-200 px-3 py-2 text-left"
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periodNumbers.map((pn) => (
                <tr key={pn}>
                  <td className="border-b border-slate-100 px-3 py-2 font-mono text-xs text-slate-500">
                    P{pn}
                  </td>
                  {DAYS.map((_, i) => {
                    const day = i + 1;
                    const period = periodMatrix[`${day}-${pn}`];
                    if (!period)
                      return (
                        <td
                          key={day}
                          className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-300"
                        >
                          —
                        </td>
                      );
                    const entry = entryByPeriod.get(period.id);
                    return (
                      <td
                        key={day}
                        className="border-b border-slate-100 px-3 py-2"
                      >
                        <div className="text-[10px] font-mono text-slate-400">
                          {trim(period.start_time)} – {trim(period.end_time)}
                        </div>
                        {period.is_break ? (
                          <div className="mt-0.5 text-amber-700 font-semibold">
                            {period.label ?? "Break"}
                          </div>
                        ) : entry ? (
                          <>
                            <div className="mt-0.5 font-semibold text-slate-900">
                              {entry.subject_name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {entry.teacher_name ?? "TBD"}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-slate-300">free</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
