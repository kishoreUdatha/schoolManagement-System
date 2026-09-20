"use client";

import { useEffect, useState } from "react";

import { BreakdownChart, ChartCard } from "@/components/charts/Charts";
import { SERIES } from "@/components/charts/theme";
import { ReportShell } from "@/components/reports/ReportShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, WarnBox, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type RouteRow = {
  route_id: number;
  route_name: string;
  vehicle: string | null;
  capacity: number;
  riders: number;
  free_seats: number;
  utilisation: number;
  over_capacity: boolean;
};
type Transport = {
  routes: RouteRow[];
  total_capacity: number;
  total_riders: number;
  utilisation: number;
  over_capacity: RouteRow[];
};

/** Seats bought against seats used.
 *
 *  Utilisation reads the opposite way round to the other reports here: a
 *  route at 100% is a bus with a child standing, not a job well done.
 */
function utilisationTone(route: RouteRow): "emerald" | "amber" | "rose" {
  if (route.over_capacity) return "rose";
  if (route.utilisation > 90) return "amber";
  return "emerald";
}

export default function TransportReportPage() {
  const [data, setData] = useState<Transport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Transport>("/api/v1/school/analytics/transport")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const routes = data?.routes ?? [];
  const over = data?.over_capacity ?? [];

  return (
    <ReportShell
      title="Transport utilisation"
      subtitle="How many children ride each route, against how many seats the vehicle on it has."
      error={error}
    >
      {over.length > 0 && (
        <WarnBox>
          {over.length === 1 ? "One route is" : `${over.length} routes are`} carrying more children
          than the vehicle seats: {over.map((r) => r.route_name).join(", ")}. This needs sorting
          today, not at the end of the term.
        </WarnBox>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Riders" value={data?.total_riders ?? "—"} />
        <StatCard
          label="Seats"
          value={data ? data.total_capacity || "Not set" : "—"}
          hint={data && !data.total_capacity ? "No vehicle capacities recorded" : undefined}
        />
        <StatCard
          label="Overall utilisation"
          value={data?.total_capacity ? `${data.utilisation}%` : "—"}
          accent={data && data.utilisation > 100 ? "rose" : "brand"}
        />
        <StatCard
          label="Routes over capacity"
          value={data ? over.length : "—"}
          accent={over.length ? "rose" : "emerald"}
        />
      </div>

      <ChartCard
        title="Route by route"
        subtitle="Riders against the seats still free on the same vehicle."
        empty={routes.length === 0 && "No routes have been set up yet."}
        height={Math.max(280, routes.length * 34)}
      >
        <BreakdownChart
          data={routes.map((r) => ({
            route_name: r.route_name,
            Riders: r.riders,
            "Free seats": r.free_seats,
          }))}
          x="route_name"
          layout="vertical"
          stacked
          series={[
            { key: "Riders", name: "Riders", color: SERIES[0] },
            { key: "Free seats", name: "Free seats", color: SERIES[7] },
          ]}
        />
      </ChartCard>

      <Card>
        <CardHeader>
          <CardTitle>Routes</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Route", "Vehicle", "Riders", "Seats", "Free", "Utilisation"]}
            empty={routes.length === 0 && "No routes have been set up yet."}
          >
            {routes.map((r) => (
              <tr key={r.route_id}>
                <td className={tdStrong}>{r.route_name}</td>
                <td className={td}>
                  {r.vehicle ?? <span className="text-ink-subtle">None assigned</span>}
                </td>
                <td className={tdStrong}>{r.riders}</td>
                <td className={td}>{r.capacity || "—"}</td>
                <td className={td}>{r.capacity ? r.free_seats : "—"}</td>
                <td className={td}>
                  {r.capacity ? (
                    <Badge tone={utilisationTone(r)}>{r.utilisation}%</Badge>
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
