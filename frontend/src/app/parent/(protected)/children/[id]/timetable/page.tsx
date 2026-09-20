"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Field";
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
    <div className="space-y-6">
      <Link
        href={`/parent/children/${params.id}`}
        className="text-[13px] font-bold text-brand-600 hover:underline"
      >
        ← Back to child profile
      </Link>

      <PageHeader
        title="Timetable"
        subtitle={tt?.section_label ?? undefined}
      />

      {error && (
        <Card className="px-5 py-4 text-[13px] text-ink-muted">
          {error === "Timetable is not published yet"
            ? "The school hasn't published the timetable yet. Check back soon."
            : error}
        </Card>
      )}

      {tt && (
        <Card>
          <div className="overflow-x-auto">
          <table className="min-w-[720px] border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                <th className="w-24 border-b border-surface-border px-4 py-3">
                  Period
                </th>
                {DAYS.map((d) => (
                  <th
                    key={d}
                    className="border-b border-surface-border px-4 py-3"
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periodNumbers.map((pn) => (
                <tr key={pn}>
                  <td className="border-b border-surface-border px-4 py-2 text-[12px] font-bold tabular-nums text-ink-muted">
                    P{pn}
                  </td>
                  {DAYS.map((_, i) => {
                    const day = i + 1;
                    const period = periodMatrix[`${day}-${pn}`];
                    if (!period)
                      return (
                        <td
                          key={day}
                          className="border-b border-surface-border bg-surface-subtle px-4 py-2 text-center text-[12px] text-ink-subtle"
                        >
                          —
                        </td>
                      );
                    const entry = entryByPeriod.get(period.id);
                    return (
                      <td
                        key={day}
                        className="border-b border-surface-border px-4 py-2 align-top"
                      >
                        <div className="text-[10px] tabular-nums text-ink-subtle">
                          {trim(period.start_time)} – {trim(period.end_time)}
                        </div>
                        {period.is_break ? (
                          <div className="mt-1 inline-block rounded-md bg-[#FFF3D8] px-2 py-0.5 text-[12px] font-extrabold text-[#8E5C05] dark:bg-amber-500/15 dark:text-amber-200">
                            {period.label ?? "Break"}
                          </div>
                        ) : entry ? (
                          <>
                            <div className="mt-0.5 font-extrabold text-ink">
                              {entry.subject_name}
                            </div>
                            <div className="text-[11px] text-ink-muted">
                              {entry.teacher_name ?? "TBD"}
                            </div>
                          </>
                        ) : (
                          <div className="mt-0.5 text-[12px] text-ink-subtle">free</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </div>
  );
}
