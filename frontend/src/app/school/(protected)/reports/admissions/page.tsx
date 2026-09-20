"use client";

import { useEffect, useState } from "react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { ReportShell } from "@/components/reports/ReportShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Applications" value={data?.total ?? "—"} />
        <StatCard label="Still in progress" value={data?.in_progress ?? "—"} accent="amber" />
        <StatCard label="Admitted" value={data?.admitted ?? "—"} accent="emerald" />
        <StatCard
          label="Conversion"
          value={data ? `${conversion}%` : "—"}
          hint={data ? `${data.admitted} of ${total} applications` : undefined}
        />
      </div>

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
          <CardTitle>Stage by stage</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
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
        </CardBody>
      </Card>
    </ReportShell>
  );
}
