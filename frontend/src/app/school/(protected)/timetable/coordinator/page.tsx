"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Select } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { hhmm } from "@/lib/dates";

const DAY_NAME: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

type PeriodCol = {
  period_number: number;
  label: string | null;
  start_time: string;
  end_time: string;
  is_break: boolean;
};
type Lesson = {
  subject_name: string;
  teacher_name: string | null;
  room_name: string | null;
};
type SectionRow = {
  section_id: number;
  label: string;
  lessons: Record<string, Lesson>;
};
type DayView = {
  day_of_week: number;
  periods: PeriodCol[];
  sections: SectionRow[];
};

/** One day across the whole school.
 *
 *  A teacher can already see their own week and an office can see one section.
 *  Nobody could see the floor — which is what you need to find a free teacher
 *  at short notice, or a room nobody is using.
 */
export default function CoordinatorViewPage() {
  const [day, setDay] = useState(() => {
    const js = new Date().getDay();
    const iso = js === 0 ? 7 : js;
    // Nobody wants to land on Sunday, so a weekend defaults to Monday.
    return iso > 5 ? 1 : iso;
  });
  const [data, setData] = useState<DayView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DayView>("/api/v1/school/timetable-gen/coordinator", {
        params: { day_of_week: day },
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [day]);

  const periods = data?.periods ?? [];
  const sections = data?.sections ?? [];
  const teaching = periods.filter((p) => !p.is_break);

  const filled = sections.reduce(
    (n, s) => n + teaching.filter((p) => s.lessons[String(p.period_number)]).length,
    0
  );
  const capacity = sections.length * teaching.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="The day across every section"
        subtitle="Who is teaching what, and where the gaps are."
        actions={
          <>
            <Select
              aria-label="Day"
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>
                  {DAY_NAME[d]}
                </option>
              ))}
            </Select>
            <Link href="/school/timetable">
              <Button variant="secondary">All timetables</Button>
            </Link>
          </>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sections" value={sections.length} />
        <StatCard label="Teaching periods" value={teaching.length} />
        <StatCard
          label="Lessons on"
          value={filled}
          hint={capacity ? `of ${capacity} possible` : undefined}
        />
        <StatCard
          label="Free slots"
          value={Math.max(capacity - filled, 0)}
          accent={capacity && filled < capacity ? "amber" : "emerald"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{DAY_NAME[day]}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {sections.length === 0 || periods.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-ink-muted">
              {periods.length === 0
                ? `No periods are set up for ${DAY_NAME[day]}.`
                : `Nothing is timetabled on ${DAY_NAME[day]} yet.`}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[860px] border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                    <th className="sticky left-0 z-10 w-36 border-b border-surface-border bg-surface-subtle px-4 py-3">
                      Section
                    </th>
                    {periods.map((p) => (
                      <th
                        key={p.period_number}
                        className="border-b border-surface-border px-3 py-3"
                      >
                        <div>P{p.period_number}</div>
                        <div className="font-normal normal-case tracking-normal text-ink-subtle">
                          {hhmm(p.start_time)}–{hhmm(p.end_time)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sections.map((s) => (
                    <tr key={s.section_id}>
                      <td className="sticky left-0 z-10 border-b border-surface-border bg-surface-raised px-4 py-2 font-bold text-ink">
                        <Link
                          href={`/school/timetable/setup?section=${s.section_id}`}
                          className="hover:text-brand-600 hover:underline"
                        >
                          {s.label}
                        </Link>
                      </td>
                      {periods.map((p) => {
                        if (p.is_break) {
                          return (
                            <td
                              key={p.period_number}
                              className="border-b border-surface-border bg-warning-bg px-3 py-2 text-center text-[11px] font-bold text-warning dark:bg-amber-500/15 dark:text-amber-200"
                            >
                              {p.label ?? "Break"}
                            </td>
                          );
                        }
                        const lesson = s.lessons[String(p.period_number)];
                        return (
                          <td
                            key={p.period_number}
                            className="border-b border-surface-border px-3 py-2 align-top"
                          >
                            {lesson ? (
                              <div className="rounded-lg bg-brand-50 px-2 py-1.5 dark:bg-brand-500/15">
                                <div className="font-bold text-brand-600 dark:text-brand-200">
                                  {lesson.subject_name}
                                </div>
                                <div className="text-[11px] text-ink-muted">
                                  {lesson.teacher_name ?? "no teacher"}
                                </div>
                                {lesson.room_name && (
                                  <div className="text-[11px] text-ink-subtle">
                                    {lesson.room_name}
                                  </div>
                                )}
                              </div>
                            ) : (
                              /* Visibly empty rather than blank, so a gap reads
                                 as a gap and not as a column that failed to
                                 load. */
                              <div className="rounded-lg border border-dashed border-surface-border px-2 py-1.5 text-center text-[11px] text-ink-subtle">
                                free
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
