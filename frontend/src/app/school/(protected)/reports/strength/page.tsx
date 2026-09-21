"use client";

import { useEffect, useState } from "react";

import { Armchair, GraduationCap, Percent, Users } from "lucide-react";

import { BreakdownChart, ChartCard, TrendChart } from "@/components/charts/Charts";
import { SERIES } from "@/components/charts/theme";
import { CsvButton, ReportShell } from "@/components/reports/ReportShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, td, tdStrong } from "@/components/ui/Field";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type SectionRow = {
  class_id: number;
  class_name: string;
  section_id: number;
  section_name: string;
  students: number;
  boys: number;
  girls: number;
  capacity: number;
  fill_percent: number;
};
type ClassRow = {
  class_id: number;
  class_name: string;
  students: number;
  boys: number;
  girls: number;
  capacity: number;
  sections: number;
};
type Strength = {
  academic_year_id: number | null;
  total_students: number;
  total_capacity: number;
  fill_percent: number;
  classes: ClassRow[];
  sections: SectionRow[];
  history: { academic_year_id: number; academic_year_name: string; students: number }[];
};

/** Roll numbers by class and section — the strength report a board asks for,
 *  with the years behind it so a fall is visible rather than inferred. */
export default function StrengthReportPage() {
  const [data, setData] = useState<Strength | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Strength>("/api/v1/school/analytics/strength")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const classes = data?.classes ?? [];
  const sections = data?.sections ?? [];
  const boys = classes.reduce((n, c) => n + c.boys, 0);
  const girls = classes.reduce((n, c) => n + c.girls, 0);

  // Oldest year first, so the line reads left to right as time does.
  const history = [...(data?.history ?? [])]
    .reverse()
    .concat(
      data ? [{ academic_year_id: -1, academic_year_name: "This year", students: data.total_students }] : []
    )
    .map((h) => ({ year: h.academic_year_name, students: h.students }));

  const overfull = sections.filter((s) => s.capacity > 0 && s.students > s.capacity);

  return (
    <ReportShell
      title="Student strength"
      subtitle="How many children are on the roll, where they sit, and how that compares with the room available."
      error={error}
      actions={<CsvButton path="strength.csv" />}
    >
      {/* No filter bar: the report is the current year's roll in full, so the
          strip restates how far that reaches rather than what was chosen. */}
      <StatStrip
        stats={[
          {
            label: "On the roll",
            value: data?.total_students ?? "—",
            note: data
              ? `${classes.length} class(es) · ${sections.length} section(s)`
              : undefined,
            icon: GraduationCap,
          },
          {
            label: "Boys / girls",
            value: data ? `${boys} / ${girls}` : "—",
            note:
              data && data.total_students > boys + girls
                ? `${data.total_students - boys - girls} not recorded`
                : undefined,
            icon: Users,
          },
          {
            label: "Seats",
            value: data?.total_capacity || "Not set",
            note: data && !data.total_capacity ? "No section capacities entered" : undefined,
            icon: Armchair,
          },
          {
            label: "Of capacity",
            value: data?.total_capacity ? `${data.fill_percent}%` : "—",
            note: overfull.length ? `${overfull.length} section(s) over capacity` : undefined,
            icon: Percent,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Class by class"
          subtitle="Boys and girls stacked, so the total and the split read at once."
          empty={classes.length === 0 && "No classes have been set up for this year."}
        >
          <BreakdownChart
            data={classes.map((c) => ({
              name: c.class_name,
              Boys: c.boys,
              Girls: c.girls,
            }))}
            x="name"
            stacked
            series={[
              { key: "Boys", name: "Boys", color: SERIES[0] },
              { key: "Girls", name: "Girls", color: SERIES[4] },
            ]}
          />
        </ChartCard>

        <ChartCard
          title="Year on year"
          subtitle="Total on the roll at the end of each academic year."
          empty={history.length < 2 && "This is the first year on record."}
        >
          <TrendChart data={history} x="year" series={[{ key: "students", name: "Students" }]} />
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Section by section</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Every section on the roll, against the seats it was given.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Class", "Section", "Students", "Boys", "Girls", "Seats", "Full"]}
            empty={sections.length === 0 && "No sections yet."}
          >
            {sections.map((s) => (
              <tr key={s.section_id}>
                <td className={tdStrong}>{s.class_name}</td>
                <td className={td}>{s.section_name}</td>
                <td className={tdStrong}>{s.students}</td>
                <td className={td}>{s.boys}</td>
                <td className={td}>{s.girls}</td>
                <td className={td}>{s.capacity || "—"}</td>
                <td className={td}>
                  {s.capacity ? (
                    <Badge tone={s.students > s.capacity ? "rose" : s.fill_percent >= 95 ? "amber" : "neutral"}>
                      {s.fill_percent}%
                    </Badge>
                  ) : (
                    <span className="text-ink-subtle">Not set</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`Showing ${sections.length} section(s) across ${classes.length} class(es)`}
          right={data ? `${data.total_students} on the roll` : undefined}
        />
      </Card>
    </ReportShell>
  );
}
