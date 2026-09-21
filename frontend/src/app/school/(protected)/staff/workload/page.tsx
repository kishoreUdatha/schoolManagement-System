"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CalendarCheck, Gauge, Users } from "lucide-react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { PanelFooter, PersonCell, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type Row = {
  staff_id: number;
  user_id: number;
  full_name: string;
  employee_no: string;
  role: string;
  designation: string | null;
  periods_per_week: number;
  subjects_taught: number;
  sections_taught: number;
  class_teacher_of: { section_id: number; label: string }[];
  homework_set: number;
  marks_entered: number;
};
type Workload = {
  staff: Row[];
  count: number;
  teaching_count: number;
  median_periods: number;
  total_periods: number;
  without_timetable: number;
};

/** How the teaching is spread.
 *
 *  Nobody is flagged as overloaded. Twenty-four periods is punishing in one
 *  school and light in another, so a threshold here would be a number this
 *  screen invented about somebody else's staff room. The median is shown
 *  instead: it is a fact about these people rather than a target.
 */
export default function WorkloadPage() {
  const [data, setData] = useState<Workload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Workload>("/api/v1/school/staff-ops/workload")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const rows = data?.staff ?? [];
  // Heaviest first — the question this page gets opened for.
  const sorted = [...rows].sort((a, b) => b.periods_per_week - a.periods_per_week);
  const teaching = sorted.filter((r) => r.periods_per_week > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teacher workload"
        subtitle="Periods a week, counted off the timetable. Nothing here is stored, so it changes the moment a lesson moves."
      />
      <ErrorBox>{error}</ErrorBox>

      <StatStrip
        stats={[
          {
            label: "Teaching staff",
            value: data?.count ?? "—",
            note: data ? `${data.total_periods} periods a week between them` : undefined,
            icon: Users,
          },
          {
            label: "With a timetable",
            value: data?.teaching_count ?? "—",
            note: data ? `of ${data.count} on the staff list` : undefined,
            icon: CalendarCheck,
          },
          {
            label: "Median periods a week",
            value: data?.median_periods ?? "—",
            note: "Half are above this, half below",
            icon: Gauge,
          },
          {
            label: "No lessons timetabled",
            value: data?.without_timetable ?? "—",
            note: data ? "Nothing on the timetable for them" : undefined,
            icon: AlertTriangle,
          },
        ]}
      />

      <NoticeBox>
        These are counts, not a judgement. What a fair load looks like depends on
        the subject, the year group and everything else a person does — so the
        comparison offered is the median of this staff room, and the reading is
        left to you.
      </NoticeBox>

      <ChartCard
        title="Periods a week"
        subtitle="Heaviest first. The dashed reading to compare against is the median above."
        empty={teaching.length === 0 && "Nobody has lessons on the timetable yet."}
        height={Math.max(240, teaching.length * 34)}
      >
        <BreakdownChart
          data={teaching.map((r) => ({ label: r.full_name, periods: r.periods_per_week }))}
          x="label"
          layout="vertical"
          series={[{ key: "periods", name: "Periods a week" }]}
        />
      </ChartCard>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Everybody</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Heaviest first, including the people with nothing timetabled.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={[
              "Teacher",
              "Periods a week",
              "Subjects",
              "Sections",
              "Class teacher of",
              "Homework set",
              "Marks entered",
            ]}
            empty={rows.length === 0 && "No teaching staff on record yet."}
          >
            {sorted.map((r) => (
              <tr key={r.staff_id}>
                <td className={td}>
                  <Link href={`/school/staff/${r.staff_id}`} className="hover:underline">
                    <PersonCell
                      name={r.full_name}
                      sub={`${r.employee_no} · ${humanize(r.role)}`}
                    />
                  </Link>
                </td>
                <td className={tdStrong}>
                  {r.periods_per_week === 0 ? (
                    <Badge tone="neutral">None</Badge>
                  ) : (
                    r.periods_per_week
                  )}
                </td>
                <td className={td}>{r.subjects_taught}</td>
                <td className={td}>{r.sections_taught}</td>
                <td className={td}>
                  {r.class_teacher_of.length === 0
                    ? "—"
                    : r.class_teacher_of.map((c) => c.label).join(", ")}
                </td>
                <td className={td}>{r.homework_set}</td>
                <td className={td}>{r.marks_entered}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`Showing ${sorted.length} member${sorted.length === 1 ? "" : "s"} of staff`}
          right={data ? `${data.total_periods} periods a week in total` : undefined}
        />
      </Card>

      <p className="text-[12px] text-ink-subtle">
        A period during a break is not counted as a taught lesson.
      </p>
    </div>
  );
}
