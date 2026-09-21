"use client";

import { useEffect, useState } from "react";
import { BookOpen, ClipboardList, NotebookPen, Users } from "lucide-react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { ReportShell, percentTone } from "@/components/reports/ReportShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { NoticeBox, Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { FilterBar, PanelFooter, PersonCell, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

/** A select sized for the filter bar: same height as the search box, and no
 *  stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

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
    >
      {/* The window decides every count below it, so it is picked before the
          figures rather than beside the title. */}
      <FilterBar>
        <select
          aria-label="Window"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className={filterSelect}
        >
          {WINDOWS.map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
      </FilterBar>

      <NoticeBox>
        These are counts of work done, not a ranking and not an appraisal. Read them alongside what
        you already know about a person — a single ordered number would be taken as an assessment
        that these figures cannot support.
      </NoticeBox>

      {/* A restatement of the window, not a census of the school: these are
          the people and the work inside the chosen number of days. */}
      <StatStrip
        stats={[
          {
            label: "Teachers in view",
            value: teachers.length || "—",
            note: data ? `Last ${data.days} days, since ${data.since}` : undefined,
            icon: Users,
          },
          {
            label: "Average syllabus covered",
            value: averageCovered === null ? "—" : `${averageCovered}%`,
            note:
              withSyllabus.length && withSyllabus.length < teachers.length
                ? `${teachers.length - withSyllabus.length} with no syllabus entered`
                : undefined,
            icon: BookOpen,
          },
          {
            label: "Marks entered",
            value: marks,
            note: data ? `since ${data.since}` : undefined,
            icon: ClipboardList,
          },
          {
            label: "Homework set",
            value: homework,
            note: data ? `since ${data.since}` : undefined,
            icon: NotebookPen,
          },
        ]}
      />

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
          <div>
            <CardTitle>Teacher by teacher</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Sorted by name, never by any of the counts
              {data ? ` · last ${data.days} days` : ""}.
            </p>
          </div>
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
                <td className={tdStrong}>
                  <PersonCell name={t.name} />
                </td>
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
        <PanelFooter
          left={`Showing ${teachers.length} teacher(s)`}
          right={data ? `Last ${data.days} days, since ${data.since}` : undefined}
        />
      </Card>
    </ReportShell>
  );
}
