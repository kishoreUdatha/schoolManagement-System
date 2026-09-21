"use client";

import { useEffect, useState } from "react";

import { CalendarDays, Droplet, GraduationCap, Users } from "lucide-react";

import { BreakdownChart, ChartCard, ShareChart } from "@/components/charts/Charts";
import { ReportShell } from "@/components/reports/ReportShell";
import { StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type LabelCount = { label: string; count: number };
type Demographics = {
  total: number;
  gender: LabelCount[];
  blood_group: LabelCount[];
  age: LabelCount[];
  recorded: { dob: number; gender: number; blood_group: number };
};

/** Gender, age and blood group across the school.
 *
 *  Each chart is paired with how many records it was actually built from.
 *  A blood group pie drawn from a third of the children looks exactly like
 *  one drawn from all of them, and a board return quoting the first without
 *  saying so is wrong in a way nobody can see.
 */
export default function DemographicsReportPage() {
  const [data, setData] = useState<Demographics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Demographics>("/api/v1/school/analytics/demographics")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const total = data?.total ?? 0;
  const coverage = (on: number) =>
    total === 0 || on >= total ? "Every child on the roll is counted." : `Drawn from ${on} of ${total} children; the rest have nothing on file.`;

  // "Not recorded" is a gap in the data, not a demographic, so it is kept out
  // of the share charts and reported as coverage instead.
  const known = (rows: LabelCount[]) => rows.filter((r) => r.label !== "Not recorded");

  const gender = known(data?.gender ?? []);
  const blood = known(data?.blood_group ?? []);
  const age = data?.age ?? [];

  return (
    <ReportShell
      title="Demographics"
      subtitle="Gender, age and blood group across the school, and how much of it is actually on file."
      error={error}
    >
      {/* No filter bar: the demographics endpoint takes no year, class or
          window — every child currently on the roll is in scope, and there is
          no filter state on this screen to move into one.

          The strip restates that scope rather than counting entities: how many
          children the figures below were drawn from, and how many of them
          actually have each field on file. A chart built from a third of the
          school looks exactly like one built from all of it. */}
      <StatStrip
        stats={[
          {
            label: "In scope",
            value: data?.total ?? "—",
            note: data ? "Every child currently on the roll" : undefined,
            icon: GraduationCap,
          },
          {
            label: "Date of birth on file",
            value: data?.recorded.dob ?? "—",
            note: data ? `of ${total} children` : undefined,
            icon: CalendarDays,
          },
          {
            label: "Gender on file",
            value: data?.recorded.gender ?? "—",
            note: data ? `of ${total} children` : undefined,
            icon: Users,
          },
          {
            label: "Blood group on file",
            value: data?.recorded.blood_group ?? "—",
            note: data ? `of ${total} children` : undefined,
            icon: Droplet,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Gender"
          subtitle={data ? coverage(data.recorded.gender) : undefined}
          empty={gender.length === 0 && "No gender has been recorded against any child yet."}
        >
          <ShareChart
            data={gender}
            nameKey="label"
            valueKey="count"
            centreValue={String(data?.recorded.gender ?? "")}
            centreLabel="students"
          />
        </ChartCard>

        <ChartCard
          title="Blood group"
          subtitle={data ? coverage(data.recorded.blood_group) : undefined}
          empty={blood.length === 0 && "No blood group has been recorded against any child yet."}
        >
          <ShareChart
            data={blood}
            nameKey="label"
            valueKey="count"
            centreValue={String(data?.recorded.blood_group ?? "")}
            centreLabel="students"
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Age"
        subtitle={data ? `Age in completed years today. ${coverage(data.recorded.dob)}` : undefined}
        empty={age.length === 0 && "No date of birth has been recorded against any child yet."}
      >
        <BreakdownChart data={age} x="label" series={[{ key: "count", name: "Students" }]} />
      </ChartCard>
    </ReportShell>
  );
}
