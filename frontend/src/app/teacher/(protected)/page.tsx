"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CheckInCard } from "@/components/CheckInCard";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type TodayClass = {
  period_id: number;
  period_number: number;
  start_time: string;
  end_time: string;
  section_id: number;
  section_label: string;
  subject_name: string;
  subject_code: string;
  is_break: boolean;
};

type ClassTeacherCard = {
  section_id: number;
  section_label: string;
  class_id: number;
  capacity: number;
};

type Dashboard = {
  today_iso_date: string;
  today_day_of_week: number;
  todays_classes: TodayClass[];
  class_teacher_of: ClassTeacherCard[];
  unread_notices: number;
};

export default function TeacherDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = auth.getUser();

  useEffect(() => {
    api
      .get<Dashboard>("/api/v1/teacher/dashboard")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  if (error)
    return (
      <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
    );
  if (!data) return <div className="text-sm text-ink-muted">Loading dashboard…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">
          Hello {user?.full_name?.split(" ").slice(-1)[0]}
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          {DAYS[data.today_day_of_week]} · {new Date(data.today_iso_date).toLocaleDateString()}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Today's classes"
          value={data.todays_classes.filter((c) => !c.is_break).length}
        />
        <StatCard
          label="Class teacher of"
          value={data.class_teacher_of.length}
          accent="brand"
        />
        <StatCard
          label="Unread notices"
          value={data.unread_notices}
          accent={data.unread_notices > 0 ? "amber" : "emerald"}
        />
      </div>

      <CheckInCard />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Today&apos;s timetable</CardTitle>
          </CardHeader>
          <CardBody>
            {data.todays_classes.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No classes today. Either it&apos;s a non-working day or the
                school timetable isn&apos;t set up yet for {DAYS[data.today_day_of_week]}.
              </p>
            ) : (
              <table className="min-w-full divide-y divide-surface-border text-[13px]">
                <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                  <tr>
                    <th className="py-2 font-medium">Slot</th>
                    <th className="py-2 font-medium">Time</th>
                    <th className="py-2 font-medium">Section</th>
                    <th className="py-2 font-medium">Subject</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {data.todays_classes.map((c) => (
                    <tr key={c.period_id} className="hover:bg-surface-subtle">
                      <td className="py-2 text-[12px] tabular-nums text-ink-muted">
                        P{c.period_number}
                      </td>
                      <td className="py-2">
                        {c.start_time} – {c.end_time}
                      </td>
                      <td className="py-2 font-medium text-ink">
                        {c.section_label}
                      </td>
                      <td className="py-2">
                        {c.is_break ? (
                          <Badge tone="amber">break</Badge>
                        ) : (
                          <>
                            {c.subject_name}{" "}
                            <span className="text-xs text-ink-muted">
                              ({c.subject_code})
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Class teacher of</CardTitle>
          </CardHeader>
          <CardBody>
            {data.class_teacher_of.length === 0 ? (
              <p className="text-sm text-ink-muted">
                You haven&apos;t been assigned as class teacher of any section.
                Your admin can do this from <em>Classes → Edit section</em>.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.class_teacher_of.map((s) => (
                  <li
                    key={s.section_id}
                    className="flex items-center justify-between rounded-md bg-surface-subtle px-3 py-2"
                  >
                    <span className="font-medium text-ink">
                      {s.section_label}
                    </span>
                    <span className="text-xs text-ink-muted">
                      capacity {s.capacity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Coming soon
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <PlaceholderCard
            title="Mark attendance"
            note="Story 3.3 — class teacher marks daily Present/Absent/Late."
          />
          <PlaceholderCard
            title="Assign homework"
            note="Story 3.5 — post homework to a class-subject."
          />
          <PlaceholderCard
            title="Enter marks"
            note="Story 3.7 — exam marks + report card PDF."
          />
        </div>
      </div>
    </div>
  );
}

function PlaceholderCard({ title, note }: { title: string; note: string }) {
  return (
    <Card className="border-dashed">
      <CardBody>
        <div className="text-sm font-medium text-ink-muted">{title}</div>
        <div className="mt-2 text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink-subtle">—</div>
        <div className="mt-1 text-xs text-ink-subtle">{note}</div>
      </CardBody>
    </Card>
  );
}
