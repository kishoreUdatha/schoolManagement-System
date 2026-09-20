"use client";

import { useEffect, useState } from "react";

import { BreakdownChart, ChartCard, TrendChart } from "@/components/charts/Charts";
import { SERIES } from "@/components/charts/theme";
import { CsvButton, ReportShell } from "@/components/reports/ReportShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="On the roll" value={data?.total_students ?? "—"} />
        <StatCard
          label="Boys / girls"
          value={data ? `${boys} / ${girls}` : "—"}
          hint={data && data.total_students > boys + girls ? `${data.total_students - boys - girls} not recorded` : undefined}
        />
        <StatCard label="Seats" value={data?.total_capacity || "Not set"} />
        <StatCard
          label="Of capacity"
          value={data?.total_capacity ? `${data.fill_percent}%` : "—"}
          accent={data && data.fill_percent > 100 ? "rose" : "brand"}
          hint={overfull.length ? `${overfull.length} section(s) over capacity` : undefined}
        />
      </div>

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
          <CardTitle>Section by section</CardTitle>
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
      </Card>
    </ReportShell>
  );
}
