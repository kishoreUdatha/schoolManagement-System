"use client";

import { useEffect, useState } from "react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { ReportShell, percentTone } from "@/components/reports/ReportShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { NoticeBox, Select, Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type TeacherRow = {
  user_id: number;
  name: string;
  role: string;
  subjects: number;
  class_teacher_of: number;
  syllabus_topics: number;
  syllabus_covered: number;
  syllabus_percent: number;
  marks_entered: number;
  homework_set: number;
  days_attendance_marked: number;
};
type TeacherActivity = {
  days: number;
  since: string;
  teachers: TeacherRow[];
};

const WINDOWS = [30, 90, 180, 365];

/** What each teacher has done lately.
 *
 *  Sorted by name, never by any of the counts. The moment this page picks an
 *  order it is a league table, and the figures cannot carry that weight.
 */
export default function TeacherActivityReportPage() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<TeacherActivity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api
      .get<TeacherActivity>("/api/v1/school/analytics/teacher-activity", { params: { days } })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [days]);

  const teachers = [...(data?.teachers ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  // Averaged over the people who have a syllabus at all: somebody with no
  // topics entered has not covered 0% of anything, and dragging the average
  // down with them would say something untrue about the school.
  const withSyllabus = teachers.filter((t) => t.syllabus_topics > 0);
  const averageCovered = withSyllabus.length
    ? Math.round(
        (withSyllabus.reduce((n, t) => n + t.syllabus_percent, 0) / withSyllabus.length) * 10
      ) / 10
    : null;

  const marks = teachers.reduce((n, t) => n + t.marks_entered, 0);
  const homework = teachers.reduce((n, t) => n + t.homework_set, 0);

  return (
    <ReportShell
      title="Teacher activity"
      subtitle="Classes held, syllabus covered, marks entered and homework set over the chosen window."
      error={error}
      actions={
        <Select
          aria-label="Window"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {WINDOWS.map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </Select>
      }
    >
      <NoticeBox>
        These are counts of work done, not a ranking and not an appraisal. Read them alongside what
        you already know about a person — a single ordered number would be taken as an assessment
        that these figures cannot support.
      </NoticeBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Teachers" value={teachers.length || "—"} />
        <StatCard
          label="Average syllabus covered"
          value={averageCovered === null ? "—" : `${averageCovered}%`}
          hint={
            withSyllabus.length && withSyllabus.length < teachers.length
              ? `${teachers.length - withSyllabus.length} with no syllabus entered`
              : undefined
          }
        />
        <StatCard label="Marks entered" value={marks} />
        <StatCard label="Homework set" value={homework} hint={data ? `since ${data.since}` : undefined} />
      </div>

      <ChartCard
        title="Syllabus covered"
        subtitle="Only teachers who have a syllabus entered against their subjects."
        empty={withSyllabus.length === 0 && "No syllabus has been entered for any subject yet."}
        height={Math.max(280, withSyllabus.length * 34)}
      >
        <BreakdownChart
          data={withSyllabus.map((t) => ({ name: t.name, Covered: t.syllabus_percent }))}
          x="name"
          layout="vertical"
          series={[{ key: "Covered", name: "Covered %" }]}
          xFormatter={(v) => `${v}%`}
        />
      </ChartCard>

      <Card>
        <CardHeader>
          <CardTitle>Teacher by teacher</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={[
              "Teacher",
              "Role",
              "Subjects",
              "Class teacher of",
              "Syllabus",
              "Marks entered",
              "Homework set",
              "Days marked",
            ]}
            empty={teachers.length === 0 && "No teachers on the roll yet."}
          >
            {teachers.map((t) => (
              <tr key={t.user_id}>
                <td className={tdStrong}>{t.name}</td>
                <td className={td}>{humanize(t.role)}</td>
                <td className={td}>{t.subjects || "—"}</td>
                <td className={td}>{t.class_teacher_of || "—"}</td>
                <td className={td}>
                  {t.syllabus_topics ? (
                    <span className="flex items-center gap-2">
                      {t.syllabus_covered} of {t.syllabus_topics}
                      <Badge tone={percentTone(t.syllabus_percent)}>{t.syllabus_percent}%</Badge>
                    </span>
                  ) : (
                    <span className="text-ink-subtle">None entered</span>
                  )}
                </td>
                <td className={td}>{t.marks_entered || "—"}</td>
                <td className={td}>{t.homework_set || "—"}</td>
                <td className={td}>{t.days_attendance_marked || "—"}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>
    </ReportShell>
  );
}
