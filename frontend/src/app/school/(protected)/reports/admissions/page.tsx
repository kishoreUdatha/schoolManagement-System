"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Clock, GraduationCap, Percent } from "lucide-react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { ReportShell } from "@/components/reports/ReportShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type Funnel = {
  by_status: Record<string, number>;
  total: number;
  in_progress: number;
  admitted: number;
};

export default function AdmissionFunnelReportPage() {
  const [data, setData] = useState<Funnel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Funnel>("/api/v1/school/applications/funnel")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const stages = Object.entries(data?.by_status ?? {})
    .map(([status, count]) => ({ status, name: humanize(status), count }))
    .sort((a, b) => b.count - a.count);

  const total = data?.total ?? 0;
  const conversion = total > 0 ? Math.round(((data?.admitted ?? 0) / total) * 1000) / 10 : 0;
  const share = (count: number) => (total > 0 ? Math.round((count / total) * 1000) / 10 : 0);

  return (
    <ReportShell
      title="Admission funnel"
      subtitle="Applications by stage, and how many of them became students. These are applications rather than children — one child applying twice is two rows."
      error={error}
    >
      {/* No filter bar: the funnel endpoint takes no scope, so there is
          nothing to choose before the figures are computed. */}
      <StatStrip
        stats={[
          {
            label: "Applications in scope",
            value: data?.total ?? "—",
            note: data ? `${stages.length} stage(s)` : undefined,
            icon: ClipboardList,
          },
          {
            label: "Still in progress",
            value: data?.in_progress ?? "—",
            note: "Somebody has to move these",
            icon: Clock,
          },
          { label: "Admitted", value: data?.admitted ?? "—", icon: GraduationCap },
          {
            label: "Conversion",
            value: data ? `${conversion}%` : "—",
            note: data ? `${data.admitted} of ${total} applications` : undefined,
            icon: Percent,
          },
        ]}
      />

      <ChartCard
        title="Where the applications sit"
        subtitle="Largest stage first. A pile-up in the middle is a queue somebody has to clear."
        height={Math.max(220, stages.length * 36)}
        empty={stages.length === 0 && "No applications have been received yet."}
      >
        <BreakdownChart
          data={stages}
          x="name"
          layout="vertical"
          series={[{ key: "count", name: "Applications" }]}
        />
      </ChartCard>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Stage by stage</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Every application on record · largest stage first
            </p>
          </div>
        </CardHeader>
        <Table
          head={["Stage", "Applications", "Share"]}
          empty={stages.length === 0 && "No applications have been received yet."}
        >
          {stages.map((s) => (
            <tr key={s.status}>
              <td className={tdStrong}>{s.name}</td>
              <td className={td}>{s.count}</td>
              <td className={td}>{share(s.count)}%</td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`${stages.length} stage(s)`}
          right={data ? `${total} application(s)` : undefined}
        />
      </Card>
    </ReportShell>
  );
}
